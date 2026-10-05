"""Atomic publication to the Hairshop Pro FTPS location (explicit TLS, verified certificate).

Order per file: STOR <name>.part -> SIZE check -> RNFR/RNTO <name>.part -> <name> -> SIZE check.
export.xml is published first, then export.manifest.json. Readers therefore only ever see a
complete export.xml; a consumer that checks the manifest sees SHA mismatch (= not fresh) if the
manifest step failed after the XML rename.

The target is replaced only by a server-side rename. If the server refuses to rename onto an
existing file, publishing FAILS (the previous export.xml stays) — there is deliberately no
delete+rename fallback, because that would open a window with no export.xml at all. Use the
`probe-ftps` command to establish what the server supports before enabling publishing.
"""
from __future__ import annotations

import ftplib
import os
import re
import ssl
from typing import Callable, Dict, Optional

from .credentials import Credential

_SAFE_NAME = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$')
_SAFE_DIR = re.compile(r'^/?([A-Za-z0-9._-]+/)*[A-Za-z0-9._-]*$')


class PublishError(Exception):
    pass


def validate_remote_dir(remote_dir: str) -> str:
    if not _SAFE_DIR.match(remote_dir) or any(p in ('.', '..') for p in remote_dir.split('/')):
        raise PublishError('remote directory %r is not a plain path (letters, digits, . _ - and /)' % remote_dir)
    return remote_dir


def validate_remote_name(name: str) -> str:
    if not _SAFE_NAME.match(name) or name in ('.', '..'):
        raise PublishError('remote file name %r is not allowed' % name)
    return name


def make_tls_context(ca_file: Optional[str] = None) -> ssl.SSLContext:
    """System trust store (or an explicit CA bundle), hostname check, TLS >= 1.2. No bypass exists."""
    ctx = ssl.create_default_context(cafile=ca_file) if ca_file else ssl.create_default_context()
    ctx.check_hostname = True
    ctx.verify_mode = ssl.CERT_REQUIRED
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    return ctx


class SessionReuseFTP_TLS(ftplib.FTP_TLS):
    """Reuse the control-channel TLS session on data connections (required by many servers,
    e.g. vsftpd/FileZilla 'require_ssl_reuse'); stdlib ftplib does not do this by itself."""

    def ntransfercmd(self, cmd, rest=None):
        conn, size = ftplib.FTP.ntransfercmd(self, cmd, rest)
        if self._prot_p:
            conn = self.context.wrap_socket(conn, server_hostname=self.host, session=self.sock.session)
        return conn, size


