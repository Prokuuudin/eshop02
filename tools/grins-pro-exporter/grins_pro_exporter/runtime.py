"""Single-instance lock and structured JSON-lines logging."""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from typing import IO, Optional

_SECRET_KEYS = ('password', 'passwd', 'secret', 'token', 'credentialblob', 'authorization', 'webhookurl')


class LockBusy(Exception):
    pass


class SingleInstanceLock:
    """OS byte-range lock on <dir>/exporter.lock. The OS releases it when the process dies, so a
    crashed run never leaves a stale lock behind; the .json next to it is diagnostics only."""

    def __init__(self, directory: str):
        os.makedirs(directory, exist_ok=True)
        self.path = os.path.join(directory, 'exporter.lock')
        self.info_path = self.path + '.json'
        self._fh: Optional[IO[bytes]] = None

    def acquire(self, run_id: str) -> None:
        fh = open(self.path, 'a+b')
        try:
            fh.seek(0)
            if sys.platform == 'win32':
                import msvcrt
                msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            fh.close()
            holder = ''
            try:
                with open(self.info_path, encoding='utf-8') as f:
                    holder = f.read(500)
            except OSError:
                pass
            raise LockBusy('another exporter run holds %s %s' % (self.path, holder))
        self._fh = fh
        with open(self.info_path, 'w', encoding='utf-8') as f:
            json.dump({'pid': os.getpid(), 'runId': run_id, 'startedAt': utc_now()}, f)

    def release(self) -> None:
        if not self._fh:
            return
        try:
            self._fh.seek(0)
            if sys.platform == 'win32':
                import msvcrt
                msvcrt.locking(self._fh.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(self._fh.fileno(), fcntl.LOCK_UN)
        finally:
            self._fh.close()
            self._fh = None


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def _redact(value):
    if isinstance(value, dict):
        return {k: ('[REDACTED]' if any(s in str(k).lower() for s in _SECRET_KEYS) else _redact(v))
                for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_redact(v) for v in value]
    return value


class JsonLogger:
    """One JSON object per line to <logDir>/exporter-YYYY-MM-DD.log (UTC date) and to stderr."""

    def __init__(self, log_dir: Optional[str], run_id: str, stream: Optional[IO[str]] = None):
        self.run_id = run_id
        self.stream = stream if stream is not None else sys.stderr
        self.path = None
        if log_dir:
            os.makedirs(log_dir, exist_ok=True)
            self.path = os.path.join(log_dir, 'exporter-%s.log' % datetime.now(timezone.utc).strftime('%Y-%m-%d'))
        self.events = []

    def __call__(self, event: str, level: str = 'info', **fields) -> None:
        rec = {'ts': utc_now(), 'level': level, 'event': event, 'runId': self.run_id}
        rec.update(_redact(fields))
        line = json.dumps(rec, ensure_ascii=False, default=str)
        self.events.append(rec)
        if self.path:
            with open(self.path, 'a', encoding='utf-8') as fh:
                fh.write(line + '\n')
        try:
            self.stream.write(line + '\n')
            self.stream.flush()
        except (OSError, ValueError):
            pass
