import ftplib
import os
import ssl
import tempfile
import unittest

from grins_pro_exporter.credentials import Credential
from grins_pro_exporter.publish import FtpsPublisher, PublishError, make_tls_context, validate_remote_dir, validate_remote_name

CRED = Credential('GrinsProExporter/ftps', 'prouser', 's3cr3t-pass')


class FakeFtp:
    """In-memory FTPS server double. `files` = remote directory contents."""

    def __init__(self, files=None, fail=None, size_override=None, rename_over_existing=True):
        self.files = dict(files or {})
        self.fail = fail or {}
        self.size_override = size_override or {}
        self.rename_over_existing = rename_over_existing
        self.cmds = []

    def __call__(self, **kw):
        self.kw = kw
        return self

    def connect(self, host, port):
        self.cmds.append(('connect', host, port))
        if 'connect' in self.fail:
            raise self.fail['connect']

    def auth(self):
        self.cmds.append(('auth',))
        if 'auth' in self.fail:
            raise self.fail['auth']

    def login(self, user, pw):
        self.cmds.append(('login', user))
        if 'login' in self.fail:
            raise self.fail['login']

    def prot_p(self):
        self.cmds.append(('prot_p',))

    def voidcmd(self, c):
        self.cmds.append(('voidcmd', c))

    def cwd(self, d):
        self.cmds.append(('cwd', d))

    def storbinary(self, cmd, fh):
        name = cmd.split(' ', 1)[1]
        self.cmds.append(('stor', name))
        if self.fail.get('stor') == name:
            self.files[name] = fh.read()[:5]
            raise ftplib.error_temp('451 transfer aborted')
        self.files[name] = fh.read()

    def size(self, name):
        if name not in self.files:
            raise ftplib.error_perm('550 no such file')
        return self.size_override.get(name, len(self.files[name]))

    def rename(self, a, b):
        self.cmds.append(('rename', a, b))
        if self.fail.get('rename') == a or (b in self.files and not self.rename_over_existing):
            raise ftplib.error_perm('553 file exists (user prouser pw s3cr3t-pass)')
        self.files[b] = self.files.pop(a)

    def delete(self, name):
        self.cmds.append(('delete', name))
        self.files.pop(name, None)

    def quit(self):
        self.cmds.append(('quit',))


class PublishTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.xml = os.path.join(self.tmp.name, 'export.xml')
        self.man = os.path.join(self.tmp.name, 'export.manifest.json')
        with open(self.xml, 'wb') as fh:
            fh.write(b'<root>new</root>')
        with open(self.man, 'wb') as fh:
            fh.write(b'{"new": true}')

    def tearDown(self):
        self.tmp.cleanup()

    def pub(self, ftp, **kw):
        return FtpsPublisher('ftps.example.lv', 21, '/pro', CRED, ftp_factory=ftp, **kw)

    def run_publish(self, ftp, **kw):
        return self.pub(ftp, **kw).publish(self.xml, 'export.xml', self.man, 'export.manifest.json')

    def test_atomic_sequence(self):
        ftp = FakeFtp({'export.xml': b'<root>old</root>'})
        self.run_publish(ftp)
        seq = [c for c in ftp.cmds if c[0] in ('auth', 'login', 'prot_p', 'stor', 'rename')]
        self.assertEqual(seq, [('auth',), ('login', 'prouser'), ('prot_p',),
                               ('stor', 'export.xml.part'), ('rename', 'export.xml.part', 'export.xml'),
                               ('stor', 'export.manifest.json.part'), ('rename', 'export.manifest.json.part', 'export.manifest.json')])
        self.assertNotIn(('stor', 'export.xml'), ftp.cmds)          # never written in place
        self.assertEqual(ftp.files['export.xml'], b'<root>new</root>')
        self.assertEqual(set(ftp.files), {'export.xml', 'export.manifest.json'})

    def test_failed_upload_keeps_old_export(self):
        ftp = FakeFtp({'export.xml': b'<root>old</root>'}, fail={'stor': 'export.xml.part'})
        with self.assertRaises(PublishError):
            self.run_publish(ftp)
        self.assertEqual(ftp.files, {'export.xml': b'<root>old</root>'})   # part cleaned up, old intact
        self.assertFalse(any(c[0] == 'rename' for c in ftp.cmds))

    def test_size_mismatch_keeps_old_export(self):
        ftp = FakeFtp({'export.xml': b'old'}, size_override={'export.xml.part': 3})
        with self.assertRaises(PublishError):
            self.run_publish(ftp)
        self.assertEqual(ftp.files, {'export.xml': b'old'})

    def test_no_size_support_fails_unless_allowed(self):
        class NoSize(FakeFtp):
            def size(self, name):
                raise ftplib.error_perm('502 SIZE not implemented')
        with self.assertRaises(PublishError):
            self.run_publish(NoSize({'export.xml': b'old'}))
        ftp = NoSize({'export.xml': b'old'})
        self.run_publish(ftp, require_remote_size=False)
        self.assertEqual(ftp.files['export.xml'], b'<root>new</root>')

    def test_failed_rename_keeps_old_export_and_redacts(self):
        ftp = FakeFtp({'export.xml': b'old'}, rename_over_existing=False)
        with self.assertRaises(PublishError) as ctx:
            self.run_publish(ftp)
        self.assertEqual(ftp.files, {'export.xml': b'old'})
        self.assertNotIn('s3cr3t-pass', str(ctx.exception))
        self.assertNotIn('prouser', str(ctx.exception))
        self.assertFalse(any(c == ('delete', 'export.xml') for c in ftp.cmds))   # no delete+rename fallback

    def test_tls_failure_publishes_nothing(self):
        ftp = FakeFtp({'export.xml': b'old'}, fail={'auth': ssl.SSLCertVerificationError('certificate has expired')})
        with self.assertRaises(PublishError) as ctx:
            self.run_publish(ftp)
        self.assertIn('TLS verification failed', str(ctx.exception))
        self.assertFalse(any(c[0] in ('login', 'stor') for c in ftp.cmds))

    def test_login_failure_redacted(self):
        ftp = FakeFtp(fail={'login': ftplib.error_perm('530 bad password s3cr3t-pass')})
        with self.assertRaises(PublishError) as ctx:
            self.run_publish(ftp)
        self.assertNotIn('s3cr3t-pass', str(ctx.exception))

    def test_tls_context_must_verify(self):
        ctx = make_tls_context()
        self.assertEqual(ctx.verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(ctx.check_hostname)
        self.assertGreaterEqual(ctx.minimum_version, ssl.TLSVersion.TLSv1_2)
        weak = ssl.create_default_context()
        weak.check_hostname = False
        weak.verify_mode = ssl.CERT_NONE
        with self.assertRaises(PublishError):
            FtpsPublisher('h', 21, '', CRED, context=weak)

    def test_remote_paths_validated(self):
        for bad in ('../etc', '/a/../b', 'a b', 'a;rm', 'C:\\x'):
            with self.assertRaises(PublishError):
                validate_remote_dir(bad)
        for bad in ('../x.xml', 'a/b.xml', '', '.', 'x y'):
            with self.assertRaises(PublishError):
                validate_remote_name(bad)
        self.assertEqual(validate_remote_dir('/hairshop-pro/feed'), '/hairshop-pro/feed')
        with self.assertRaises(PublishError):
            FtpsPublisher('h', 0, '', CRED)

    def test_probe_uses_publisher_algorithm_on_probe_files_only(self):
        ftp = FakeFtp({'export.xml': b'live', 'export.xml.part': b'stale part', 'export.manifest.json': b'{}'})
        ok = self.pub(ftp).probe('t1', self.tmp.name)
        self.assertTrue(ok['atomicPublishSupported'])
        self.assertEqual(ok['verdict'], 'FTPS ATOMIC PUBLISH: PASS')
        self.assertTrue(ok['sizeSupported'])
        touched = {c[1] for c in ftp.cmds if c[0] in ('stor', 'delete')} | {n for c in ftp.cmds if c[0] == 'rename' for n in c[1:]}
        self.assertTrue(all(n.startswith('probe-t1.txt') for n in touched), touched)
        self.assertEqual(ftp.files, {'export.xml': b'live', 'export.xml.part': b'stale part', 'export.manifest.json': b'{}'})
        renames = [c for c in ftp.cmds if c[0] == 'rename']
        self.assertEqual(renames, [('rename', 'probe-t1.txt.part', 'probe-t1.txt')] * 2)   # 2nd = over existing
        self.assertEqual(os.listdir(self.tmp.name), ['export.manifest.json', 'export.xml'])   # local probe files removed

    def test_probe_fails_when_server_cannot_replace_existing(self):
        bad_ftp = FakeFtp(rename_over_existing=False)
        bad = self.pub(bad_ftp).probe('t2', self.tmp.name)
        self.assertTrue(bad['renameNew'])
        self.assertFalse(bad['renameOverExisting'])
        self.assertEqual(bad['verdict'], 'FTPS ATOMIC PUBLISH: FAIL')
        self.assertEqual(bad_ftp.files, {})                     # probe cleans up after itself
        self.assertNotIn('s3cr3t-pass', str(bad))

    def test_probe_without_size_support_is_not_a_pass(self):
        class NoSize(FakeFtp):
            def size(self, name):
                raise ftplib.error_perm('502 SIZE not implemented')
        res = self.pub(NoSize(), require_remote_size=False).probe('t4', self.tmp.name)
        self.assertTrue(res['renameOverExisting'])
        self.assertFalse(res['sizeSupported'])
        self.assertEqual(res['verdict'], 'FTPS ATOMIC PUBLISH: FAIL')

    def test_probe_detects_silent_non_replacement(self):
        class KeepsOld(FakeFtp):
            def rename(self, a, b):                              # "succeeds" but keeps the old destination
                self.cmds.append(('rename', a, b))
                if b not in self.files:
                    self.files[b] = self.files[a]
                self.files.pop(a)
        res = self.pub(KeepsOld()).probe('t3', self.tmp.name)
        self.assertFalse(res['renameOverExisting'])
        self.assertIn('after rename', res['renameOverExistingError'])

    def test_credential_repr_hides_secret(self):
        self.assertNotIn('s3cr3t-pass', repr(CRED))
        self.assertNotIn('s3cr3t-pass', str(CRED))


if __name__ == '__main__':
    unittest.main()