class FtpsPublisher:
    def __init__(self, host: str, port: int, remote_dir: str, credential: Credential,
                 context: Optional[ssl.SSLContext] = None, timeout: float = 60,
                 require_remote_size: bool = True,
                 ftp_factory: Optional[Callable[..., ftplib.FTP_TLS]] = None,
                 log: Callable[..., None] = lambda *a, **k: None):
        if not host or not 0 < int(port) < 65536:
            raise PublishError('invalid FTPS host/port')
        self.host, self.port = host, int(port)
        self.remote_dir = validate_remote_dir(remote_dir)
        self.credential = credential
        self.context = context or make_tls_context()
        if self.context.verify_mode != ssl.CERT_REQUIRED or not self.context.check_hostname:
            raise PublishError('TLS context must verify the certificate and the host name')
        self.timeout = timeout
        self.require_remote_size = require_remote_size
        self.ftp_factory = ftp_factory or (lambda **kw: SessionReuseFTP_TLS(**kw))
        self.log = log

    # ── connection ─────────────────────────────────────────────────────────

    def connect(self) -> ftplib.FTP_TLS:
        ftp = self.ftp_factory(context=self.context, timeout=self.timeout)
        try:
            ftp.connect(self.host, self.port)
            ftp.auth()                       # AUTH TLS: certificate + hostname verified here
            ftp.login(self.credential.username, self.credential.secret)
            ftp.prot_p()
            ftp.voidcmd('TYPE I')
            if self.remote_dir:
                ftp.cwd(self.remote_dir)
        except (ssl.SSLError, ssl.CertificateError) as e:
            self._close(ftp)
            raise PublishError('TLS verification failed: %s' % e.__class__.__name__ + ': ' + str(e)[:200])
        except ftplib.all_errors as e:
            self._close(ftp)
            raise PublishError('FTPS connect/login failed: %s' % _safe_error(e, self.credential))
        tls = {}
        try:
            tls = {'protocol': ftp.sock.version(), 'cipher': (ftp.sock.cipher() or [None])[0]}
        except (AttributeError, OSError):
            pass
        self.log('ftps_connected', host=self.host, port=self.port, remoteDir=self.remote_dir, tls=tls)
        return ftp

    @staticmethod
    def _close(ftp) -> None:
        try:
            ftp.quit()
        except Exception:  # noqa: BLE001 - best effort
            try:
                ftp.close()
            except Exception:  # noqa: BLE001
                pass

    # ── publish ─────────────────────────────────────────────────────────────

    def _size(self, ftp, name: str) -> Optional[int]:
        try:
            return ftp.size(name)
        except ftplib.error_perm:
            return None

    def _put_atomic(self, ftp, local_path: str, name: str) -> Dict[str, object]:
        validate_remote_name(name)
        part = name + '.part'
        expected = os.path.getsize(local_path)
        self.log('upload_started', file=name, part=part, sizeBytes=expected)
        try:
            with open(local_path, 'rb') as fh:
                ftp.storbinary('STOR ' + part, fh)
        except ftplib.all_errors as e:
            self._try_delete(ftp, part)
            raise PublishError('upload of %s failed: %s' % (part, _safe_error(e, self.credential)))
        size = self._size(ftp, part)
        if size is None and self.require_remote_size:
            self._try_delete(ftp, part)
            raise PublishError('server does not report SIZE for %s; cannot verify the upload' % part)
        if size is not None and size != expected:
            self._try_delete(ftp, part)
            raise PublishError('uploaded %s has %d bytes, expected %d' % (part, size, expected))
        self.log('upload_completed', file=name, part=part, remoteSizeBytes=size)
        try:
            ftp.rename(part, name)
        except ftplib.all_errors as e:
            self._try_delete(ftp, part)
            raise PublishError('atomic rename %s -> %s refused (previous %s kept): %s' % (
                part, name, name, _safe_error(e, self.credential)))
        final = self._size(ftp, name)
        if final is not None and final != expected:
            raise PublishError('%s has %d bytes after rename, expected %d' % (name, final, expected))
        return {'file': name, 'sizeBytes': expected, 'remoteSizeBytes': final}

    def _try_delete(self, ftp, name: str) -> None:
        try:
            ftp.delete(name)
        except ftplib.all_errors:
            pass

    def publish(self, xml_path: str, xml_name: str, manifest_path: str, manifest_name: str) -> dict:
        ftp = self.connect()
        try:
            xml = self._put_atomic(ftp, xml_path, xml_name)
            manifest = self._put_atomic(ftp, manifest_path, manifest_name)
        finally:
            self._close(ftp)
        return {'xml': xml, 'manifest': manifest}

    def probe(self, run_id: str) -> dict:
        """Capability check using only probe-* files: TLS, login, STOR, SIZE, rename onto a new name
        and onto an EXISTING name (the atomic-replace requirement). Never touches export files."""
        import io
        result = {'connected': False, 'stor': False, 'size': False, 'renameNew': False, 'renameOverExisting': False}
        ftp = self.connect()
        result['connected'] = True
        target = 'probe-%s.txt' % run_id
        try:
            for i, label in ((1, 'renameNew'), (2, 'renameOverExisting')):
                part = '%s.%d.part' % (target, i)
                ftp.storbinary('STOR ' + part, io.BytesIO(b'probe %d\n' % i))
                result['stor'] = True
                result['size'] = self._size(ftp, part) == len(b'probe %d\n' % i)
                try:
                    ftp.rename(part, target)
                    result[label] = True
                except ftplib.all_errors as e:
                    result[label + 'Error'] = _safe_error(e, self.credential)
                    self._try_delete(ftp, part)
        finally:
            self._try_delete(ftp, target)
            self._close(ftp)
        result['atomicPublishSupported'] = bool(result['stor'] and result['renameOverExisting'] and
                                                (result['size'] or not self.require_remote_size))
        return result


def _safe_error(e: BaseException, credential: Credential) -> str:
    text = ('%s: %s' % (e.__class__.__name__, e))[:300]
    for s in (credential.secret, credential.username):
        if s:
            text = text.replace(s, '[REDACTED]')
    return text
