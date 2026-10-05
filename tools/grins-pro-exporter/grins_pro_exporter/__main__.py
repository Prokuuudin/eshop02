"""Command line.

  python -m grins_pro_exporter --config C:\\GrinsProExporter\\config.json run            # mode from config (default shadow)
  python -m grins_pro_exporter --config ... run --dry-run                               # snapshot+validate+preflight, writes no outputs
  python -m grins_pro_exporter --config ... run --shadow                                # forces shadow (local XML+manifest, never FTPS)
  python -m grins_pro_exporter --config ... check-config
  python -m grins_pro_exporter --config ... probe-ftps                                  # capability test with probe-* files only
  python -m grins_pro_exporter build --snapshot-dir DIR --out FILE [--manifest FILE]    # offline, from an existing snapshot copy
  python -m grins_pro_exporter compare --legacy A.xml --pro B.xml [--same-snapshot] [--report R.json]

Publishing happens only when the config says "mode": "publish" AND neither --dry-run nor --shadow
is given. Exit codes: 0 ok, 2 compare found suspicious differences, 10 skipped (another run holds
the lock), 20 config, 30 snapshot, 40 source validation, 50 data/preflight, 60 publish, 70 internal.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys

from . import __version__
from .config import ConfigError, load_config
from .runner import (EXIT_CONFIG, EXIT_INTERNAL, EXIT_OK, EXIT_PREFLIGHT, EXIT_PUBLISH, EXIT_SOURCE,
                     build_manifest, generate_from_dir, new_run_id, run, write_verified)
from .runtime import JsonLogger


def _print(obj) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False, indent=2, default=str) + '\n')


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog='grins_pro_exporter', description='GrinS -> Hairshop Pro exporter %s' % __version__)
    ap.add_argument('--config')
    sub = ap.add_subparsers(dest='cmd', required=True)
    r = sub.add_parser('run')
    g = r.add_mutually_exclusive_group()
    g.add_argument('--dry-run', action='store_true')
    g.add_argument('--shadow', action='store_true')
    sub.add_parser('check-config')
    sub.add_parser('probe-ftps')
    b = sub.add_parser('build')
    b.add_argument('--snapshot-dir', required=True)
    b.add_argument('--out', required=True)
    b.add_argument('--manifest')
    c = sub.add_parser('compare')
    c.add_argument('--legacy', required=True)
    c.add_argument('--pro', required=True)
    c.add_argument('--same-snapshot', action='store_true')
    c.add_argument('--report')
    a = ap.parse_args(argv)

    if a.cmd == 'compare':
        from .compare import compare
        with open(a.legacy, 'rb') as fh:
            legacy = fh.read()
        with open(a.pro, 'rb') as fh:
            pro = fh.read()
        rep = compare(legacy, pro, a.same_snapshot)
        if a.report:
            with open(a.report, 'w', encoding='utf-8') as fh:
                json.dump(rep, fh, ensure_ascii=False, indent=2)
        _print(rep)
        return EXIT_OK if rep['verdict'] == 'PASS' or (rep['verdict'] == 'REVIEW' and not a.same_snapshot) else 2

    if a.cmd == 'build':
        from .model import ExportDataError
        from .paradox import ParadoxError
        from .preflight import PreflightError, Thresholds, check_items, check_xml_bytes
        try:
            res = generate_from_dir(a.snapshot_dir)
        except ParadoxError as e:
            _print({'error': str(e)})
            return EXIT_SOURCE
        except ExportDataError as e:
            _print({'error': str(e)})
            return EXIT_PREFLIGHT
        try:
            metrics = check_items(res['items'], res['build']['leadingZeroSkus'], Thresholds(), None)
            check_xml_bytes(res['xml'], res['items'])
        except PreflightError as e:
            _print({'error': 'preflight', 'failures': e.failures})
            return EXIT_PREFLIGHT
        write_verified(os.path.abspath(a.out), res['xml'])
        if a.manifest:
            from .snapshot import REQUIRED_FILES, resolve_source_file, utc_iso
            files = {}
            for name in REQUIRED_FILES:
                path = resolve_source_file(a.snapshot_dir, name)
                with open(path, 'rb') as fh:
                    files[name] = {'sha256': hashlib.sha256(fh.read()).hexdigest(), 'sizeBytes': os.path.getsize(path),
                                   'sourceModifiedAt': utc_iso(os.path.getmtime(path))}
            m = build_manifest('offline-' + new_run_id(), 'build', res, metrics, {'files': files}, os.path.basename(a.out))
            write_verified(os.path.abspath(a.manifest), json.dumps(m, ensure_ascii=False, indent=2).encode('utf-8'))
        _print({'items': len(res['items']), 'bytes': len(res['xml']), 'sha256': hashlib.sha256(res['xml']).hexdigest(),
                'metrics': metrics, 'stock': res['stock'], 'build': res['build']})
        return EXIT_OK

    if not a.config:
        ap.error('--config is required for %s' % a.cmd)
    try:
        cfg = load_config(a.config)
    except ConfigError as e:
        sys.stderr.write('config error: %s\n' % e)
        return EXIT_CONFIG
    run_id = new_run_id()
    log = JsonLogger(cfg.log_dir, run_id)

    if a.cmd == 'check-config':
        from .credentials import SecretError, read_windows_credential
        from .snapshot import REQUIRED_FILES, SnapshotError, resolve_source_file
        report = {'mode': cfg.mode, 'source': cfg.source_db_path, 'publishConfigured': bool(cfg.publish),
                  'alerts': (cfg.alerts or {}).get('type', 'none'), 'checks': {}}
        ok = True
        for name in REQUIRED_FILES:
            try:
                resolve_source_file(cfg.source_db_path, name)
                report['checks'][name] = 'ok'
            except (SnapshotError, OSError) as e:
                report['checks'][name] = 'FAIL: %s' % e
                ok = False
        targets = ([cfg.publish.credential_target] if cfg.publish else []) + \
            ([cfg.alerts['credentialTarget']] if (cfg.alerts or {}).get('credentialTarget') else [])
        for t in targets:
            try:
                read_windows_credential(t)
                report['checks']['credential:' + t] = 'present'
            except SecretError as e:
                report['checks']['credential:' + t] = 'FAIL: %s' % e
                ok = False
        _print(report)
        return EXIT_OK if ok else EXIT_CONFIG

    if a.cmd == 'probe-ftps':
        if not cfg.publish:
            sys.stderr.write('config has no publish section\n')
            return EXIT_CONFIG
        from .credentials import SecretError, read_windows_credential
        from .publish import FtpsPublisher, PublishError, make_tls_context
        p = cfg.publish
        try:
            pub = FtpsPublisher(p.host, p.port, p.remote_dir, read_windows_credential(p.credential_target),
                                context=make_tls_context(p.ca_file), timeout=p.timeout_seconds,
                                require_remote_size=p.require_remote_size, log=log)
            res = pub.probe(run_id)
        except (PublishError, SecretError, OSError) as e:
            log('probe_failed', level='error', reason=str(e))
            return EXIT_PUBLISH
        log('probe_completed', result=res)
        return EXIT_OK if res.get('atomicPublishSupported') else EXIT_PUBLISH

    mode = 'dry-run' if a.dry_run else 'shadow' if a.shadow else cfg.mode
    try:
        return run(cfg, mode, log)
    except Exception as e:  # noqa: BLE001
        log('export_failed', level='error', stage='cli', reason=str(e))
        return EXIT_INTERNAL


if __name__ == '__main__':
    sys.exit(main())
