import io
import json
import os
import tempfile
import unittest

from grins_pro_exporter import runner
from grins_pro_exporter.alerts import AlertError, SmtpAlert, WebhookAlert, build_alert
from grins_pro_exporter.config import ConfigError, parse_config
from grins_pro_exporter.credentials import Credential, SecretError
from grins_pro_exporter.publish import PublishError
from grins_pro_exporter.runtime import JsonLogger, LockBusy, SingleInstanceLock

from fixtures import catalog, lot, write_snapshot

SECRET = 'top-secret-value'


def creds(target):
    if target == 'missing':
        raise SecretError('credential %r not found' % target)
    return Credential(target, 'user', SECRET)


class FakePublisher:
    calls = []
    fail = None

    def __init__(self, **kw):
        self.kw = kw

    def publish(self, xml_path, xml_name, manifest_path, manifest_name):
        if FakePublisher.fail:
            raise PublishError(FakePublisher.fail)
        with open(xml_path, 'rb') as fh:
            FakePublisher.calls.append((xml_name, fh.read()[:40], manifest_name))
        return {'xml': {'file': xml_name}, 'manifest': {'file': manifest_name}}


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        t = self.tmp.name
        self.live = os.path.join(t, 'live')
        write_snapshot(self.live, catalog(20), [lot(1, '10000', 'P00001', 5), lot(2, '10010', 'P00001', 7)])
        self.raw = {
            'mode': 'shadow', 'source': {'dbPath': self.live},
            'paths': {k: os.path.join(t, k) for k in ('workDir', 'outputDir', 'logDir', 'stateDir')},
            'snapshot': {'pauseBetweenCopiesSeconds': 0, 'retryDelaySeconds': 0},
            'preflight': {'minProducts': 10},
        }
        FakePublisher.calls, FakePublisher.fail = [], None

    def tearDown(self):
        self.tmp.cleanup()

    def cfg(self, **over):
        raw = json.loads(json.dumps(self.raw))
        raw.update(over)
        return parse_config(raw)

    def go(self, cfg, mode):
        log = JsonLogger(cfg.log_dir, runner.new_run_id(), stream=io.StringIO())
        code = runner.run(cfg, mode, log, credential_reader=creds, publisher_factory=FakePublisher)
        return code, [e['event'] for e in log.events], log

    def outputs(self, cfg):
        return os.listdir(cfg.output_dir) if os.path.isdir(cfg.output_dir) else []

    def test_shadow_writes_local_xml_and_manifest_never_publishes(self):
        cfg = self.cfg()
        code, events, _ = self.go(cfg, 'shadow')
        self.assertEqual(code, 0, events)
        for e in ('export_started', 'snapshot_started', 'snapshot_completed', 'paradox_validation_completed',
                  'export_generated', 'export_preflight_completed', 'export_completed'):
            self.assertIn(e, events)
        self.assertEqual(FakePublisher.calls, [])
        out = os.path.join(cfg.output_dir, self.outputs(cfg)[0])
        with open(os.path.join(out, 'export.manifest.json'), encoding='utf-8') as fh:
            man = json.load(fh)
        with open(os.path.join(out, 'export.xml'), 'rb') as fh:
            xml = fh.read()
        import hashlib
        self.assertEqual(man['xmlSha256'], hashlib.sha256(xml).hexdigest())
        self.assertEqual(man['productCount'], 20)
        self.assertEqual(man['warehousePolicy'], '10000-10007')
        self.assertTrue(man['generatedAt'].endswith('Z'))
        self.assertEqual(set(man['sourceHashes']), {'CENIC.DB', 'OSTATOK.DB'})
        self.assertEqual(man['stats']['totalQuantity'], 5)               # 10010 lot ignored
        self.assertIn(b'<quantity>5</quantity>', xml)
        self.assertTrue(os.path.exists(os.path.join(cfg.state_dir, runner.LAST_GOOD)))

    def test_dry_run_writes_no_outputs(self):
        cfg = self.cfg()
        code, events, _ = self.go(cfg, 'dry-run')
        self.assertEqual(code, 0)
        self.assertEqual(self.outputs(cfg), [])
        self.assertFalse(os.path.exists(os.path.join(cfg.state_dir, runner.LAST_GOOD)))

    def test_publish_mode(self):
        cfg = self.cfg(mode='publish', publish={'host': 'ftps.example.lv', 'remoteDir': '/pro', 'credentialTarget': 'GrinsProExporter/ftps'})
        code, events, log = self.go(cfg, 'publish')
        self.assertEqual(code, 0, events)
        self.assertEqual(FakePublisher.calls[0][0], 'export.xml')
        self.assertIn('publish_completed', events)
        self.assertTrue(os.path.exists(os.path.join(cfg.state_dir, runner.LAST_PUBLISHED)))
        self.assertNotIn(SECRET, json.dumps(log.events))

    def test_publish_failure_fails_closed_and_alerts(self):
        cfg = self.cfg(mode='publish', publish={'host': 'h', 'credentialTarget': 't'}, alerts={'type': 'webhook', 'credentialTarget': 'missing'})
        FakePublisher.fail = 'atomic rename refused'
        code, events, log = self.go(cfg, 'publish')
        self.assertEqual(code, runner.EXIT_PUBLISH)
        failed = [e for e in log.events if e['event'] == 'export_failed'][0]
        self.assertEqual(failed['stage'], 'publish')
        self.assertIn('alert_failed', events)                            # alert problem logged, failure not hidden
        self.assertFalse(os.path.exists(os.path.join(cfg.state_dir, runner.LAST_GOOD)))
        self.assertFalse(os.path.exists(os.path.join(cfg.state_dir, runner.LAST_PUBLISHED)))

    def test_missing_publish_secret_fails_closed(self):
        cfg = self.cfg(mode='publish', publish={'host': 'h', 'credentialTarget': 'missing'})
        code, _, _ = self.go(cfg, 'publish')
        self.assertEqual(code, runner.EXIT_PUBLISH)
        self.assertEqual(FakePublisher.calls, [])

    def test_preflight_failure_produces_nothing(self):
        cfg = self.cfg(preflight={'minProducts': 1000})
        code, events, log = self.go(cfg, 'shadow')
        self.assertEqual(code, runner.EXIT_PREFLIGHT)
        self.assertEqual(self.outputs(cfg), [])
        self.assertIn('product count 20 < minimum 1000', [e for e in log.events if e['event'] == 'export_failed'][0]['reason'])

    def test_drop_vs_last_good_fails(self):
        cfg = self.cfg()
        self.assertEqual(self.go(cfg, 'shadow')[0], 0)
        write_snapshot(self.live, catalog(15), [])
        code, _, log = self.go(cfg, 'shadow')
        self.assertEqual(code, runner.EXIT_PREFLIGHT)
        self.assertIn('dropped', [e for e in log.events if e['event'] == 'export_failed'][0]['reason'])

    def test_corrupted_source_fails_validation(self):
        with open(os.path.join(self.live, 'CENIC.DB'), 'r+b') as fh:
            fh.seek(4096 + 4)
            fh.write(bytes([7, 0]))            # corrupt the first block's record-area size
        code, _, _ = self.go(self.cfg(), 'shadow')
        self.assertEqual(code, runner.EXIT_SOURCE)

    def test_missing_source_fails_snapshot(self):
        os.remove(os.path.join(self.live, 'CENIC.DB'))
        code, _, _ = self.go(self.cfg(), 'shadow')
        self.assertEqual(code, runner.EXIT_SNAPSHOT)

    def test_lock_busy_skips(self):
        cfg = self.cfg()
        holder = SingleInstanceLock(cfg.state_dir)
        holder.acquire('other-run')
        try:
            code, events, _ = self.go(cfg, 'shadow')
        finally:
            holder.release()
        self.assertEqual(code, runner.EXIT_LOCKED)
        self.assertEqual(events, ['export_skipped'])
        self.assertEqual(self.go(cfg, 'shadow')[0], 0)                   # released lock is reusable

    def test_second_lock_instance_blocked(self):
        a, b = SingleInstanceLock(self.tmp.name), SingleInstanceLock(self.tmp.name)
        a.acquire('a')
        with self.assertRaises(LockBusy):
            b.acquire('b')
        a.release()
        b.acquire('b')
        b.release()


