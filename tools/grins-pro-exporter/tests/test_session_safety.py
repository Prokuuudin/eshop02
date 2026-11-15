"""What each operator command touches (GRINS_SHADOW_RUN_PLAN.md relies on these facts).

End-to-end through the CLI (`__main__.main`) on synthetic Paradox tables in a temp "live" directory:
live files are only ever opened 'rb', nothing below the live directory is created/changed/removed,
no FTPS connection is ever attempted outside publish mode, and each command writes only where stated.
"""
import builtins
import contextlib
import ftplib
import hashlib
import io
import json
import os
import shutil
import tempfile
import unittest
import uuid
from unittest import mock

from grins_pro_exporter.__main__ import main

from fixtures import catalog, lot, write_snapshot


def tree_state(root):
    state = {}
    for dirpath, dirnames, filenames in os.walk(root):
        for d in dirnames:
            state[os.path.relpath(os.path.join(dirpath, d), root)] = 'dir'
        for f in filenames:
            p = os.path.join(dirpath, f)
            st = os.stat(p)
            with open(p, 'rb') as fh:
                state[os.path.relpath(p, root)] = (st.st_size, st.st_mtime_ns, hashlib.sha256(fh.read()).hexdigest())
    return state


def listing(root):
    if not os.path.isdir(root):
        return None
    return sorted(os.path.relpath(os.path.join(d, f), root) for d, _, fs in os.walk(root) for f in fs)


class SessionSafetyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        t = self.tmp.name
        self.live = os.path.join(t, 'Grins', 'Sklad', 'DB')
        write_snapshot(self.live, catalog(20), [lot(1, '10000', 'P00001', 5), lot(2, '10010', 'P00001', 7)])
        with open(os.path.join(self.live, 'CENIC.PX'), 'wb') as fh:   # companion file the exporter must ignore
            fh.write(b'\0' * 4096)
        self.app = os.path.join(t, 'GrinsProExporter')
        self.dirs = {k: os.path.join(self.app, v) for k, v in
                     (('workDir', 'work'), ('outputDir', 'out'), ('logDir', 'logs'), ('stateDir', 'state'))}
        self.raw = {'mode': 'shadow', 'source': {'dbPath': self.live}, 'paths': self.dirs,
                    'snapshot': {'pauseBetweenCopiesSeconds': 0, 'retryDelaySeconds': 0}, 'preflight': {'minProducts': 10},
                    'alerts': {'type': 'none'}}
        self.live_before = tree_state(self.live)

    def tearDown(self):
        self.tmp.cleanup()

    def write_config(self, **over):
        raw = json.loads(json.dumps(self.raw))
        raw.update(over)
        os.makedirs(self.app, exist_ok=True)
        path = os.path.join(self.app, 'config.json')
        with open(path, 'w', encoding='utf-8') as fh:
            json.dump(raw, fh)
        return path

    def cli(self, *argv):
        """Run the CLI, recording every open() of a live file and refusing any FTPS connection."""
        opened = []
        real_open = builtins.open
        live = os.path.normcase(os.path.realpath(self.live))

        def spy_open(file, mode='r', *a, **k):
            if isinstance(file, (str, bytes, os.PathLike)):
                p = os.path.normcase(os.path.realpath(os.fsdecode(file)))
                if p == live or p.startswith(live + os.sep):
                    opened.append((os.path.basename(p), mode))
            return real_open(file, mode, *a, **k)

        def no_network(*a, **k):
            raise AssertionError('network connection attempted')

        out, err = io.StringIO(), io.StringIO()
        with mock.patch('builtins.open', spy_open), mock.patch.object(ftplib.FTP, 'connect', no_network), \
                contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = main(list(argv))
        return code, out.getvalue(), err.getvalue(), opened

    def assert_live_untouched(self, opened):
        self.assertEqual(tree_state(self.live), self.live_before)
        self.assertTrue(all(mode == 'rb' for _, mode in opened), opened)
        self.assertTrue({name.upper() for name, _ in opened} <= {'CENIC.DB', 'OSTATOK.DB'}, opened)

    def test_check_config_reads_only_metadata_and_creates_only_the_log_dir(self):
        cfg = self.write_config()
        code, out, _, opened = self.cli('--config', cfg, 'check-config')
        self.assertEqual(code, 0, out)
        report = json.loads(out)
        self.assertEqual(report['checks'], {'CENIC.DB': 'ok', 'OSTATOK.DB': 'ok'})
        self.assertFalse(report['publishConfigured'])
        self.assertEqual(opened, [])                                  # no live file content is opened
        self.assertEqual(listing(self.dirs['logDir']), [])            # created, but empty
        for k in ('workDir', 'outputDir', 'stateDir'):
            self.assertFalse(os.path.exists(self.dirs[k]), k)
        self.assert_live_untouched(opened)

    def test_check_config_without_ftps_credential_fails_cleanly_and_offline(self):
        target = 'GrinsProExporter/test-absent-%s' % uuid.uuid4().hex
        cfg = self.write_config(publish={'host': 'ftps.example.invalid', 'remoteDir': '/x', 'credentialTarget': target})
        code, out, _, opened = self.cli('--config', cfg, 'check-config')
        self.assertEqual(code, 20, out)
        self.assertTrue(json.loads(out)['checks']['credential:' + target].startswith('FAIL'))
        self.assert_live_untouched(opened)

    def test_check_config_missing_source_file(self):
        os.remove(os.path.join(self.live, 'OSTATOK.DB'))
        self.live_before = tree_state(self.live)
        code, out, _, opened = self.cli('--config', self.write_config(), 'check-config')
        self.assertEqual(code, 20, out)
        self.assertTrue(json.loads(out)['checks']['OSTATOK.DB'].startswith('FAIL'))
        self.assert_live_untouched(opened)

    def test_missing_source_directory_is_a_config_check_failure(self):
        shutil.rmtree(self.live)
        code, out, _, _ = self.cli('--config', self.write_config(), 'check-config')
        self.assertEqual(code, 20, out)

    def test_dry_run_copies_snapshot_but_writes_no_export(self):
        code, _, err, opened = self.cli('--config', self.write_config(), 'run', '--dry-run')
        self.assertEqual(code, 0, err)
        self.assert_live_untouched(opened)
        self.assertEqual(sorted(n.upper() for n, _ in opened), ['CENIC.DB', 'CENIC.DB', 'OSTATOK.DB', 'OSTATOK.DB'])  # A + B
        self.assertEqual(listing(self.dirs['outputDir']), None)       # no XML / manifest
        self.assertEqual(listing(self.dirs['stateDir']), ['exporter.lock', 'exporter.lock.json'])  # no last-good
        runs = listing(os.path.join(self.dirs['workDir'], 'runs'))
        self.assertEqual(sorted(os.path.basename(p) for p in runs), ['CENIC.DB', 'OSTATOK.DB'])  # snapshot copy kept
        self.assertEqual(len(listing(self.dirs['logDir'])), 1)

    def test_shadow_writes_local_export_and_never_connects_even_with_publish_config(self):
        cfg = self.write_config(mode='publish', publish={'host': 'ftps.example.invalid', 'remoteDir': '/x',
                                                         'credentialTarget': 'GrinsProExporter/never-read'})
        with mock.patch('grins_pro_exporter.runner.read_windows_credential',
                        side_effect=AssertionError('credential read in shadow')):
            code, _, err, opened = self.cli('--config', cfg, 'run', '--shadow')
        self.assertEqual(code, 0, err)
        self.assert_live_untouched(opened)
        out = listing(self.dirs['outputDir'])
        self.assertEqual(sorted(os.path.basename(p) for p in out), ['export.manifest.json', 'export.xml'])
        self.assertIn('last-good-manifest.json', listing(self.dirs['stateDir']))
        self.assertNotIn('last-published-manifest.json', listing(self.dirs['stateDir']))
        events = [json.loads(l)['event'] for l in err.splitlines() if l.startswith('{')]
        self.assertIn('export_completed', events)
        self.assertNotIn('publish_completed', events)

    def test_shipped_shadow_template_cannot_publish(self):
        from grins_pro_exporter.config import parse_config
        if os.name != 'nt':
            self.skipTest('Windows paths')
        path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'config.shadow.example.json')
        with open(path, encoding='utf-8') as fh:
            raw = json.load(fh)
        cfg = parse_config(raw)
        self.assertEqual(cfg.mode, 'shadow')
        self.assertIsNone(cfg.publish)
        self.assertEqual(cfg.source_db_path, os.path.normcase(os.path.realpath(r'C:\Grins\Sklad\DB')))
        data = os.path.normcase(r'C:\GrinsProExporter\data')
        for d in (cfg.work_dir, cfg.output_dir, cfg.log_dir, cfg.state_dir):   # the documented server layout
            self.assertEqual(os.path.dirname(d), data, d)

    def test_every_write_stays_inside_the_configured_dirs(self):
        """check-config, dry-run and shadow create/modify nothing outside workDir/outputDir/logDir/stateDir
        (the rest of the tree: live DB, app dir with config.json, unrelated siblings) and use no temp dir."""
        root = self.tmp.name
        os.makedirs(os.path.join(root, 'sibling'))
        with open(os.path.join(root, 'sibling', 'keep.txt'), 'w') as fh:
            fh.write('x')
        cfg = self.write_config()
        dirs = [os.path.normcase(os.path.realpath(d)) for d in self.dirs.values()]

        def outside(state):
            return {p: v for p, v in state.items()
                    if not any(os.path.normcase(os.path.realpath(os.path.join(root, p))) in (d,) or
                               os.path.normcase(os.path.realpath(os.path.join(root, p))).startswith(d + os.sep)
                               for d in dirs)}

        before = outside(tree_state(root))
        with mock.patch('tempfile.mkstemp', side_effect=AssertionError('temp file used')), \
                mock.patch('tempfile.mkdtemp', side_effect=AssertionError('temp dir used')):
            for argv in (('check-config',), ('run', '--dry-run'), ('run', '--shadow')):
                code, out, err, opened = self.cli('--config', cfg, *argv)
                self.assertEqual(code, 0, (argv, out, err))
                self.assert_live_untouched(opened)
        self.assertEqual(outside(tree_state(root)), before)

    def test_snapshot_failure_writes_no_export(self):
        os.remove(os.path.join(self.live, 'CENIC.DB'))
        self.live_before = tree_state(self.live)
        code, _, err, opened = self.cli('--config', self.write_config(), 'run', '--shadow')
        self.assertEqual(code, 30, err)
        self.assert_live_untouched(opened)
        self.assertEqual(listing(self.dirs['outputDir']), None)


if __name__ == '__main__':
    unittest.main()
