import os
import struct
import tempfile
import unittest

from grins_pro_exporter.paradox import CENIC_SCHEMA, OSTATOK_SCHEMA, ParadoxError, ParadoxTable
from grins_pro_exporter.snapshot import (SnapshotError, copy_with_hash, prune_runs, resolve_source_file,
                                         take_stable_snapshot)

from fixtures import CENIC_FIELDS, OSTATOK_FIELDS, cenic, enc_value, lot, write_snapshot, write_table


class ParadoxValidationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.d = self.tmp.name
        self.p = os.path.join(self.d, 'T.DB')

    def tearDown(self):
        self.tmp.cleanup()

    def ost(self, rows=None, **kw):
        write_table(self.p, OSTATOK_FIELDS, rows if rows is not None else [lot(i, '10000', 'A%d' % i, 1) for i in range(1, 40)],
                    header_size=2048, **kw)
        return ParadoxTable(self.p)

    def test_valid_table_multi_block(self):
        t = self.ost()
        st = t.validate(OSTATOK_SCHEMA)
        self.assertEqual(st['records'], 39)
        self.assertGreater(st['blocks'], 1)
        rows = list(t.records())
        self.assertEqual(rows[0][t.index['TovarKod']], '            A1')
        self.assertEqual(rows[0][t.index['Kolvo']], 1.0)

    def test_records_require_validation(self):
        with self.assertRaises(ParadoxError):
            list(self.ost().records())

    def test_schema_fingerprint_mismatch(self):
        fields = list(OSTATOK_FIELDS)
        fields[3] = ('CenaUcetnX', 6, 8)
        write_table(self.p, fields, [lot(1, '10000', 'A', 1)], header_size=2048)
        with self.assertRaises(ParadoxError) as ctx:
            ParadoxTable(self.p).validate(OSTATOK_SCHEMA)
        self.assertIn('fingerprint', str(ctx.exception))

    def test_wrong_table_for_schema(self):
        with self.assertRaises(ParadoxError):
            self.ost().validate(CENIC_SCHEMA)

    def test_partial_copy_truncated(self):
        self.ost()
        with open(self.p, 'r+b') as fh:
            fh.truncate(os.path.getsize(self.p) - 100)
        with self.assertRaises(ParadoxError) as ctx:
            ParadoxTable(self.p).validate(OSTATOK_SCHEMA)
        self.assertIn('partial', str(ctx.exception))

    def test_header_count_disagrees(self):
        t = self.ost(num_records=38)
        with self.assertRaises(ParadoxError) as ctx:
            t.validate(OSTATOK_SCHEMA)
        self.assertIn('record counts disagree', str(ctx.exception))

    def test_stale_unchained_block_with_records(self):
        rec = sum(f[2] for f in OSTATOK_FIELDS)
        stale = b''.join(enc_value(t, s, lot(99, '10000', 'Z', 5).get(n)) for n, t, s in OSTATOK_FIELDS)
        t = self.ost(extra_blocks=[(0, stale)])
        with self.assertRaises(ParadoxError):
            t.validate(OSTATOK_SCHEMA)   # legacy would silently read it; we refuse

    def test_empty_unchained_block_is_fine(self):
        rec = sum(f[2] for f in OSTATOK_FIELDS)
        self.ost(extra_blocks=[(-rec, b'')]).validate(OSTATOK_SCHEMA)

    def test_broken_chain_loop(self):
        t = self.ost(chain=[1, 2, 1])
        with self.assertRaises(ParadoxError):
            t.validate(OSTATOK_SCHEMA)

    def test_corrupted_block_header(self):
        self.ost()
        with open(self.p, 'r+b') as fh:
            fh.seek(2048 + 4)
            fh.write(struct.pack('<h', 7))   # addDataSize not a multiple of the record size
        with self.assertRaises(ParadoxError):
            ParadoxTable(self.p).validate(OSTATOK_SCHEMA)

    def test_encrypted_and_garbage_headers(self):
        write_table(self.p, OSTATOK_FIELDS, [lot(1, '10000', 'A', 1)], header_size=2048, encryption2=1)
        with self.assertRaises(ParadoxError):
            ParadoxTable(self.p)
        with open(self.p, 'wb') as fh:
            fh.write(b'\x00' * 50)
        with self.assertRaises(ParadoxError):
            ParadoxTable(self.p)
        with open(self.p, 'wb') as fh:
            fh.write(os.urandom(4096))
        with self.assertRaises(ParadoxError):
            ParadoxTable(self.p).validate(OSTATOK_SCHEMA)


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.src = os.path.join(self.tmp.name, 'live')
        self.run = os.path.join(self.tmp.name, 'run')
        write_snapshot(self.src, [cenic(1, 'A')], [lot(1, '10000', 'A', 2)])
        self.events = []
        self.log = lambda event, **kw: self.events.append((event, kw))

    def tearDown(self):
        self.tmp.cleanup()

    def test_stable_snapshot(self):
        res = take_stable_snapshot(self.src, self.run, pause_seconds=0, log=self.log, sleep=lambda s: None)
        self.assertEqual(res['attempt'], 1)
        self.assertEqual(sorted(os.listdir(res['dir'])), ['CENIC.DB', 'OSTATOK.DB'])
        self.assertEqual(sorted(os.listdir(self.run)), ['snapshot'])        # attempt dirs removed
        self.assertEqual(len(res['files']['CENIC.DB']['sha256']), 64)
        ParadoxTable(os.path.join(res['dir'], 'OSTATOK.DB')).validate(OSTATOK_SCHEMA)

    def test_change_between_copies_then_retry_succeeds(self):
        calls = {'n': 0}

        def flaky_copy(src, dst):
            calls['n'] += 1
            if calls['n'] == 3:   # copies: A=CENIC,OSTATOK then B=CENIC -> live write right before B
                with open(os.path.join(self.src, 'CENIC.DB'), 'r+b') as fh:
                    fh.seek(-10, 2)
                    fh.write(b'xxxxxxxxxx')
            return copy_with_hash(src, dst)

        res = take_stable_snapshot(self.src, self.run, max_attempts=3, pause_seconds=0, log=self.log,
                                   sleep=lambda s: None, copy=flaky_copy)
        self.assertEqual(res['attempt'], 2)
        self.assertIn('snapshot_unstable', [e for e, _ in self.events])

    def test_retry_exhaustion_fails_closed(self):
        counter = {'n': 0}

        def always_changing(src, dst):
            counter['n'] += 1
            with open(os.path.join(self.src, 'CENIC.DB'), 'r+b') as fh:
                fh.seek(-8, 2)
                fh.write(counter['n'].to_bytes(8, 'big'))
            return copy_with_hash(src, dst)

        with self.assertRaises(SnapshotError):
            take_stable_snapshot(self.src, self.run, max_attempts=2, pause_seconds=0, log=self.log,
                                 sleep=lambda s: None, copy=always_changing)
        self.assertEqual([e for e, _ in self.events].count('snapshot_unstable'), 2)
        self.assertFalse(os.path.exists(os.path.join(self.run, 'snapshot')))

    def test_partial_copy_detected(self):
        def short_copy(src, dst):
            sha, size = copy_with_hash(src, dst)
            with open(dst, 'r+b') as fh:
                fh.truncate(size - 1)
            return sha, size - 1

        with self.assertRaises(SnapshotError):
            take_stable_snapshot(self.src, self.run, max_attempts=1, pause_seconds=0, log=self.log,
                                 sleep=lambda s: None, copy=short_copy)

    def test_missing_and_tiny_source_files(self):
        os.remove(os.path.join(self.src, 'OSTATOK.DB'))
        with self.assertRaises(SnapshotError):
            take_stable_snapshot(self.src, self.run, sleep=lambda s: None)
        with open(os.path.join(self.src, 'OSTATOK.DB'), 'wb') as fh:
            fh.write(b'x' * 100)
        with self.assertRaises(SnapshotError):
            resolve_source_file(self.src, 'OSTATOK.DB')

    def test_case_insensitive_lookup(self):
        os.rename(os.path.join(self.src, 'CENIC.DB'), os.path.join(self.src, 'cenic.db'))
        self.assertTrue(resolve_source_file(self.src, 'CENIC.DB').endswith('cenic.db'))

    def test_symlink_refused(self):
        link = os.path.join(self.tmp.name, 'live2')
        os.makedirs(link)
        try:
            os.symlink(os.path.join(self.src, 'CENIC.DB'), os.path.join(link, 'CENIC.DB'))
        except (OSError, NotImplementedError):
            self.skipTest('symlinks not permitted for this user')
        with self.assertRaises(SnapshotError):
            resolve_source_file(link, 'CENIC.DB')

    def _read_all(self):
        out = {}
        for n in os.listdir(self.src):
            with open(os.path.join(self.src, n), 'rb') as fh:
                out[n] = (fh.read(), os.stat(os.path.join(self.src, n)).st_mtime_ns)
        return out

    def test_source_never_modified(self):
        before = self._read_all()
        take_stable_snapshot(self.src, self.run, pause_seconds=0, sleep=lambda s: None)
        self.assertEqual(before, self._read_all())

    def test_prune_runs(self):
        base = os.path.join(self.tmp.name, 'runs')
        for n in ('20261001', '20261002', '20261003'):
            os.makedirs(os.path.join(base, n))
        prune_runs(base, 2)
        self.assertEqual(sorted(os.listdir(base)), ['20261002', '20261003'])


if __name__ == '__main__':
    unittest.main()
