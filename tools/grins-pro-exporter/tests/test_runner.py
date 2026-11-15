import io
import json
import os
import tempfile
import unittest
from unittest import mock

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

    def publish_run(self, run_id, xml_path, manifest_path, keep_remote_runs):
        if FakePublisher.fail:
            raise PublishError(FakePublisher.fail)
        with open(manifest_path, encoding='utf-8') as fh:
            FakePublisher.calls.append(('run-files', run_id, json.load(fh)['xmlFileName'], keep_remote_runs))
        return {'layout': 'run-files', 'pruned': [], 'pruneWarnings': 0}


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
        code, events, log = self.go(cfg, 'shadow')
        self.assertEqual(code, 0, events)
        self.assertIsInstance([e for e in log.events if e['event'] == 'export_completed'][0]['durationSeconds'], float)
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
        self.assertTrue(man['runStartedAt'].endswith('Z'))
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

    def test_publish_mode_run_files(self):
        cfg = self.cfg(mode='publish', publish={'host': 'ftps.example.lv', 'remoteDir': '/exporter-feed', 'credentialTarget': 'GrinsProExporter/ftps',
                                                'layout': 'run-files', 'keepRemoteRuns': 5})
        code, events, log = self.go(cfg, 'publish')
        self.assertEqual(code, 0, events)
        self.assertEqual(FakePublisher.calls, [('run-files', log.run_id, 'export-%s.xml' % log.run_id, 5)])
        out = os.path.join(cfg.output_dir, log.run_id)
        self.assertEqual(sorted(os.listdir(out)), ['export.manifest.json', 'export.xml'])   # local names unchanged
        done = [e for e in log.events if e['event'] == 'publish_completed'][0]
        self.assertEqual(done['layout'], 'run-files')
        with open(os.path.join(cfg.state_dir, runner.LAST_PUBLISHED), encoding='utf-8') as fh:
            self.assertEqual(json.load(fh)['xmlFileName'], 'export-%s.xml' % log.run_id)
        self.assertNotIn(SECRET, json.dumps(log.events))

    def test_shadow_with_run_files_config_never_publishes(self):
        cfg = self.cfg(publish={'host': 'h', 'remoteDir': '/exporter-feed', 'credentialTarget': 't', 'layout': 'run-files'})
        code, events, log = self.go(cfg, 'shadow')
        self.assertEqual(code, 0, events)
        self.assertEqual(FakePublisher.calls, [])
        self.assertNotIn('publish_completed', events)
        self.assertFalse(os.path.exists(os.path.join(cfg.state_dir, runner.LAST_PUBLISHED)))

    def test_run_files_publish_failure_fails_closed(self):
        cfg = self.cfg(mode='publish', publish={'host': 'h', 'credentialTarget': 't', 'layout': 'run-files'})
        FakePublisher.fail = 'remote export-x.xml already exists; refusing to overwrite'
        code, events, log = self.go(cfg, 'publish')
        self.assertEqual(code, runner.EXIT_PUBLISH)
        self.assertFalse(os.path.exists(os.path.join(cfg.state_dir, runner.LAST_PUBLISHED)))
        self.assertFalse(os.path.exists(os.path.join(cfg.state_dir, runner.LAST_GOOD)))

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


class FakeAlert:
    sent = []
    fail = False

    def send(self, subject, body):
        if FakeAlert.fail:
            raise AlertError('smtp down')
        FakeAlert.sent.append((subject, body))


