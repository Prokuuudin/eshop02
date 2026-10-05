"""Stable snapshot of the live GrinS tables.

The live directory is only ever opened for reading. Each attempt copies every required file twice
(A, then B after a pause) and also compares the source size/mtime before A and after B. The
snapshot is accepted only when SHA-256(A) == SHA-256(B) for every file and the source metadata did
not move. Otherwise the attempt is discarded and retried a bounded number of times; exhausting the
attempts fails closed (nothing is generated or published).

Only CENIC.DB and OSTATOK.DB are required: the proven reader walks the .DB data blocks and never
uses the .PX primary index or the .MB memo file (CENIC.Comment is not exported).
"""
from __future__ import annotations

import hashlib
import os
import shutil
import stat
import time
from datetime import datetime, timezone
from typing import Callable, Dict, List, Optional, Tuple

REQUIRED_FILES: Tuple[str, ...] = ('CENIC.DB', 'OSTATOK.DB')
MIN_FILE_SIZE = 4096
CHUNK = 1024 * 1024
_REPARSE = getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0x400)


class SnapshotError(Exception):
    pass


def utc_iso(ts: Optional[float] = None) -> str:
    dt = datetime.now(timezone.utc) if ts is None else datetime.fromtimestamp(ts, timezone.utc)
    return dt.isoformat(timespec='seconds').replace('+00:00', 'Z')


def resolve_source_file(source_dir: str, name: str) -> str:
    """Case-insensitive lookup of one regular, non-link file directly inside source_dir."""
    matches = [e for e in os.listdir(source_dir) if e.lower() == name.lower()]
    if len(matches) != 1:
        raise SnapshotError('%s: expected exactly one file in the source directory, found %d' % (name, len(matches)))
    path = os.path.join(source_dir, matches[0])
    st = os.lstat(path)
    if stat.S_ISLNK(st.st_mode) or getattr(st, 'st_file_attributes', 0) & _REPARSE:
        raise SnapshotError('%s: is a symlink/reparse point; refused' % name)
    if not stat.S_ISREG(st.st_mode):
        raise SnapshotError('%s: not a regular file' % name)
    if st.st_size < MIN_FILE_SIZE:
        raise SnapshotError('%s: implausibly small (%d bytes)' % (name, st.st_size))
    return path


def _meta(path: str) -> Tuple[int, int]:
    st = os.stat(path)
    return st.st_size, st.st_mtime_ns


def copy_with_hash(src: str, dst: str) -> Tuple[str, int]:
    """Stream-copy src -> new file dst (exclusive create), hashing the bytes written. fsynced."""
    h = hashlib.sha256()
    size = 0
    with open(src, 'rb') as fin, open(dst, 'xb') as fout:
        while True:
            chunk = fin.read(CHUNK)
            if not chunk:
                break
            h.update(chunk)
            fout.write(chunk)
            size += len(chunk)
        fout.flush()
        os.fsync(fout.fileno())
    return h.hexdigest(), size


def take_stable_snapshot(source_dir: str, run_dir: str, max_attempts: int = 3, pause_seconds: float = 5,
                         retry_delay_seconds: float = 60, log: Callable[..., None] = lambda *a, **k: None,
                         sleep: Callable[[float], None] = time.sleep,
                         copy: Callable[[str, str], Tuple[str, int]] = copy_with_hash) -> dict:
    if max_attempts < 1:
        raise SnapshotError('max_attempts must be >= 1')
    os.makedirs(run_dir)          # a fresh directory per run; never reuse an existing one
    sources = {name: resolve_source_file(source_dir, name) for name in REQUIRED_FILES}
    for attempt in range(1, max_attempts + 1):
        log('snapshot_started', attempt=attempt, maxAttempts=max_attempts)
        base = os.path.join(run_dir, 'attempt-%d' % attempt)
        a_dir, b_dir = os.path.join(base, 'a'), os.path.join(base, 'b')
        os.makedirs(a_dir)
        os.makedirs(b_dir)
        reasons: List[str] = []
        files: Dict[str, dict] = {}
        try:
            before = {n: _meta(p) for n, p in sources.items()}
            a = {n: copy(p, os.path.join(a_dir, n)) for n, p in sources.items()}
            sleep(pause_seconds)
            b = {n: copy(p, os.path.join(b_dir, n)) for n, p in sources.items()}
            after = {n: _meta(p) for n, p in sources.items()}
            for n in REQUIRED_FILES:
                if a[n] != b[n]:
                    reasons.append('%s changed between copy A and copy B' % n)
                if before[n] != after[n]:
                    reasons.append('%s size/mtime changed during the snapshot' % n)
                if a[n][1] != before[n][0]:
                    reasons.append('%s copied %d bytes, source reported %d' % (n, a[n][1], before[n][0]))
                files[n] = {'sha256': a[n][0], 'sizeBytes': a[n][1], 'sourceModifiedAt': utc_iso(before[n][1] / 1e9)}
        except OSError as e:
            reasons.append('copy failed: %s' % e)
        if not reasons:
            final = os.path.join(run_dir, 'snapshot')
            os.replace(a_dir, final)
            shutil.rmtree(base, ignore_errors=True)
            result = {'dir': final, 'attempt': attempt, 'snapshotAt': utc_iso(), 'files': files}
            log('snapshot_completed', attempt=attempt, files=files)
            return result
        shutil.rmtree(base, ignore_errors=True)
        log('snapshot_unstable', level='warning', attempt=attempt, reasons=reasons)
        if attempt < max_attempts:
            sleep(retry_delay_seconds)
    raise SnapshotError('no stable snapshot after %d attempts' % max_attempts)


def prune_runs(runs_dir: str, keep: int) -> None:
    """Keep the newest `keep` run directories (names are sortable run ids)."""
    if not os.path.isdir(runs_dir):
        return
    entries = sorted(e for e in os.listdir(runs_dir) if os.path.isdir(os.path.join(runs_dir, e)))
    for old in entries[:-keep] if keep > 0 else entries:
        shutil.rmtree(os.path.join(runs_dir, old), ignore_errors=True)
