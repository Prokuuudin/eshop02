import ftplib
import os
import socket
import ssl
import tempfile
import unittest

from grins_pro_exporter.credentials import Credential
from grins_pro_exporter.publish import (TLS_SHUTDOWN_WAIT_SECONDS, FtpsPublisher, PublishError, SessionReuseFTP_TLS,
                                        make_tls_context, plan_remote_prune, run_file_names, validate_remote_dir,
                                        validate_remote_name)

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
        if name in self.fail.get('delete', ()):
            raise ftplib.error_perm('550 Access is denied.')
        self.files.pop(name, None)

    def nlst(self, *args):
        self.cmds.append(('nlst',))
        return sorted(self.files)

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


IIS_UNWRAP_TIMEOUT = socket.timeout('The read operation timed out')


class FakeTlsDataConn:
    """TLS data channel double. The server stores what it received when the socket closes."""

    def __init__(self, on_close, send_error=None, unwrap_error=None):
        self.on_close, self.send_error, self.unwrap_error = on_close, send_error, unwrap_error
        self.sent = bytearray()
        self.timeout = 60
        self.unwrap_timeout = None
        self.unwrapped = self.closed = False

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def sendall(self, data):
        if self.send_error:
            self.sent += data[:2]
            raise self.send_error
        self.sent += data

    def settimeout(self, t):
        self.timeout = t

    def unwrap(self):
        self.unwrap_timeout = self.timeout
        if self.unwrap_error:
            raise self.unwrap_error
        self.unwrapped = True
        return self

    def close(self):
        if not self.closed:
            self.closed = True
            self.on_close(bytes(self.sent))


class IisLikeFtp(SessionReuseFTP_TLS):
    """The real SessionReuseFTP_TLS.storbinary over an in-memory server that behaves like the
    Hairshop Pro IIS FTP (2026-10-17): the data channel never answers close_notify, completion
    arrives as a control reply after the socket closes."""

    def __init__(self, files=None, reply='226 Successfully transferred "/exporter-feed/x"', drop_bytes=0,
                 send_error=None, unwrap_error=IIS_UNWRAP_TIMEOUT, replace_on_rename=True):
        super().__init__(context=make_tls_context(), timeout=60)
        self.replace_on_rename = replace_on_rename
        self.files = dict(files or {})
        self.reply, self.drop_bytes = reply, drop_bytes
        self.send_error, self.unwrap_error = send_error, unwrap_error
        self.cmds, self.conns = [], []

    def __call__(self, **kw):
        return self

    def connect(self, host, port):
        self.cmds.append(('connect', host, port))

    def auth(self):
        self.cmds.append(('auth',))

    def login(self, user, pw):
        self.cmds.append(('login', user))

    def prot_p(self):
        self.cmds.append(('prot_p',))

    def cwd(self, d):
        self.cmds.append(('cwd', d))

    def voidcmd(self, c):
        self.cmds.append(('voidcmd', c))
        return '200 Type set to I.'

    def transfercmd(self, cmd, rest=None):
        name = cmd.split(' ', 1)[1]
        self.cmds.append(('stor', name))

        def store(data):
            self.files[name] = data[:len(data) - self.drop_bytes]
        conn = FakeTlsDataConn(store, self.send_error, self.unwrap_error)
        self.conns.append(conn)
        return conn

    def getresp(self):
        if isinstance(self.reply, BaseException):
            raise self.reply
        return self.reply

    def size(self, name):
        if name not in self.files:
            raise ftplib.error_perm('550 The system cannot find the file specified.')
        return len(self.files[name])

    def rename(self, a, b):
        self.cmds.append(('rename', a, b))
        if b in self.files and not self.replace_on_rename:     # allowReplaceOnRename=false, as observed 2026-10-17
            raise ConnectionResetError(10054, 'An existing connection was forcibly closed by the remote host')
        self.files[b] = self.files.pop(a)

    def delete(self, name):
        self.cmds.append(('delete', name))
        self.files.pop(name, None)

    def nlst(self, *args):
        return sorted(self.files)

    def quit(self):
        self.cmds.append(('quit',))