class QuarantineRunnerTests(unittest.TestCase):
    """Stock quarantine end to end through runner.run (publish mode = what the GrinS task runs)."""

    PUBLISH = {'host': 'ftps.example.lv', 'remoteDir': '/exporter-feed', 'credentialTarget': 'GrinsProExporter/ftps',
               'layout': 'run-files'}
    ALERTS = {'type': 'smtp', 'host': 'smtp.example.lv', 'port': 587, 'from': 'a@example.lv', 'to': ['admin@example.lv'],
              'credentialTarget': 'GrinsProExporter/smtp'}

    tearDown, cfg, go, outputs = RunnerTests.tearDown, RunnerTests.cfg, RunnerTests.go, RunnerTests.outputs

    def source(self, fractional=('P00002',), extra=()):
        lots = [lot(1, '10000', 'P00001', 5), lot(2, '10001', 'P00002', 4)]
        lots += [lot(10 + i, '10000', s, 7.99) for i, s in enumerate(fractional)]
        lots += list(extra)
        write_snapshot(self.live, catalog(20), lots)

    def publish_cfg(self, alerts=True):
        return self.cfg(mode='publish', publish=self.PUBLISH, **({'alerts': self.ALERTS} if alerts else {}))

    def run_publish(self, cfg):
        FakeAlert.sent = []
        with mock.patch.object(runner, 'build_alert', lambda *_a, **_k: FakeAlert()):
            return self.go(cfg, 'publish')

    def manifest(self, cfg, log):
        with open(os.path.join(cfg.output_dir, log.run_id, 'export.manifest.json'), encoding='utf-8') as fh:
            return json.load(fh)

    def xml(self, cfg, log):
        with open(os.path.join(cfg.output_dir, log.run_id, 'export.xml'), 'rb') as fh:
            return fh.read()

    def state(self, cfg):
        with open(os.path.join(cfg.state_dir, runner.QUARANTINE_ALERT_STATE), encoding='utf-8') as fh:
            return json.load(fh)

    def setUp(self):
        RunnerTests.setUp(self)
        FakeAlert.sent, FakeAlert.fail = [], False

    def test_shadow_quarantines_logs_and_writes_manifest_without_alert(self):
        self.source()
        cfg = self.cfg()
        code, events, log = self.go(cfg, 'shadow')
        self.assertEqual(code, 0, events)
        self.assertIn('stock_quarantine', events)
        man = self.manifest(cfg, log)
        self.assertEqual(man['schemaVersion'], 1)                         # consumer contract unchanged
        self.assertEqual(man['exporterVersion'], '1.1.0')
        self.assertEqual(man['productCount'], 20)                         # SKU stays in the feed
        self.assertEqual(man['stockQuarantine']['skus'], [{'sku': 'P00002', 'lots': [{'warehouse': '10000', 'kolvo': '7.99'}]}])
        self.assertEqual(man['stats']['totalQuantity'], 5)                # P00002's integer 4 not exported
        self.assertIn(b'<sku>P00002</sku><code></code><title>Prece</title><capacity>1</capacity><price1>10</price1>'
                      b'<price2>8</price2><price3>5</price3><price4>0</price4><quantity>0</quantity>', self.xml(cfg, log))
        self.assertEqual(FakePublisher.calls, [])
        self.assertFalse(os.path.exists(os.path.join(cfg.state_dir, runner.QUARANTINE_ALERT_STATE)))

    def test_clean_source_has_empty_quarantine_section(self):
        self.source(fractional=())
        cfg = self.cfg()
        code, events, log = self.go(cfg, 'shadow')
        self.assertEqual(code, 0)
        self.assertNotIn('stock_quarantine', events)
        self.assertEqual(self.manifest(cfg, log)['stockQuarantine']['skuCount'], 0)

    def test_publish_without_alert_channel_fails_closed(self):
        self.source()
        cfg = self.publish_cfg(alerts=False)
        code, events, log = self.run_publish(cfg)
        self.assertEqual(code, runner.EXIT_PREFLIGHT)
        failed = [e for e in log.events if e['event'] == 'export_failed'][0]
        self.assertEqual(failed['stage'], 'quarantine_alert')
        self.assertIn('requires a configured alert channel', failed['reason'])
        self.assertIn('P00002', failed['reason'])
        self.assertEqual(FakePublisher.calls, [])
        self.assertEqual(self.outputs(cfg), [])
        self.assertFalse(os.path.exists(os.path.join(cfg.state_dir, runner.LAST_GOOD)))

    def test_publish_alerts_first_then_publishes_with_zero_stock(self):
        self.source()
        cfg = self.publish_cfg()
        code, events, log = self.run_publish(cfg)
        self.assertEqual(code, 0, events)
        self.assertEqual(len(FakeAlert.sent), 1)
        subject, body = FakeAlert.sent[0]
        self.assertIn('stock quarantine: 1 SKU', subject)
        self.assertEqual(body['skus'][0]['sku'], 'P00002')
        self.assertFalse(body['reminder'])
        self.assertLess(events.index('alert_sent'), events.index('publish_completed'))
        self.assertEqual(len(FakePublisher.calls), 1)
        self.assertEqual(self.state(cfg)['skus'], ['P00002'])
        self.assertIn(b'<quantity>0</quantity>', self.xml(cfg, log))
        self.assertNotIn(SECRET, json.dumps(log.events))

    def test_same_set_is_not_re_alerted_but_quarantine_is_reapplied(self):
        self.source()
        cfg = self.publish_cfg()
        self.assertEqual(self.run_publish(cfg)[0], 0)
        code, events, log = self.run_publish(cfg)
        self.assertEqual(code, 0, events)
        self.assertEqual(FakeAlert.sent, [])
        self.assertIn('quarantine_alert_skipped', events)
        self.assertEqual(self.manifest(cfg, log)['stockQuarantine']['skuCount'], 1)
        self.assertIn(b'<quantity>0</quantity>', self.xml(cfg, log))

    def test_alert_state_can_never_lift_the_quarantine(self):
        self.source()
        cfg = self.publish_cfg()
        os.makedirs(cfg.state_dir, exist_ok=True)
        runner._write_alert_state(cfg, {'skus': [], 'clearedAt': 'x'})    # tampered / stale state
        code, events, log = self.run_publish(cfg)
        self.assertEqual(code, 0, events)
        self.assertEqual(len(FakeAlert.sent), 1)                          # treated as a new set -> alert again
        self.assertEqual(self.manifest(cfg, log)['stats']['totalQuantity'], 5)
        runner._write_alert_state(cfg, {'skus': ['P00002'], 'alertedAtEpoch': 9e12})   # claims "already notified"
        code, events, log = self.run_publish(cfg)
        self.assertEqual(code, 0, events)
        self.assertEqual(self.manifest(cfg, log)['stockQuarantine']['skuCount'], 1)    # still quarantined
        self.assertEqual(self.manifest(cfg, log)['stats']['totalQuantity'], 5)

    def test_undeliverable_alert_for_new_set_publishes_nothing(self):
        self.source()
        cfg = self.publish_cfg()
        FakeAlert.fail = True
        code, events, log = self.run_publish(cfg)
        self.assertEqual(code, runner.EXIT_PREFLIGHT)
        self.assertIn('alert_failed', events)
        self.assertEqual([e for e in log.events if e['event'] == 'export_failed'][0]['stage'], 'quarantine_alert')
        self.assertEqual(FakePublisher.calls, [])
        self.assertFalse(os.path.exists(os.path.join(cfg.state_dir, runner.LAST_GOOD)))
        self.assertFalse(os.path.exists(os.path.join(cfg.state_dir, runner.QUARANTINE_ALERT_STATE)))
        FakeAlert.fail = False
        self.assertEqual(self.run_publish(cfg)[0], 0)                     # retried and delivered next run

    def test_failed_reminder_for_known_set_does_not_stop_export(self):
        self.source()
        cfg = self.publish_cfg()
        self.assertEqual(self.run_publish(cfg)[0], 0)
        state = self.state(cfg)
        state['alertedAtEpoch'] -= runner.QUARANTINE_REMINDER_SECONDS + 1
        runner._write_alert_state(cfg, state)
        FakeAlert.fail = True
        code, events, _ = self.run_publish(cfg)
        self.assertEqual(code, 0, events)
        self.assertIn('alert_failed', events)
        self.assertIn('publish_completed', events)
        FakeAlert.fail = False
        self.run_publish(cfg)
        self.assertTrue(FakeAlert.sent[0][1]['reminder'])                 # reminder retried and delivered

    def test_changed_set_alerts_again(self):
        self.source()
        cfg = self.publish_cfg()
        self.assertEqual(self.run_publish(cfg)[0], 0)
        self.source(fractional=('P00002', 'P00003'))
        self.assertEqual(self.run_publish(cfg)[0], 0)
        self.assertEqual(FakeAlert.sent[0][1]['skus'][1]['sku'], 'P00003')
        self.assertEqual(self.state(cfg)['skus'], ['P00002', 'P00003'])

    def test_corrected_source_lifts_quarantine_and_notifies_once(self):
        self.source()
        cfg = self.publish_cfg()
        self.assertEqual(self.run_publish(cfg)[0], 0)
        self.source(fractional=(), extra=[lot(10, '10000', 'P00002', 3)])   # operator corrected the lot in GrinS
        code, events, log = self.run_publish(cfg)
        self.assertEqual(code, 0, events)
        self.assertEqual(self.manifest(cfg, log)['stats']['totalQuantity'], 12)   # 5 + 4 + 3 (stays under preflight x3)
        self.assertEqual(FakeAlert.sent[0][0], '[GrinsProExporter] stock quarantine cleared')
        self.assertEqual(self.state(cfg)['skus'], [])
        self.run_publish(cfg)
        self.assertEqual(FakeAlert.sent, [])                              # only once

    def test_more_than_five_skus_fails_closed(self):
        self.source(fractional=['P%05d' % i for i in range(2, 8)])
        cfg = self.publish_cfg()
        code, events, log = self.run_publish(cfg)
        self.assertEqual(code, runner.EXIT_PREFLIGHT)
        failed = [e for e in log.events if e['event'] == 'export_failed'][0]
        self.assertEqual(failed['stage'], 'generate')
        self.assertIn('limit of 5', failed['reason'])
        self.assertEqual(FakePublisher.calls, [])


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
            raw = self.base(t)
            raw['publish'] = {'host': 'h', 'credentialTarget': 'x'}
            pub = parse_config(raw).publish
            self.assertEqual((pub.layout, pub.keep_remote_runs), ('fixed', 24))       # existing behaviour by default

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
            for k, v in (('outputDir', t), ('outputDir', os.path.join(t, 'workDir')),
                         ('logDir', os.path.join(t, 'outputDir', 'logs')), ('stateDir', os.path.join(t, 'workDir'))):
                bad = self.base(t)
                bad['paths'][k] = v
                with self.assertRaises(ConfigError):
                    parse_config(bad)                                    # working dirs must not overlap each other
            for key, holder in (('keepRuns', 'snapshot'), ('keepOutputs', None)):
                bad = self.base(t)
                (bad.setdefault(holder, {}) if holder else bad)[key] = 0
                with self.assertRaises(ConfigError):
                    parse_config(bad)                                    # keep 0 would delete the current run
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
            for extra in ({'layout': 'latest'}, {'layout': 'run-files', 'keepRemoteRuns': 2},
                          {'layout': 'run-files', 'keepRemoteRuns': 1001}, {'keepRemoteRuns': 'many'},
                          {'layout': 'run-files', 'requireRemoteSize': False}):
                bad = self.base(t)
                bad['publish'] = dict({'host': 'h', 'credentialTarget': 'x'}, **extra)
                with self.assertRaises(ConfigError, msg=str(extra)):
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

    def test_smtp_alert_implicit_tls_for_port_465(self):
        import ssl
        seen = {}

        class FakeSmtpSsl:
            def __init__(self, host, port, timeout, context):
                seen['host'] = (host, port)
                seen['verify'] = (context.verify_mode, context.check_hostname)

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def starttls(self, context):
                raise AssertionError('no STARTTLS on an implicit-TLS connection')

            def login(self, u, p):
                seen['login'] = (u, p)

            def send_message(self, msg):
                seen['msg'] = (msg['Subject'], msg['From'], msg['To'])

        def no_plain(*_a, **_k):
            raise AssertionError('plain SMTP must not be used in implicit mode')

        a = SmtpAlert('mail.example.lv', 465, 'sales@example.lv', ['info@example.lv'], lambda: creds('smtp'),
                      smtp_factory=no_plain, ssl_factory=FakeSmtpSsl, tls='implicit')
        a.send('[GrinsProExporter] stock quarantine: 1 SKU(s) exported with 0 stock', {'skus': []})
        self.assertEqual(seen['host'], ('mail.example.lv', 465))
        self.assertEqual(seen['verify'], (ssl.CERT_REQUIRED, True))
        self.assertEqual(seen['login'], ('user', SECRET))
        self.assertEqual(seen['msg'][1:], ('sales@example.lv', 'info@example.lv'))
        with self.assertRaises(AlertError):
            SmtpAlert('h', 465, 'f', ['t'], lambda: creds('smtp'), tls='none')
        cfg = {'type': 'smtp', 'host': 'h', 'port': 465, 'from': 'f', 'to': ['t'], 'credentialTarget': 'c'}
        self.assertEqual(build_alert(cfg, creds).tls, 'starttls')                  # default unchanged
        self.assertEqual(build_alert(dict(cfg, tls='implicit'), creds).tls, 'implicit')
        with self.assertRaises(AlertError):
            build_alert(dict(cfg, tls='plain'), creds)

    def test_build_alert(self):
        self.assertEqual(build_alert(None, creds).kind, 'none')
        with self.assertRaises(AlertError):
            build_alert({'type': 'smtp'}, creds)
        with self.assertRaises(AlertError):
            build_alert({'type': 'pager', 'credentialTarget': 'x'}, creds)


if __name__ == '__main__':
    unittest.main()
