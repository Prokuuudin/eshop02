"""One exporter run: lock -> stable snapshot -> Paradox validation -> Pro XML -> preflight ->
local XML + manifest -> (publish mode only) atomic FTPS publication -> exit.

Main safety invariant: any failure at any stage leaves the last good export.xml on the FTPS
server untouched (nothing is uploaded before every check has passed, and the remote file is
only ever replaced by a server-side rename of a fully uploaded, size-verified .part file).
"""
from __future__ import annotations

import hashlib
import json
import os
import time
import traceback
from datetime import datetime, timezone
from typing import Callable, Optional

from . import __version__
from .alerts import build_alert
from .config import Config
from .credentials import Credential, SecretError, read_windows_credential
from .model import ALLOWED_WAREHOUSES, ExportDataError, aggregate_ostatok, build_items, render_xml
from .paradox import CENIC_SCHEMA, OSTATOK_SCHEMA, ParadoxError, ParadoxTable
from .preflight import PreflightError, check_items, check_xml_bytes
from .publish import FtpsPublisher, PublishError, make_tls_context
from .runtime import JsonLogger, LockBusy, SingleInstanceLock
from .snapshot import SnapshotError, prune_runs, take_stable_snapshot, utc_iso

EXIT_OK, EXIT_LOCKED, EXIT_CONFIG, EXIT_SNAPSHOT, EXIT_SOURCE, EXIT_PREFLIGHT, EXIT_PUBLISH, EXIT_INTERNAL = 0, 10, 20, 30, 40, 50, 60, 70
LAST_GOOD = 'last-good-manifest.json'
LAST_PUBLISHED = 'last-published-manifest.json'

WAREHOUSE_SLOTS = dict({str(i + 1): w for i, w in enumerate(ALLOWED_WAREHOUSES)}, **{'9': 'unused (always 0)'})


class StageError(Exception):
    def __init__(self, stage: str, code: int, reason: str):
        super().__init__(reason)
        self.stage, self.code, self.reason = stage, code, reason