class IisTlsShutdownTests(unittest.TestCase):
    """Regression: IIS never answers the client's TLS close_notify after STOR (L6, 2026-10-17)."""

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

    def publish(self, ftp):
        return FtpsPublisher('ftps.example.lv', 21, '/exporter-feed', CRED, ftp_factory=ftp).publish(
            self.xml, 'export.xml', self.man, 'export.manifest.json')

    def assert_old_export_kept(self, ftp):
        self.assertEqual(ftp.files, {'export.xml': b'<root>old</root>'})
        self.assertFalse(any(c[0] == 'rename' for c in ftp.cmds))

    def test_upload_completes_when_server_never_answers_close_notify(self):
        ftp = IisLikeFtp({'export.xml': b'<root>old</root>'})
        self.publish(ftp)
        self.assertEqual(ftp.files, {'export.xml': b'<root>new</root>', 'export.manifest.json': b'{"new": true}'})
        for conn in ftp.conns:
            self.assertEqual(conn.unwrap_timeout, TLS_SHUTDOWN_WAIT_SECONDS)   # close_notify sent, wait bounded
            self.assertTrue(conn.closed)

    def test_probe_passes_first_publication_and_replacement_on_iis(self):
        ftp = IisLikeFtp()
        res = FtpsPublisher('ftps.example.lv', 21, '/exporter-feed', CRED, ftp_factory=ftp).probe('t5', self.tmp.name)
        self.assertEqual(res['verdict'], 'FTPS ATOMIC PUBLISH: PASS')
        self.assertTrue(res['renameNew'] and res['renameOverExisting'] and res['sizeSupported'])
        self.assertEqual(ftp.files, {})

    def test_clean_tls_shutdown_is_still_completed(self):
        ftp = IisLikeFtp({'export.xml': b'<root>old</root>'}, unwrap_error=None)
        self.publish(ftp)
        self.assertTrue(all(c.unwrapped for c in ftp.conns))
        self.assertEqual(ftp.files['export.xml'], b'<root>new</root>')

    def test_250_completion_reply_is_accepted(self):
        ftp = IisLikeFtp({'export.xml': b'<root>old</root>'}, reply='250 Transfer complete.')
        self.publish(ftp)
        self.assertEqual(ftp.files['export.xml'], b'<root>new</root>')

    def test_missing_completion_reply_fails_and_keeps_old_export(self):
        ftp = IisLikeFtp({'export.xml': b'<root>old</root>'}, reply=socket.timeout('timed out'))
        with self.assertRaises(PublishError) as ctx:
            self.publish(ftp)
        self.assertIn('upload of export.xml.part failed', str(ctx.exception))
        self.assert_old_export_kept(ftp)

    def test_aborted_transfer_reply_fails_and_keeps_old_export(self):
        ftp = IisLikeFtp({'export.xml': b'<root>old</root>'}, reply=ftplib.error_temp('426 Connection closed; transfer aborted.'))
        with self.assertRaises(PublishError):
            self.publish(ftp)
        self.assert_old_export_kept(ftp)

    def test_non_completion_reply_fails(self):
        ftp = IisLikeFtp({'export.xml': b'<root>old</root>'}, reply='200 Command okay.')
        with self.assertRaises(PublishError):
            self.publish(ftp)
        self.assert_old_export_kept(ftp)

    def test_transfer_error_fails_and_keeps_old_export(self):
        ftp = IisLikeFtp({'export.xml': b'<root>old</root>'}, send_error=ConnectionResetError(10054, 'reset'))
        with self.assertRaises(PublishError):
            self.publish(ftp)
        self.assert_old_export_kept(ftp)
        self.assertIsNone(ftp.conns[0].unwrap_timeout)              # no shutdown after a failed transfer

    def test_incomplete_file_with_226_is_rejected_by_size(self):
        ftp = IisLikeFtp({'export.xml': b'<root>old</root>'}, drop_bytes=3)
        with self.assertRaises(PublishError) as ctx:
            self.publish(ftp)
        self.assertIn('expected', str(ctx.exception))
        self.assert_old_export_kept(ftp)

    def test_other_tls_shutdown_errors_still_fail(self):
        ftp = IisLikeFtp({'export.xml': b'<root>old</root>'}, unwrap_error=ssl.SSLError('decryption failed or bad record mac'))
        with self.assertRaises(PublishError):
            self.publish(ftp)
        self.assert_old_export_kept(ftp)


