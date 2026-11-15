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
from .model import ALLOWED_WAREHOUSES, ExportDataError, aggregate_ostatok, build_items, render_xml, verify_quarantine
from .paradox import CENIC_SCHEMA, OSTATOK_SCHEMA, ParadoxError, ParadoxTable
from .preflight import PreflightError, check_items, check_xml_bytes
from .publish import FtpsPublisher, PublishError, make_tls_context, run_file_names
from .runtime import JsonLogger, LockBusy, SingleInstanceLock
from .snapshot import SnapshotError, prune_runs, take_stable_snapshot, utc_iso

EXIT_OK, EXIT_LOCKED, EXIT_CONFIG, EXIT_SNAPSHOT, EXIT_SOURCE, EXIT_PREFLIGHT, EXIT_PUBLISH, EXIT_INTERNAL = 0, 10, 20, 30, 40, 50, 60, 70
LAST_GOOD = 'last-good-manifest.json'
LAST_PUBLISHED = 'last-published-manifest.json'
# Which quarantine set the administrator was last told about. Governs ONLY alert de-duplication;
# it never influences stock values (quarantine is recomputed from the source on every run).
QUARANTINE_ALERT_STATE = 'quarantine-alert-state.json'
QUARANTINE_REMINDER_SECONDS = 24 * 3600

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
    quarantine = agg.quarantine_report()
    quarantine['exportedItems'] = verify_quarantine(items, agg.quarantine)
    return {'items': items, 'xml': render_xml(items), 'validation': {k: v[1] for k, v in tables.items()},
            'stock': agg.diagnostics(), 'build': diag, 'quarantine': quarantine}