def new_run_id() -> str:
    """Sortable and unique per run: UTC time to the microsecond + PID."""
    return '%s-%d' % (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'), os.getpid())


def host_timezone() -> dict:
    local = datetime.now().astimezone()
    off = local.utcoffset()
    minutes = int(off.total_seconds() // 60) if off else 0
    name = local.tzname() or ''
    return {'utcOffset': '%s%02d:%02d' % ('-' if minutes < 0 else '+', abs(minutes) // 60, abs(minutes) % 60),
            'utcOffsetMinutes': minutes, 'isDst': bool(time.localtime().tm_isdst > 0),
            'name': name if name.isascii() and '?' not in name else None}


def generate_from_dir(snapshot_dir: str) -> dict:
    """Validate both tables in snapshot_dir and build the Pro export (no I/O besides reading)."""
    tables = {}
    for name, schema in (('CENIC', CENIC_SCHEMA), ('OSTATOK', OSTATOK_SCHEMA)):
        t = ParadoxTable(os.path.join(snapshot_dir, name + '.DB'))
        tables[name] = (t, t.validate(schema))
    ost, cen = tables['OSTATOK'][0], tables['CENIC'][0]
    agg = aggregate_ostatok(ost.records(), ost.index)
    items, diag = build_items(cen.records(), cen.index, agg)
    return {'items': items, 'xml': render_xml(items), 'validation': {k: v[1] for k, v in tables.items()},
            'stock': agg.diagnostics(), 'build': diag}


def build_manifest(run_id: str, mode: str, result: dict, metrics: dict, snap: Optional[dict], xml_name: str) -> dict:
    xml = result['xml']
    files = (snap or {}).get('files', {})
    return {
        'schemaVersion': 1,
        'exporterVersion': __version__,
        'runId': run_id,
        'mode': mode,
        'generatedAt': utc_iso(),
        'generatedAtLocal': datetime.now().astimezone().isoformat(timespec='seconds'),
        'hostTimeZone': host_timezone(),
        'sourceSnapshotAt': (snap or {}).get('snapshotAt'),
        'sourceHashes': {n: f['sha256'] for n, f in files.items()},
        'sourceFiles': files,
        'sourceTables': result['validation'],
        'xmlFileName': xml_name,
        'xmlSha256': hashlib.sha256(xml).hexdigest(),
        'xmlSizeBytes': len(xml),
        'productCount': metrics['productCount'],
        'warehousePolicy': '10000-10007',
        'warehouseSlots': WAREHOUSE_SLOTS,
        'quantityPolicy': 'sum of warehouse slots 1-8 (10000-10007); 10008/10009/10010/2377/blank/unknown ignored',
        'stats': dict(metrics, **{'stock': result['stock'], 'build': result['build']}),
    }


def write_verified(path: str, data: bytes) -> None:
    """temp file -> flush -> fsync -> close -> re-read and compare -> atomic local rename."""
    tmp = path + '.tmp'
    if os.path.exists(tmp):
        os.remove(tmp)
    with open(tmp, 'xb') as fh:
        fh.write(data)
        fh.flush()
        os.fsync(fh.fileno())
    with open(tmp, 'rb') as fh:
        back = fh.read()
    if back != data:
        os.remove(tmp)
        raise OSError('local file %s does not read back identically' % tmp)
    os.replace(tmp, path)


def _read_json(path: str) -> Optional[dict]:
    try:
        with open(path, encoding='utf-8') as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def run(cfg: Config, mode: str, log: JsonLogger,
        credential_reader: Callable[[str], Credential] = read_windows_credential,
        publisher_factory: Optional[Callable[..., FtpsPublisher]] = None,
        snapshotter: Callable[..., dict] = take_stable_snapshot) -> int:
    """mode: 'dry-run' | 'shadow' | 'publish'."""
    run_id = log.run_id
    lock = SingleInstanceLock(cfg.state_dir)
    stage = 'lock'
    try:
        lock.acquire(run_id)
    except LockBusy as e:
        log('export_skipped', level='warning', stage=stage, reason=str(e))
        return EXIT_LOCKED
    run_dir = os.path.join(cfg.work_dir, 'runs', run_id)
    try:
        log('export_started', mode=mode, exporterVersion=__version__, source=cfg.source_db_path,
            hostTimeZone=host_timezone(), warehousePolicy='10000-10007')
        stage = 'snapshot'
        try:
            snap = snapshotter(cfg.source_db_path, run_dir, max_attempts=cfg.max_attempts, pause_seconds=cfg.pause_seconds,
                               retry_delay_seconds=cfg.retry_delay_seconds, log=log)
        except (SnapshotError, OSError) as e:
            raise StageError(stage, EXIT_SNAPSHOT, str(e))

        stage = 'paradox_validation'
        try:
            result = generate_from_dir(snap['dir'])
        except ParadoxError as e:
            raise StageError(stage, EXIT_SOURCE, str(e))
        except ExportDataError as e:
            raise StageError('generate', EXIT_PREFLIGHT, str(e))
        log('paradox_validation_completed', tables=result['validation'])
        log('export_generated', items=len(result['items']), xmlSizeBytes=len(result['xml']),
            xmlSha256=hashlib.sha256(result['xml']).hexdigest(), stock=result['stock'], build=result['build'])
        unknown = result['stock']['unknownWarehouseCodes']
        if unknown:
            with_stock = sorted(set(unknown) & set(result['stock']['ignoredPositiveQuantityByWarehouse']))
            log('unknown_warehouse_codes', level='warning' if with_stock else 'info', codes=unknown, codesWithStock=with_stock)
        if result['build']['allowedStockOnMisalignedCodes']:
            log('misaligned_stock_codes', level='warning', quantity=result['build']['allowedStockOnMisalignedCodes'])

        stage = 'preflight'
        previous = _read_json(os.path.join(cfg.state_dir, LAST_GOOD))
        try:
            metrics = check_items(result['items'], result['build']['leadingZeroSkus'], cfg.thresholds, previous)
            check_xml_bytes(result['xml'], result['items'])
        except PreflightError as e:
            raise StageError(stage, EXIT_PREFLIGHT, '; '.join(e.failures))
        xml_name = cfg.publish.file_name if cfg.publish else 'export.xml'
        manifest_name = cfg.publish.manifest_file_name if cfg.publish else 'export.manifest.json'
        manifest = build_manifest(run_id, mode, result, metrics, snap, xml_name)
        log('export_preflight_completed', metrics=metrics, previousProductCount=(previous or {}).get('productCount'))
        if mode == 'dry-run':
            log('export_completed', mode=mode, published=False, xmlSha256=manifest['xmlSha256'])
            return EXIT_OK

        stage = 'local_output'
        out_dir = os.path.join(cfg.output_dir, run_id)
        os.makedirs(out_dir, exist_ok=False)
        xml_path = os.path.join(out_dir, xml_name)
        manifest_path = os.path.join(out_dir, manifest_name)
        manifest_bytes = json.dumps(manifest, ensure_ascii=False, indent=2).encode('utf-8')
        try:
            write_verified(xml_path, result['xml'])
            write_verified(manifest_path, manifest_bytes)
        except OSError as e:
            raise StageError(stage, EXIT_INTERNAL, str(e))
        log('local_output_written', xml=xml_path, manifest=manifest_path)

        if mode == 'publish':
            stage = 'publish'
            p = cfg.publish
            if not p:
                raise StageError(stage, EXIT_CONFIG, 'publish mode without publish configuration')
            # Re-hash what will actually be uploaded: the local file must still be the validated export.
            with open(xml_path, 'rb') as fh:
                if hashlib.sha256(fh.read()).hexdigest() != manifest['xmlSha256']:
                    raise StageError(stage, EXIT_PUBLISH, 'local export.xml changed after validation; not publishing')
            try:
                cred = credential_reader(p.credential_target)
                factory = publisher_factory or FtpsPublisher
                publisher = factory(host=p.host, port=p.port, remote_dir=p.remote_dir, credential=cred,
                                    context=make_tls_context(p.ca_file), timeout=p.timeout_seconds,
                                    require_remote_size=p.require_remote_size, log=log)
                published = publisher.publish(xml_path, p.file_name, manifest_path, p.manifest_file_name)
            except (PublishError, SecretError, OSError) as e:
                raise StageError(stage, EXIT_PUBLISH, str(e))
            log('publish_completed', target=p.label, host=p.host, remoteDir=p.remote_dir, result=published,
                xmlSha256=manifest['xmlSha256'], generatedAt=manifest['generatedAt'])
            write_verified(os.path.join(cfg.state_dir, LAST_PUBLISHED), manifest_bytes)

        write_verified(os.path.join(cfg.state_dir, LAST_GOOD), manifest_bytes)
        prune_runs(os.path.join(cfg.output_dir), cfg.keep_outputs)
        log('export_completed', mode=mode, published=mode == 'publish', xmlSha256=manifest['xmlSha256'],
            productCount=manifest['productCount'], outputDir=out_dir)
        return EXIT_OK
    except StageError as e:
        _fail(cfg, log, e.stage, e.reason, credential_reader)
        return e.code
    except Exception as e:  # noqa: BLE001 - last line of defence, still fail closed
        _fail(cfg, log, stage, '%s: %s' % (e.__class__.__name__, e), credential_reader, traceback.format_exc(limit=5))
        return EXIT_INTERNAL
    finally:
        prune_runs(os.path.join(cfg.work_dir, 'runs'), cfg.keep_runs)
        lock.release()


def _fail(cfg: Config, log: JsonLogger, stage: str, reason: str, credential_reader, tb: Optional[str] = None) -> None:
    log('export_failed', level='error', stage=stage, reason=reason, **({'traceback': tb} if tb else {}))
    body = {'runId': log.run_id, 'stage': stage, 'reason': reason, 'at': utc_iso(),
            'note': 'Nothing was published; the previous export.xml on the FTPS server is unchanged.'}
    try:
        build_alert(cfg.alerts, credential_reader).send('[GrinsProExporter] export failed at %s' % stage, body)
        if (cfg.alerts or {}).get('type', 'none') != 'none':
            log('alert_sent', type=cfg.alerts.get('type'))
    except Exception as e:  # noqa: BLE001 - alert problems never mask the failure itself
        log('alert_failed', level='error', reason='%s: %s' % (e.__class__.__name__, str(e)[:200]))