# Test-only self-signed certificate for "localhost" (valid until 2126). Never used outside this file.
TEST_CERT_PEM = '''-----BEGIN CERTIFICATE-----
MIIBpTCCAUugAwIBAgIUPf5mrwj/m9kS1DrK3XubKPsDd0cwCgYIKoZIzj0EAwIw
FDESMBAGA1UEAwwJbG9jYWxob3N0MCAXDTI2MTAxNzE3NTY0OFoYDzIxMjYwOTIz
MTc1NjQ4WjAUMRIwEAYDVQQDDAlsb2NhbGhvc3QwWTATBgcqhkjOPQIBBggqhkjO
PQMBBwNCAARJvmDQiF27lqpirqpRykZKInxRFpe6/A1tg41kglzKfv3A6xWkPJa7
dE0dzyccnYHgM2AFol+p7P5ZWtTQOMFPo3kwdzAdBgNVHQ4EFgQULzjW9lGoWyTb
ctsi7Rm6+oW2W6owHwYDVR0jBBgwFoAULzjW9lGoWyTbctsi7Rm6+oW2W6owFAYD
VR0RBA0wC4IJbG9jYWxob3N0MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQD
AgKEMAoGCCqGSM49BAMCA0gAMEUCIEnERIcCSzZI7oM2bzrN4FFWF4faoVx7AfJI
oY5/q+veAiEA1AidvM5VqgM63RFmNI4nLvzROZS2pzpqWY7UIUQAogc=
-----END CERTIFICATE-----
'''
TEST_KEY_PEM = '''-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg0YIVDvdBa4jJW0ys
ccjnb9963E4QUykhcgSkbjJMqdihRANCAARJvmDQiF27lqpirqpRykZKInxRFpe6
/A1tg41kglzKfv3A6xWkPJa7dE0dzyccnYHgM2AFol+p7P5ZWtTQOMFP
-----END PRIVATE KEY-----
'''


class RealTlsShutdownTests(unittest.TestCase):
    """The same case over a real TLS data channel (socketpair): the server reads the upload and the
    client's close_notify, then never answers it — exactly what ftplib's own unwrap() hung on."""

    def setUp(self):
        import threading
        import grins_pro_exporter.publish as publish_mod
        self.tmp = tempfile.TemporaryDirectory()
        cert, key = os.path.join(self.tmp.name, 'c.pem'), os.path.join(self.tmp.name, 'k.pem')
        with open(cert, 'w') as fh:
            fh.write(TEST_CERT_PEM)
        with open(key, 'w') as fh:
            fh.write(TEST_KEY_PEM)
        self.server_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        self.server_ctx.load_cert_chain(cert, key)
        self.client_ctx = make_tls_context(cert)
        self.release = threading.Event()
        self.received = []
        self.publish_mod, self.saved_wait = publish_mod, publish_mod.TLS_SHUTDOWN_WAIT_SECONDS
        publish_mod.TLS_SHUTDOWN_WAIT_SECONDS = 0.3

    def tearDown(self):
        self.release.set()
        self.publish_mod.TLS_SHUTDOWN_WAIT_SECONDS = self.saved_wait
        self.tmp.cleanup()

    def silent_iis_server(self, raw):
        try:
            tls = self.server_ctx.wrap_socket(raw, server_side=True)
            data = b''
            while True:
                chunk = tls.recv(65536)
                if not chunk:          # client's close_notify (or EOF)
                    break
                data += chunk
            self.received.append(data)
            self.release.wait(10)      # never answers close_notify, keeps TCP open
        except (OSError, ssl.SSLError):
            self.received.append(None)
        finally:
            raw.close()

    def make_ftp(self):
        import threading
        test = self

        class Ftp(SessionReuseFTP_TLS):
            def voidcmd(self, c):
                return '200 Type set to I.'

            def transfercmd(self, cmd, rest=None):
                cli, srv = socket.socketpair()
                threading.Thread(target=test.silent_iis_server, args=(srv,), daemon=True).start()
                cli.settimeout(5)
                return test.client_ctx.wrap_socket(cli, server_hostname='localhost')

            def getresp(self):
                return '226 Successfully transferred'
        return Ftp(context=self.client_ctx, timeout=5)

    def test_upload_returns_226_without_waiting_for_server_close_notify(self):
        import io
        import time
        start = time.monotonic()
        resp = self.make_ftp().storbinary('STOR probe-x.txt.part', io.BytesIO(b'probe replaced\n'))
        self.assertEqual(resp[:3], '226')
        self.assertLess(time.monotonic() - start, 3)      # bounded by TLS_SHUTDOWN_WAIT_SECONDS, not the 5 s socket timeout
        for _ in range(50):
            if self.received:
                break
            time.sleep(0.05)
        self.assertEqual(self.received, [b'probe replaced\n'])   # all bytes arrived over TLS



