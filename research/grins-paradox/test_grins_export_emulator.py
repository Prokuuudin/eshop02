"""Tests for the research exporter emulator. Run: python -m unittest discover -s research/grins-paradox

Fixtures are tiny synthetic Paradox 7 tables built in a temp dir; no GrinS data is used.
"""
from __future__ import annotations

import os
import struct
import tempfile
import unittest

import grins_export_emulator as em
import verify_export as ve

A, N, I = 0x01, 0x06, 0x16  # Alpha, Number, Autoinc


def enc_alpha(s, size, right=False):
    b = s.encode('cp1257') if isinstance(s, str) else s
    if right:
        b = b' ' * (size - len(b)) + b
    return b.ljust(size, b'\x00')[:size]


def enc_number(x):
    if x is None:
        return b'\x00' * 8
    b = bytearray(struct.pack('>d', x))
    if x >= 0:
        b[0] |= 0x80
    else:
        b = bytearray(v ^ 0xFF for v in b)
    return bytes(b)


def enc_autoinc(v):
    return bytes([((v >> 24) & 0xFF) ^ 0x80]) + (v & 0xFFFFFF).to_bytes(3, 'big')


def make_table(path, fields, rows, records_per_block=None, extra_blocks=(), version=0x0C, encryption2=0):
    """fields: [(name, type, size)]; rows: list of lists of already-encoded field bytes.
    extra_blocks: list of (add_data_size, payload_bytes) appended as physical blocks."""
    rec = sum(f[2] for f in fields)
    bsz = 2048
    hsz = 2048
    per = records_per_block or (bsz - 6) // rec
    blocks = []
    for i in range(0, len(rows), per):
        chunk = rows[i:i + per]
        data = b''.join(b''.join(r) for r in chunk)
        blocks.append(((len(chunk) - 1) * rec, data))
    blocks.extend(extra_blocks)
    hdr = bytearray(hsz)
    struct.pack_into('<HHBB', hdr, 0, rec, hsz, 0, bsz // 1024)
    struct.pack_into('<I', hdr, 6, len(rows))
    struct.pack_into('<HHH', hdr, 0x0C, len(blocks), 1, len(blocks))
    struct.pack_into('<HH', hdr, 0x21, len(fields), 1)
    struct.pack_into('<I', hdr, 0x25, 0xFF00FF00)
    hdr[0x29] = 0x4C
    hdr[0x39] = version
    struct.pack_into('<I', hdr, 0x5C, encryption2)
    struct.pack_into('<H', hdr, 0x6A, 1252)
    pos = 0x78
    for _n, t, s in fields:
        hdr[pos], hdr[pos + 1] = t, s
        pos += 2
    pos += 4 + 4 * len(fields) + 261
    for n, _t, _s in fields:
        nb = n.encode() + b'\x00'
        hdr[pos:pos + len(nb)] = nb
        pos += len(nb)
    out = bytes(hdr)
    for i, (add, data) in enumerate(blocks):
        blk = struct.pack('<HHh', 0 if i == len(blocks) - 1 else i + 2, i + 1, add) + data
        out += blk.ljust(bsz, b'\x00')
    with open(path, 'wb') as fh:
        fh.write(out)


CENIC_FIELDS = [('KeyPx', I, 4), ('TovarKod', A, 14), ('StrihKod', A, 14), ('Xarakter', A, 4), ('SkladKod', A, 6),
                ('TovarNai', A, 40), ('Emkost', N, 8)] + [(f'Pad{i}', N, 8) for i in range(7, 17)] + \
               [('Cena1', N, 8), ('Cena2', N, 8), ('Cena3', N, 8), ('Cena4', N, 8), ('CenaNakl1', N, 8)]
OSTATOK_FIELDS = [('KeyPx', I, 4), ('SkladKod', A, 6), ('TovarKod', A, 14), ('CenaUcetn', N, 8), ('DataPrihod', A, 4),
                  ('DataRashod', A, 4), ('Kolvo', N, 8), ('KolvoOld', N, 8), ('KolvoRezerv', N, 8)]


def cenic_row(key, sku, code, title, cap, p1, p2, p3, p4):
    pads = [enc_number(None)] * 10
    return [enc_autoinc(key), enc_alpha(sku, 14, right=True), enc_alpha(code, 14), enc_alpha('', 4),
            enc_alpha('', 6), enc_alpha(title, 40), enc_number(cap)] + pads + \
           [enc_number(p1), enc_number(p2), enc_number(p3), enc_number(p4), enc_number(1.0)]


def ost_row(key, sklad, sku, kolvo, rezerv=0.0, sku_raw=None):
    tov = sku_raw if sku_raw is not None else enc_alpha(sku, 14, right=True)
    return [enc_autoinc(key), enc_alpha(sklad, 6, right=True), tov, enc_number(1.5), enc_alpha('', 4),
            enc_alpha('', 4), enc_number(kolvo), enc_number(None), enc_number(rezerv)]


class ScalarSemantics(unittest.TestCase):
    def test_sku_normalization(self):
        self.assertEqual(em.to_sku('   ABC123'), 'ABC123')
        self.assertEqual(em.to_sku(" SCISSOR'S HOL"), "SCISSOR'SHOL")
        self.assertEqual(em.to_sku('  007P'), '007P')          # leading zero preserved, no int()
        self.assertEqual(em.to_sku(''), '0')                    # ToSku(null/empty) -> "0"
        self.assertEqual(em.to_sku('\tX'), '\tX')               # only U+0020 is removed

    def test_decimal_conversion(self):
        self.assertEqual(em.to_decimal('12,5'), '12.5')
        self.assertEqual(em.to_decimal(''), '0')
        cases = {11.4: '11.4', 6.4575: '6.4575', 0.1 + 0.2: '0.3', 1e-05: '1E-05', 0.0001: '0.0001',
                 1e15: '1E+15', 123456789012345.0: '123456789012345', -0.0: '0', -2.5: '-2.5',
                 12.950000000000001: '12.95', 1 / 3: '0.333333333333333'}
        for x, s in cases.items():
            self.assertEqual(em.net_double_to_string(x), s, x)

    def test_price3_rounding_is_g15_of_cena3(self):
        # price3 = Cena3.ToString() -> 15 significant digits, no extra rounding step.
        self.assertEqual(em.to_decimal(em.net_to_string(6.150000000000001)), '6.15')
        self.assertEqual(em.to_decimal(em.net_to_string(6.15 * 1.05)), '6.4575')
        self.assertEqual(em.to_decimal(em.net_to_string(em.DB_NULL)), '0')

    def test_int_try_parse(self):
        self.assertEqual(em.net_int_try_parse('5'), 5)
        self.assertEqual(em.net_int_try_parse('-3'), -3)
        for bad in ('2.5', '2,5', '1E+15', '3000000000', '', 'x'):
            self.assertIsNone(em.net_int_try_parse(bad), bad)

    def test_decode_cp1257_like_windows(self):
        self.assertEqual(em.decode_default(b'\xe2\xd7\xeb\x83'), 'ā×ė\x83')

    def test_title_double_escaping(self):
        t = em.remove_spec_chars('L"oreal; A&B <x>')
        self.assertEqual(t, 'L&quot;oreal, A&amp;B &lt;x&gt;')
        self.assertEqual(em.xml_text(t), 'L&amp;quot;oreal, A&amp;amp;B &amp;lt;x&amp;gt;')

    def test_invalid_xml_char_rejected(self):
        with self.assertRaises(em.ParadoxFormatError):
            em.xml_text('bad\x01char')


class TableTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.d = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def _write(self, cenic_rows, ost_rows, **kw):
        make_table(os.path.join(self.d, 'CENIC.DB'), CENIC_FIELDS, cenic_rows)
        make_table(os.path.join(self.d, 'OSTATOK.DB'), OSTATOK_FIELDS, ost_rows, **kw)

    def test_aggregation_lots_negatives_mapping(self):
        self._write(
            [cenic_row(1, '0021P', '4750000000001', 'Šampūns', 0.25, 12.95, 11.4, 6.4575, 0)],
            [ost_row(1, '10000', '0021P', 3.0), ost_row(2, '10000', '0021P', 2.0),   # two lots
             ost_row(3, '10000', '0021P', -4.0),                                    # negative lot ignored
             ost_row(4, '10001', '0021P', 1.5),                                     # fractional ignored
             ost_row(5, '10009', '0021P', 7.0),                                     # XML id 9
             ost_row(6, '10010', '0021P', 5.0),                                     # quantity only
             ost_row(7, '10008', '0021P', 1.0),                                     # quantity only
             ost_row(8, '', '0021P', 2.0),                                          # empty sklad: quantity only
             ost_row(9, '10002', '0021P', None)])                                   # null Kolvo ignored
        items, xml, stats = em.generate(self.d)
        it = items[0]
        self.assertEqual(it['sku'], '0021P')
        self.assertEqual(it['warehouses'], ['5', '0', '0', '0', '0', '0', '0', '0', '7'])
        self.assertEqual(it['quantity'], '20')
        self.assertEqual((it['price1'], it['price2'], it['price3'], it['price4'], it['capacity']),
                         ('12.95', '11.4', '6.4575', '0', '0.25'))
        self.assertEqual(stats['ostatok']['skipped_nonpositive'], 1)
        self.assertEqual(stats['ostatok']['skipped_unparsable'], 2)

    def test_join_uses_untrimmed_tovarkod(self):
        self._write([cenic_row(1, 'ABC', '', 'x', 1, 1, 1, 1, 1)],
                    [ost_row(1, '10000', None, 4.0, sku_raw=b' ABC'.ljust(14, b'\x00'))])
        items, _xml, _ = em.generate(self.d)
        self.assertEqual(items[0]['quantity'], '0')   # exporter misses left-aligned OSTATOK code

    def test_xml_exact_bytes_and_determinism(self):
        self._write([cenic_row(1, 'L30', '', 'L"oreal', 0.2, 12.95, 11.4, 6.4575, 0)], [])
        _i, xml1, _ = em.generate(self.d)
        _i, xml2, _ = em.generate(self.d)
        self.assertEqual(xml1, xml2)
        expected = ('﻿<?xml version="1.0" encoding="utf-8"?><root><item><sku>L30</sku><code></code>'
                    '<title>L&amp;quot;oreal</title><capacity>0.2</capacity><price1>12.95</price1>'
                    '<price2>11.4</price2><price3>6.4575</price3><price4>0</price4><quantity>0</quantity>'
                    '<warehouses>' + ''.join(f'<warehouse id="{i}">0</warehouse>' for i in range(1, 10)) +
                    '</warehouses></item></root>')
        self.assertEqual(xml1, expected.encode('utf-8'))

    def test_physical_block_scan_includes_unchained_blocks_and_skips_empty(self):
        rec = sum(f[2] for f in OSTATOK_FIELDS)
        stale = b''.join(ost_row(99, '10000', 'Z1', 2.0))
        self._write([cenic_row(1, 'Z1', '', 'z', 1, 1, 1, 1, 1)], [ost_row(1, '10000', 'Z1', 1.0)],
                    extra_blocks=[(-rec, b''), (0, stale)])
        items, _x, st = em.generate(self.d)
        self.assertEqual(st['ostatok_reader']['empty_blocks'], 1)
        self.assertEqual(items[0]['warehouses'][0], '3')  # ParadoxReader reads every physical block

    def test_malformed_inputs_rejected(self):
        p = os.path.join(self.d, 'BAD.DB')
        with open(p, 'wb') as fh:
            fh.write(b'\x00' * 10)
        with self.assertRaises(em.ParadoxFormatError):
            em.NetParadoxTable(p)
        make_table(p, OSTATOK_FIELDS, [ost_row(1, '10000', 'A', 1.0)], encryption2=1)
        with self.assertRaises(em.ParadoxFormatError):
            em.NetParadoxTable(p)
        make_table(p, OSTATOK_FIELDS, [ost_row(1, '10000', 'A', 1.0)])
        with open(p, 'r+b') as fh:
            fh.seek(0x0C)
            fh.write(struct.pack('<H', 50))   # claims 50 blocks, file has 1
        with self.assertRaises(em.ParadoxFormatError):
            list(em.NetParadoxTable(p).records())


class CompareTests(unittest.TestCase):
    def test_reference_parse_and_compare(self):
        items = [{'sku': 'A', 'code': '', 'title': 'L&quot;x', 'capacity': '1', 'price1': '1', 'price2': '2',
                  'price3': '3', 'price4': '4', 'quantity': '5', 'warehouses': ['5'] + ['0'] * 8}]
        xml = em.render_xml(items)
        ref = ve.parse_reference(xml)
        res = ve.compare(items, ref)
        self.assertTrue(all(v['pct'] == 100.0 for v in res['fields'].values()))
        ref[0]['price2'] = '2.5'
        res = ve.compare(items, ref)
        self.assertEqual(res['fields']['price2']['matches'], 0)
        self.assertEqual(res['fields']['price2']['abs_diff_max'], '0.5')

    def test_truncated_reference_rejected(self):
        with self.assertRaises(ValueError):
            ve.parse_reference(b'<?xml version="1.0"?><root><item><sku>A</sku>' + b'\x00' * 10)


if __name__ == '__main__':
    unittest.main()