class ConfigTests(unittest.TestCase):
    def base(self, t):
        return {'source': {'dbPath': os.path.join(t, 'DB')},
                'paths': {k: os.path.join(t, k) for k in ('workDir', 'outputDir', 'logDir', 'stateDir')}}

    def test_defaults_are_safe(self):
        with tempfile.TemporaryDirectory() as t:
            cfg = parse_config(self.base(t))
            self.assertEqual(cfg.mode, 'shadow')
            self.assertIsNone(cfg.publish)
            self.assertEqual(cfg.thresholds.min_products, 14000)

    def test_rejections(self):
        with tempfile.TemporaryDirectory() as t:
            bad = self.base(t)
            bad['paths']['workDir'] = os.path.join(t, 'DB', 'work')
            with self.assertRaises(ConfigError):
                parse_config(bad)                                        # never write inside the live DB dir
            bad = self.base(t)
            bad['paths']['outputDir'] = 'relative'
            with self.assertRaises(ConfigError):
                parse_config(bad)
            bad = self.base(t)
            bad['mode'] = 'publish'
            with self.assertRaises(ConfigError):
                parse_config(bad)                                        # publish needs a publish section
            bad = self.base(t)
            bad['publish'] = {'host': 'h', 'credentialTarget': 'x', 'password': 'p'}
            with self.assertRaises(ConfigError):
                parse_config(bad)                                        # secrets never in the config
            bad = self.base(t)
            bad['publish'] = {'host': 'h', 'credentialTarget': 'x', 'remoteDir': '../up'}
            with self.assertRaises(ConfigError):
                parse_config(bad)
            bad = self.base(t)
            bad['mode'] = 'cutover'
            with self.assertRaises(ConfigError):
                parse_config(bad)