R1, R2, R3, R4, R5, CUR = ('20261017T%02d0000000000Z-1' % h for h in (10, 11, 12, 13, 14, 15))


def pair(run_id, xml=b'<root/>', manifest=b'{}'):
    x, m = run_file_names(run_id)
    return {x: xml, m: manifest}


class RunFilesTests(unittest.TestCase):
    """run-files layout: unique names, manifest last, never rename onto an existing name."""

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

    def pub(self, ftp, log=lambda *a, **k: None):
        return FtpsPublisher('ftps.example.lv', 21, '/exporter-feed', CRED, ftp_factory=ftp, log=log)

    def test_names(self):
        self.assertEqual(run_file_names(CUR), ('export-%s.xml' % CUR, 'export-%s.manifest.json' % CUR))
        for bad in ('', 'x', '../20261017T150000000000Z-1', '20261017T150000000000Z'):
            with self.assertRaises(PublishError):
                run_file_names(bad)

    def test_publish_run_uploads_xml_then_manifest_onto_new_names_only(self):
        ftp = FakeFtp(dict(pair(R5), **{'export.xml': b'legacy'}), rename_over_existing=False)
        res = self.pub(ftp).publish_run(CUR, self.xml, self.man, 24)
        x, m = run_file_names(CUR)
        self.assertEqual([c for c in ftp.cmds if c[0] in ('stor', 'rename')],
                         [('stor', x + '.part'), ('rename', x + '.part', x), ('stor', m + '.part'), ('rename', m + '.part', m)])
        self.assertEqual(ftp.files[x], b'<root>new</root>')
        self.assertEqual(ftp.files[m], b'{"new": true}')
        self.assertEqual(ftp.files['export.xml'], b'legacy')               # foreign names untouched
        self.assertEqual(res['pruned'], [])
        self.assertEqual(res['layout'], 'run-files')

    def test_existing_target_is_never_overwritten(self):
        x, m = run_file_names(CUR)
        for existing in (x, m):
            ftp = FakeFtp({existing: b'old'})
            with self.assertRaises(PublishError) as ctx:
                self.pub(ftp).publish_run(CUR, self.xml, self.man, 24)
            self.assertIn('refusing to overwrite', str(ctx.exception))
            self.assertFalse(any(c[0] in ('stor', 'rename', 'delete') for c in ftp.cmds))
            self.assertEqual(ftp.files, {existing: b'old'})

    def test_manifest_failure_leaves_no_complete_pair(self):
        x, m = run_file_names(CUR)
        ftp = FakeFtp(pair(R5), fail={'stor': m + '.part'})
        with self.assertRaises(PublishError):
            self.pub(ftp).publish_run(CUR, self.xml, self.man, 24)
        self.assertIn(x, ftp.files)                                        # orphan XML, invisible to the consumer
        self.assertNotIn(m, ftp.files)
        self.assertNotIn(m + '.part', ftp.files)
        self.assertTrue(set(pair(R5)) <= set(ftp.files))                   # previous complete pair intact
        self.assertFalse(any(c[0] == 'delete' and c[1] in pair(R5) for c in ftp.cmds))   # no pruning after a failure

    def test_prune_plan(self):
        names = set()
        for r in (R1, R2, R3, R4):
            names |= set(pair(r))
        x5, m5 = run_file_names(R5)
        future = 'export-20991231T000000000000Z-1.xml'
        r2m_part = run_file_names(R2)[1] + '.part'
        names |= {x5, x5 + '.part', 'export.xml', 'probe-x.txt', future, 'export-garbage.xml', r2m_part}
        plan = plan_remote_prune(names, CUR, keep=3)                       # keep current + R3 + R4
        self.assertEqual(plan, [run_file_names(R1)[1], run_file_names(R1)[0],
                                run_file_names(R2)[1], r2m_part, run_file_names(R2)[0],
                                x5, x5 + '.part'])
        for untouched in ('export.xml', 'probe-x.txt', future, 'export-garbage.xml'):
            self.assertNotIn(untouched, plan)
        self.assertEqual(plan_remote_prune(set(pair(R1)), CUR, keep=3), [])
        with self.assertRaises(PublishError):
            plan_remote_prune(names, CUR, keep=0)

    def test_publish_run_prunes_old_pairs_and_tolerates_delete_failures(self):
        files = {}
        for r in (R1, R2, R3, R4, R5):
            files.update(pair(r))
        events = []
        r1x, r1m = run_file_names(R1)
        ftp = FakeFtp(files, fail={'delete': (r1m,)})
        res = self.pub(ftp, log=lambda e, **k: events.append((e, k))).publish_run(CUR, self.xml, self.man, 3)
        self.assertEqual(res['pruned'], [r1x] + [n for r in (R2, R3) for n in (run_file_names(r)[1], run_file_names(r)[0])])
        self.assertEqual(res['pruneWarnings'], 1)
        self.assertEqual(events[-1][0], 'remote_prune_warning')
        self.assertNotIn('s3cr3t-pass', str(events))
        for r in (R4, R5, CUR):
            self.assertTrue(set(pair(r)) <= set(ftp.files), r)

    def test_probe_run_files_passes_without_overwrite(self):
        ftp = FakeFtp({'export.xml': b'live'}, rename_over_existing=False)
        res = self.pub(ftp).probe_run_files('t6', self.tmp.name)
        self.assertEqual(res['verdict'], 'FTPS RUN-FILES PUBLISH: PASS', res)
        self.assertEqual(ftp.files, {'export.xml': b'live'})
        touched = {c[1] for c in ftp.cmds if c[0] in ('stor', 'delete')} | {n for c in ftp.cmds if c[0] == 'rename' for n in c[1:]}
        self.assertTrue(all(n.startswith('probe-t6-') for n in touched), touched)
        self.assertEqual(sorted(os.listdir(self.tmp.name)), ['export.manifest.json', 'export.xml'])

    def test_probe_run_files_fails_without_delete_or_size(self):
        class NoDelete(FakeFtp):
            def delete(self, name):
                self.cmds.append(('delete', name))
        self.assertEqual(self.pub(NoDelete()).probe_run_files('t7', self.tmp.name)['verdict'], 'FTPS RUN-FILES PUBLISH: FAIL')

        class NoSize(FakeFtp):
            def size(self, name):
                raise ftplib.error_perm('502 SIZE not implemented')
        res = FtpsPublisher('h', 21, '/exporter-feed', CRED, ftp_factory=NoSize(), require_remote_size=False).probe_run_files('t8', self.tmp.name)
        self.assertEqual(res['verdict'], 'FTPS RUN-FILES PUBLISH: FAIL')

    def test_run_files_on_iis_double_with_tls_shutdown_and_no_replace(self):
        ftp = IisLikeFtp(pair(R5), replace_on_rename=False)
        res = FtpsPublisher('h', 21, '/exporter-feed', CRED, ftp_factory=ftp).publish_run(CUR, self.xml, self.man, 24)
        self.assertEqual(ftp.files[run_file_names(CUR)[0]], b'<root>new</root>')
        self.assertEqual(res['manifest']['file'], run_file_names(CUR)[1])
        with self.assertRaises(PublishError):                              # the fixed layout still fails there
            FtpsPublisher('h', 21, '/exporter-feed', CRED, ftp_factory=IisLikeFtp({'export.xml': b'old'}, replace_on_rename=False)).publish(
                self.xml, 'export.xml', self.man, 'export.manifest.json')

if __name__ == '__main__':
    unittest.main()