def build_manifest(run_id: str, mode: str, result: dict, metrics: dict, snap: Optional[dict], xml_name: str,
                   run_started_at: Optional[str] = None) -> dict:
    xml = result['xml']
    files = (snap or {}).get('files', {})
    return {
        'schemaVersion': 1,
        'exporterVersion': __version__,
        'runId': run_id,
        'runStartedAt': run_started_at,
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
        'stockQuarantine': result['quarantine'],
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
    started, started_at = time.monotonic(), utc_iso()
    elapsed = lambda: round(time.monotonic() - started, 1)  # noqa: E731
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
        quarantine = result['quarantine']
        if quarantine['skuCount']:
            log('stock_quarantine', level='warning', skuCount=quarantine['skuCount'], maxSkus=quarantine['maxSkus'],
                exportedItems=quarantine['exportedItems'], skus=quarantine['skus'])

        stage = 'preflight'
        previous = _read_json(os.path.join(cfg.state_dir, LAST_GOOD))
        try:
            metrics = check_items(result['items'], result['build']['leadingZeroSkus'], cfg.thresholds, previous)
            check_xml_bytes(result['xml'], result['items'])
        except PreflightError as e:
            raise StageError(stage, EXIT_PREFLIGHT, '; '.join(e.failures))
        run_files = bool(cfg.publish and cfg.publish.layout == 'run-files')
        # Local outputs keep their fixed names; in run-files the manifest names the remote, run-unique XML.
        xml_name = cfg.publish.file_name if cfg.publish and not run_files else 'export.xml'
        manifest_name = cfg.publish.manifest_file_name if cfg.publish and not run_files else 'export.manifest.json'
        manifest = build_manifest(run_id, mode, result, metrics, snap,
                                  run_file_names(run_id)[0] if run_files else xml_name, started_at)
        log('export_preflight_completed', metrics=metrics, previousProductCount=(previous or {}).get('productCount'))
        if mode == 'publish' and quarantine['skuCount']:
            stage = 'quarantine_alert'
            _require_quarantine_alert(cfg, log, quarantine, credential_reader)
        if mode == 'dry-run':
            log('export_completed', mode=mode, published=False, xmlSha256=manifest['xmlSha256'], durationSeconds=elapsed())
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
                if run_files:
                    published = publisher.publish_run(run_id, xml_path, manifest_path, p.keep_remote_runs)
                else:
                    published = publisher.publish(xml_path, p.file_name, manifest_path, p.manifest_file_name)
            except (PublishError, SecretError, OSError) as e:
                raise StageError(stage, EXIT_PUBLISH, str(e))
            log('publish_completed', target=p.label, host=p.host, remoteDir=p.remote_dir, layout=p.layout, result=published,
                xmlSha256=manifest['xmlSha256'], generatedAt=manifest['generatedAt'])
            write_verified(os.path.join(cfg.state_dir, LAST_PUBLISHED), manifest_bytes)

        write_verified(os.path.join(cfg.state_dir, LAST_GOOD), manifest_bytes)
        if mode == 'publish' and not quarantine['skuCount']:
            _notify_quarantine_cleared(cfg, log, credential_reader)
        prune_runs(os.path.join(cfg.output_dir), cfg.keep_outputs)
        log('export_completed', mode=mode, published=mode == 'publish', xmlSha256=manifest['xmlSha256'], durationSeconds=elapsed(),
            productCount=manifest['productCount'], outputDir=out_dir)
        return EXIT_OK
    except StageError as e:
        _fail(cfg, log, e.stage, e.reason, credential_reader, duration=elapsed())
        return e.code
    except Exception as e:  # noqa: BLE001 - last line of defence, still fail closed
        _fail(cfg, log, stage, '%s: %s' % (e.__class__.__name__, e), credential_reader, traceback.format_exc(limit=5), elapsed())
        return EXIT_INTERNAL
    finally:
        prune_runs(os.path.join(cfg.work_dir, 'runs'), cfg.keep_runs)
        lock.release()


def _alert_type(cfg: Config) -> str:
    return (cfg.alerts or {}).get('type', 'none')


def _write_alert_state(cfg: Config, state: dict) -> None:
    write_verified(os.path.join(cfg.state_dir, QUARANTINE_ALERT_STATE), json.dumps(state, ensure_ascii=False).encode('utf-8'))


def _require_quarantine_alert(cfg: Config, log: JsonLogger, quarantine: dict, credential_reader) -> None:
    """Publishing a quarantined export requires that the administrator has been told about exactly
    this set of SKUs. New/changed set: the alert must be delivered first, otherwise nothing is
    published (fail closed, retried next run). Same set: a reminder every 24 h, best effort."""
    if _alert_type(cfg) == 'none':
        raise StageError('quarantine_alert', EXIT_PREFLIGHT,
                         'stock quarantine of %d SKU(s) (%s) requires a configured alert channel (alerts.type smtp|webhook); '
                         'nothing published' % (quarantine['skuCount'], ', '.join(s['sku'] for s in quarantine['skus'])))
    signature = sorted(s['sku'] for s in quarantine['skus'])
    state = _read_json(os.path.join(cfg.state_dir, QUARANTINE_ALERT_STATE)) or {}
    is_new = state.get('skus') != signature
    last = state.get('alertedAtEpoch')
    reminder_due = not isinstance(last, (int, float)) or time.time() - last >= QUARANTINE_REMINDER_SECONDS
    if not is_new and not reminder_due:
        log('quarantine_alert_skipped', reason='administrator already notified about this SKU set', skus=signature)
        return
    body = {'runId': log.run_id, 'at': utc_iso(), 'reminder': not is_new, 'skuCount': quarantine['skuCount'],
            'maxSkus': quarantine['maxSkus'], 'skus': quarantine['skus'],
            'effect': 'These SKUs are exported to Hairshop Pro with 0 stock in every warehouse (not orderable). '
                      'The rest of the catalog is exported normally. GrinS data was not changed.',
            'action': 'Correct the fractional Kolvo of these lots in GrinS. The quarantine lifts automatically '
                      'on the first export after the correction.'}
    try:
        build_alert(cfg.alerts, credential_reader).send(
            '[GrinsProExporter] stock quarantine: %d SKU(s) exported with 0 stock' % quarantine['skuCount'], body)
    except Exception as e:  # noqa: BLE001
        log('alert_failed', level='error', reason='%s: %s' % (e.__class__.__name__, str(e)[:200]))
        if is_new:
            raise StageError('quarantine_alert', EXIT_PREFLIGHT,
                             'stock quarantine alert could not be delivered; nothing published (retried next run)')
        return   # same set was already delivered earlier; a failed reminder does not stop the export
    _write_alert_state(cfg, {'skus': signature, 'alertedAt': utc_iso(), 'alertedAtEpoch': time.time(), 'runId': log.run_id})
    log('alert_sent', type=_alert_type(cfg), kind='stock_quarantine', reminder=not is_new, skus=signature)


def _notify_quarantine_cleared(cfg: Config, log: JsonLogger, credential_reader) -> None:
    """After a clean publish following a quarantine: tell the administrator once (best effort,
    retried on the next clean publish until delivered)."""
    state = _read_json(os.path.join(cfg.state_dir, QUARANTINE_ALERT_STATE)) or {}
    if not state.get('skus'):
        return
    try:
        build_alert(cfg.alerts, credential_reader).send(
            '[GrinsProExporter] stock quarantine cleared',
            {'runId': log.run_id, 'at': utc_iso(), 'previouslyQuarantined': state['skus'],
             'note': 'No SKU is quarantined any more; the exported stock is complete again.'})
        _write_alert_state(cfg, {'skus': [], 'clearedAt': utc_iso(), 'runId': log.run_id})
    except Exception as e:  # noqa: BLE001 - the export itself is already published and correct
        log('alert_failed', level='error', reason='%s: %s' % (e.__class__.__name__, str(e)[:200]))
        return
    log('alert_sent', type=_alert_type(cfg), kind='stock_quarantine_cleared', skus=state['skus'])


def _fail(cfg: Config, log: JsonLogger, stage: str, reason: str, credential_reader, tb: Optional[str] = None,
          duration: Optional[float] = None) -> None:
    log('export_failed', level='error', stage=stage, reason=reason, durationSeconds=duration, **({'traceback': tb} if tb else {}))
    body = {'runId': log.run_id, 'stage': stage, 'reason': reason, 'at': utc_iso(),
            'note': 'No new export was published completely; the previous complete export on the FTPS server is unchanged.'}
    try:
        build_alert(cfg.alerts, credential_reader).send('[GrinsProExporter] export failed at %s' % stage, body)
        if (cfg.alerts or {}).get('type', 'none') != 'none':
            log('alert_sent', type=cfg.alerts.get('type'))
    except Exception as e:  # noqa: BLE001 - alert problems never mask the failure itself
        log('alert_failed', level='error', reason='%s: %s' % (e.__class__.__name__, str(e)[:200]))