class AlertAndLogTests(unittest.TestCase):
    def test_log_redacts_secret_keys(self):
        s = io.StringIO()
        log = JsonLogger(None, 'r1', stream=s)
        log('x', password='p1', nested={'webhookUrl': 'https://x/token', 'ok': 1})
        self.assertNotIn('p1', s.getvalue())
        self.assertNotIn('token', s.getvalue())
        self.assertIn('"ok": 1', s.getvalue())

    def test_smtp_alert_uses_starttls_and_credential(self):
        seen = {}

        class FakeSmtp:
            def __init__(self, host, port, timeout):
                seen['host'] = (host, port)

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def starttls(self, context):
                seen['tls'] = context.verify_mode

            def login(self, u, p):
                seen['login'] = (u, p)

            def send_message(self, msg):
                seen['subject'] = msg['Subject']

        a = SmtpAlert('smtp.example.lv', 587, 'exporter@example.lv', ['ops@example.lv'], lambda: creds('smtp'), smtp_factory=FakeSmtp)
        a.send('[GrinsProExporter] export failed', {'stage': 'snapshot'})
        import ssl
        self.assertEqual(seen['tls'], ssl.CERT_REQUIRED)
        self.assertEqual(seen['login'], ('user', SECRET))

    def test_webhook_requires_https(self):
        with self.assertRaises(AlertError):
            WebhookAlert(lambda: Credential('w', 'u', 'http://insecure')).send('s', {})

    def test_build_alert(self):
        self.assertEqual(build_alert(None, creds).kind, 'none')
        with self.assertRaises(AlertError):
            build_alert({'type': 'smtp'}, creds)
        with self.assertRaises(AlertError):
            build_alert({'type': 'pager', 'credentialTarget': 'x'}, creds)


if __name__ == '__main__':
    unittest.main()
