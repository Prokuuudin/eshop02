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
import socket
import ssl
from typing import Callable, Dict, Optional

from .credentials import Credential

_SAFE_NAME = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$')
_SAFE_DIR = re.compile(r'^/?([A-Za-z0-9._-]+/)*[A-Za-z0-9._-]*$')

# Bounded wait for the server's TLS close_notify after an upload. Microsoft IIS FTP never sends it
# (Hairshop Pro server, 2026-10-17: unwrap timed out, then 226 and the full SIZE arrived), so ftplib's
# bidirectional unwrap() blocked for the whole socket timeout and failed an accepted upload.
TLS_SHUTDOWN_WAIT_SECONDS = 2.0
# RFC 959 completion replies for STOR. Anything else (or no reply) fails the upload.
STOR_COMPLETED_CODES = ('226', '250')

# "run-files" layout: every run publishes its own immutable pair, the manifest last (= completion
# marker). Nothing is ever renamed onto an existing name, so IIS allowReplaceOnRename is not needed.
LAYOUTS = ('fixed', 'run-files')
_RUN_ID = r'\d{8}T\d{12}Z-\d+'                       # runner.new_run_id()
_RUN_FILE_RE = re.compile(r'\Aexport-(%s)\.(xml|manifest\.json)(\.part)?\Z' % _RUN_ID)


def run_file_names(run_id: str) -> tuple:
    """Remote (xml, manifest) names of one run in the run-files layout."""
    if not re.match(r'\A%s\Z' % _RUN_ID, run_id or ''):
        raise PublishError('run id %r is not an exporter run id' % run_id)
    return 'export-%s.xml' % run_id, 'export-%s.manifest.json' % run_id


def plan_remote_prune(names, current_run_id: str, keep: int) -> list:
    """Names to delete, in order, after `current_run_id` was published completely.

    Keeps the newest `keep` complete pairs (and always the current one). Older complete pairs are
    removed manifest first, so a half-deleted pair never looks complete. Older orphans (a pair whose
    manifest never arrived) and older .part leftovers are removed too. Names that do not match the
    run-files pattern, and anything at or after the current run, are never touched."""
    if keep < 1:
        raise PublishError('keep must be at least 1')
    files = {}
    for name in names:
        m = _RUN_FILE_RE.match(name)
        if m and m.group(1) < current_run_id:
            files.setdefault(m.group(1), set()).add(name)
    complete = sorted(r for r in files if {'export-%s.xml' % r, 'export-%s.manifest.json' % r} <= files[r])
    kept = set(complete[-(keep - 1):]) if keep > 1 else set()   # the current run counts as one kept pair
    plan = []
    for run_id in sorted(files):
        if run_id in kept:
            plan.extend(sorted(n for n in files[run_id] if n.endswith('.part')))
            continue
        xml, manifest = run_file_names(run_id)
        ordered = [manifest, manifest + '.part', xml, xml + '.part']
        plan.extend(n for n in ordered if n in files[run_id])
    return plan


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

    def storbinary(self, cmd, fp, blocksize=8192, callback=None, rest=None):
        """ftplib.FTP.storbinary with an IIS-compatible end of the TLS data channel: our close_notify
        is still sent, but the server's reply to it is awaited only TLS_SHUTDOWN_WAIT_SECONDS. The
        upload counts only on a 226/250 control reply; callers additionally verify SIZE."""
        self.voidcmd('TYPE I')
        with self.transfercmd(cmd, rest) as conn:
            while True:
                buf = fp.read(blocksize)
                if not buf:
                    break
                conn.sendall(buf)
                if callback:
                    callback(buf)
            _end_tls_without_waiting(conn)
        resp = self.getresp()   # 4xx/5xx raise error_temp/error_perm; no reply raises a timeout
        if resp[:3] not in STOR_COMPLETED_CODES:
            raise ftplib.error_reply(resp)
        return resp


def _end_tls_without_waiting(conn) -> None:
    unwrap = getattr(conn, 'unwrap', None)
    if unwrap is None:          # plain data channel (PROT C): nothing to shut down
        return
    conn.settimeout(TLS_SHUTDOWN_WAIT_SECONDS)
    try:
        unwrap()                # sends our close_notify, then waits for the server's
    except socket.timeout:      # IIS: no close_notify back; only this case is tolerated
        pass


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

    def _list(self, ftp) -> set:
        try:
            return {n.rsplit('/', 1)[-1] for n in ftp.nlst()}
        except ftplib.error_perm as e:
            if str(e).startswith('550'):     # some servers answer an empty directory with 550
                return set()
            raise

    def publish_run(self, run_id: str, xml_path: str, manifest_path: str, keep_remote_runs: int) -> dict:
        """run-files layout: export-<runId>.xml, then export-<runId>.manifest.json, each uploaded as
        .part and renamed onto a name that does not exist yet. Refuses to start if either name exists.
        After both are complete, older own files are pruned (failures there are warnings only)."""
        xml_name, manifest_name = run_file_names(run_id)
        ftp = self.connect()
        try:
            try:
                existing = self._list(ftp)
            except ftplib.all_errors as e:
                raise PublishError('cannot list remote directory: %s' % _safe_error(e, self.credential))
            clash = sorted({xml_name, manifest_name} & existing)
            if clash:
                raise PublishError('remote %s already exists; refusing to overwrite' % ', '.join(clash))
            xml = self._put_atomic(ftp, xml_path, xml_name)
            manifest = self._put_atomic(ftp, manifest_path, manifest_name)
            pruned, warnings = [], []
            for name in plan_remote_prune(existing, run_id, keep_remote_runs):
                try:
                    ftp.delete(name)
                    pruned.append(name)
                except ftplib.all_errors as e:
                    warnings.append('%s: %s' % (name, _safe_error(e, self.credential)))
            if warnings:
                self.log('remote_prune_warning', level='warning', failed=warnings)
        finally:
            self._close(ftp)
        return {'layout': 'run-files', 'xml': xml, 'manifest': manifest, 'pruned': pruned, 'pruneWarnings': len(warnings)}

    def probe(self, run_id: str, workdir: str) -> dict:
        """Capability check with the production algorithm (_put_atomic: STOR .part -> SIZE -> RNFR/RNTO
        -> SIZE) on probe-* names only, so export.xml / export.manifest.json and their .part files can
        never be touched. Step 1 creates probe-<run>.txt (rename onto a free name); step 2 publishes a
        LONGER file onto the now EXISTING name — the exact replace export.xml needs. The size check
        after the rename proves the destination really holds the new content. Probe files are removed."""
        target = validate_remote_name('probe-%s.txt' % run_id)
        if not target.startswith('probe-'):
            raise PublishError('probe target must be a probe-* file')
        result = {'connected': False, 'renameNew': False, 'renameOverExisting': False, 'sizeSupported': None}
        ftp = self.connect()
        result['connected'] = True
        try:
            for step, label, payload in ((1, 'renameNew', b'probe\n'), (2, 'renameOverExisting', b'probe replaced\n')):
                local = os.path.join(workdir, '%s.%d' % (target, step))
                with open(local, 'wb') as fh:
                    fh.write(payload)
                try:
                    put = self._put_atomic(ftp, local, target)
                    result[label] = True
                    result['sizeSupported'] = put.get('remoteSizeBytes') is not None
                except PublishError as e:
                    result[label + 'Error'] = str(e)
                    break
                finally:
                    os.remove(local)
        finally:
            self._try_delete(ftp, target)
            self._try_delete(ftp, target + '.part')
            self._close(ftp)
        # Without SIZE the replacement of the existing file cannot be proven -> not a PASS.
        result['atomicPublishSupported'] = bool(result['renameNew'] and result['renameOverExisting'] and result['sizeSupported'])
        result['verdict'] = 'FTPS ATOMIC PUBLISH: %s' % ('PASS' if result['atomicPublishSupported'] else 'FAIL')
        return result

    def probe_run_files(self, run_id: str, workdir: str) -> dict:
        """Capability check for the run-files layout, on probe-* names only and without overwriting:
        two uploads onto new names (_put_atomic), listing shows both, deleting both works and the
        listing no longer shows them (pruning needs NLST + DELE)."""
        names = [validate_remote_name('probe-%s-%d.txt' % (run_id, i)) for i in (1, 2)]
        result = {'connected': False, 'renameNew': False, 'secondNewName': False, 'sizeSupported': None,
                  'listSupported': False, 'deleteSupported': False}
        ftp = self.connect()
        result['connected'] = True
        try:
            for i, (label, name) in enumerate((('renameNew', names[0]), ('secondNewName', names[1])), 1):
                local = os.path.join(workdir, '%s.local' % name)
                with open(local, 'wb') as fh:
                    fh.write(b'probe %d\n' % i)
                try:
                    put = self._put_atomic(ftp, local, name)
                    result[label] = True
                    result['sizeSupported'] = put.get('remoteSizeBytes') is not None
                except PublishError as e:
                    result[label + 'Error'] = str(e)
                    break
                finally:
                    os.remove(local)
            if result['secondNewName']:
                try:
                    result['listSupported'] = set(names) <= self._list(ftp)
                    for name in names:
                        ftp.delete(name)
                    result['deleteSupported'] = not (set(names) & self._list(ftp))
                except ftplib.all_errors as e:
                    result['listOrDeleteError'] = _safe_error(e, self.credential)
        finally:
            for name in names:
                self._try_delete(ftp, name)
                self._try_delete(ftp, name + '.part')
            self._close(ftp)
        result['runFilesPublishSupported'] = bool(result['renameNew'] and result['secondNewName'] and result['sizeSupported']
                                                  and result['listSupported'] and result['deleteSupported'])
        result['verdict'] = 'FTPS RUN-FILES PUBLISH: %s' % ('PASS' if result['runFilesPublishSupported'] else 'FAIL')
        return result


def _safe_error(e: BaseException, credential: Credential) -> str:
    text = ('%s: %s' % (e.__class__.__name__, e))[:300]
    for s in (credential.secret, credential.username):
        if s:
            text = text.replace(s, '[REDACTED]')
    return text
