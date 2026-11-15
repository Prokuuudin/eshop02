import os
import tempfile
import unittest

from grins_pro_exporter import model as m
from grins_pro_exporter.preflight import Thresholds, check_items, check_xml_bytes
from grins_pro_exporter.runner import generate_from_dir

from fixtures import cenic, lot, write_snapshot

LOW = Thresholds(min_products=1)


def build(cenic_rows, lots):
    with tempfile.TemporaryDirectory() as d:
        write_snapshot(d, cenic_rows, lots)
        return generate_from_dir(d)


class SkuTests(unittest.TestCase):
    def test_normalization(self):
        self.assertEqual(m.to_sku('        ABC123'), 'ABC123')                 # right-aligned code
        self.assertEqual(m.to_sku("  SCISSOR'S HOL"), "SCISSOR'SHOL")           # internal spaces removed
        self.assertEqual(m.to_sku('     0021P'), '0021P')                       # leading zero kept, never int()
        self.assertEqual(m.to_sku(''), '')                                      # empty stays empty -> preflight fails

    def test_end_to_end_skus(self):
        r = build([cenic(1, '0021P'), cenic(2, 'SC CLEAR'), cenic(3, 'L30')], [])
        self.assertEqual([i['sku'] for i in r['items']], ['0021P', 'SCCLEAR', 'L30'])
        self.assertEqual(r['build']['leadingZeroSkus'], 1)

    def test_empty_sku_fails_preflight(self):
        r = build([cenic(1, ''), cenic(2, 'A')], [])
        with self.assertRaises(Exception) as ctx:
            check_items(r['items'], 0, LOW, None)
        self.assertIn('empty SKU', str(ctx.exception))


class PriceTests(unittest.TestCase):
    def test_format(self):
        cases = {12.0: '12', 11.4: '11.4', 6.4575: '6.4575', 129.188325: '129.188325', 0.0: '0', None: '0',
                 12.950000000000001: '12.95', 0.1 + 0.2: '0.3', 99999999.99: '99999999.99', 1e15: '1E+15'}
        for x, s in cases.items():
            self.assertEqual(m.format_number(x), s, x)
        with self.assertRaises(m.ExportDataError):
            m.format_number(float('nan'))

    def test_cena1_to_4_mapping(self):
        r = build([cenic(1, 'A', price=(12.95, 11.4, 6.4575, 0.0))], [])
        it = r['items'][0]
        self.assertEqual((it['price1'], it['price2'], it['price3'], it['price4']), ('12.95', '11.4', '6.4575', '0'))

    def test_unreasonable_formats_fail_preflight(self):
        r = build([cenic(1, 'A', price=(1e15, 1.0, 1.0, 1.0)), cenic(2, 'B', price=(-1.0, 1.0, 1.0, 1.0))], [])
        with self.assertRaises(Exception) as ctx:
            check_items(r['items'], 0, LOW, None)
        self.assertIn('2 price/capacity values', str(ctx.exception))

    def test_price2_zero_allowed(self):
        r = build([cenic(1, 'A', price=(5.0, 0.0, 1.0, 0.0))], [])
        self.assertEqual(check_items(r['items'], 0, LOW, None)['price2Zero'], 1)


class StockPolicyTests(unittest.TestCase):
    def wh(self, lots, sku='A'):
        r = build([cenic(1, sku)], lots)
        return r['items'][0], r['stock']

    def test_one_and_multiple_batches(self):
        it, _ = self.wh([lot(1, '10000', 'A', 4)])
        self.assertEqual(it['warehouses'][0], 4)
        it, _ = self.wh([lot(1, '10000', 'A', 4), lot(2, '10000', 'A', 6)])
        self.assertEqual(it['warehouses'][0], 10)

    def test_negative_lot_never_reduces_other_lots(self):
        it, st = self.wh([lot(1, '10001', 'A', 10), lot(2, '10001', 'A', -3), lot(3, '10001', 'A', 2)])
        self.assertEqual(it['warehouses'][1], 12)                    # SUM(max(0, Kolvo)), not 9
        self.assertEqual(st['negativeLotsIgnored'], 1)

    def test_zero_null_and_only_negative(self):
        it, _ = self.wh([lot(1, '10002', 'A', 0), lot(2, '10002', 'A', None), lot(3, '10003', 'A', -5)])
        self.assertEqual(it['warehouses'], [0] * 9)
        self.assertEqual(it['quantity'], 0)

    def test_allowlist_and_ignored_warehouses(self):
        lots = [lot(i + 1, w, 'A', i + 1) for i, w in enumerate(m.ALLOWED_WAREHOUSES)]
        lots += [lot(20, '10008', 'A', 100), lot(21, '10009', 'A', 200), lot(22, '10010', 'A', 300),
                 lot(23, '2377', 'A', 400), lot(24, '55555', 'A', 500), lot(25, '', 'A', 600)]
        it, st = self.wh(lots)
        self.assertEqual(it['warehouses'], [1, 2, 3, 4, 5, 6, 7, 8, 0])
        self.assertEqual(it['quantity'], 36)                          # strictly sum(10000..10007)
        self.assertEqual(st['ignoredRowsByWarehouse'], {'10008': 1, '10009': 1, '10010': 1, '2377': 1, '55555': 1, '<blank>': 1})
        self.assertEqual(st['unknownWarehouseCodes'], {'55555': 1, '<blank>': 1})
        self.assertEqual(st['ignoredPositiveQuantityByWarehouse']['10010'], '300')

    def test_unusable_kolvo_in_allowed_warehouse_still_fails_closed(self):
        for bad, kind in ((3e9, 'too_large'), (float('inf'), 'non_finite'), (float('-inf'), 'non_finite')):
            with self.assertRaises(m.ExportDataError) as ctx:
                self.wh([lot(1, '10003', 'A', bad)])
            self.assertIn(kind, str(ctx.exception))
            self.assertIn('fail closed', str(ctx.exception))
        nan = m.StockAggregation()                                    # NaN cannot be written by the Paradox fixture
        nan.add('A', '10003', float('nan'))
        with self.assertRaises(m.ExportDataError) as ctx:
            nan.finalize()
        self.assertIn('non_finite', str(ctx.exception))
        lots = [lot(i, '10001', 'A', 3e9) for i in range(1, 31)]
        with self.assertRaises(m.ExportDataError) as ctx:
            self.wh(lots)
        self.assertIn('30 lots', str(ctx.exception))                  # exact count, bounded sample
        agg = m.StockAggregation()
        for weird in ('7', True, b'7'):                               # never produced by the reader; still refused
            agg.add('A', '10000', weird)
        with self.assertRaises(m.ExportDataError) as ctx:
            agg.finalize()
        self.assertIn('3 lots', str(ctx.exception))
        self.assertIn('non_numeric', str(ctx.exception))

    def test_ignored_warehouse_values_never_quarantine(self):
        it, st = self.wh([lot(1, '10010', 'A', 1.5), lot(2, '10000', 'A', 3)])
        self.assertEqual(it['quantity'], 3)
        self.assertEqual(st['ignoredPositiveQuantityByWarehouse']['10010'], '1.5')

    def test_join_is_exact_code_like_legacy(self):
        it, _ = self.wh([lot(1, '10000', 'SCCLEAR', 4)], sku='SC CLEAR')
        self.assertEqual(it['quantity'], 0)
        r = build([cenic(1, 'SC CLEAR')], [lot(1, '10000', 'SCCLEAR', 4)])
        self.assertEqual(r['build']['allowedStockOnMisalignedCodes'], 4)


def quarantine_build(cenic_rows, lots):
    r = build(cenic_rows, lots)
    return {i['sku']: i for i in r['items']}, r


class StockQuarantineTests(unittest.TestCase):
    """Owner decision 2026-11-15: a fractional Kolvo in 10000-10007 quarantines that SKU only."""

    def test_bc60_799_quarantines_only_that_sku(self):
        items, r = quarantine_build(
            [cenic(1, 'BC6.0'), cenic(2, 'BC6.1')],
            [lot(1, '10000', 'BC6.0', 7.99), lot(2, '10001', 'BC6.0', 4), lot(3, '10002', 'BC6.0', 6),
             lot(4, '10000', 'BC6.1', 50)])
        self.assertEqual(items['BC6.0']['warehouses'], [0] * 9)       # every slot, incl. its integer lots
        self.assertEqual(items['BC6.0']['quantity'], 0)
        self.assertEqual(items['BC6.1']['warehouses'][0], 50)         # rest of the catalog untouched
        self.assertEqual(items['BC6.1']['quantity'], 50)
        q = r['quarantine']
        self.assertEqual((q['skuCount'], q['lotCount'], q['maxSkus'], q['exportedItems']), (1, 1, 5, 1))
        self.assertEqual(q['skus'], [{'sku': 'BC6.0', 'lots': [{'warehouse': '10000', 'kolvo': '7.99'}]}])
        self.assertEqual(r['stock']['countedLots'], 3)               # 2 BC6.0 integer lots read, then removed

    def test_value_is_never_rounded_into_the_xml(self):
        items, r = quarantine_build([cenic(1, 'BC6.0')], [lot(1, '10000', 'BC6.0', 7.99)])
        self.assertNotIn(b'7.99', r['xml'])
        self.assertIn(b'<sku>BC6.0</sku>', r['xml'])                   # SKU still in the feed (productCount unchanged)
        self.assertIn(b'<quantity>0</quantity>', r['xml'])
        for v in (7, 8):
            self.assertNotIn(b'<warehouse id="1">%d</warehouse>' % v, r['xml'])

    def test_integer_zero_negative_values_do_not_quarantine(self):
        items, r = quarantine_build(
            [cenic(1, 'A')],
            [lot(1, '10000', 'A', 8.0), lot(2, '10000', 'A', 2), lot(3, '10001', 'A', 0), lot(4, '10001', 'A', None),
             lot(5, '10002', 'A', -3), lot(6, '10002', 'A', -2.5), lot(7, '10003', 'A', 1)])
        self.assertEqual(items['A']['warehouses'][:4], [10, 0, 0, 1])  # 8.0 is an integer value; negatives ignored
        self.assertEqual(r['quarantine']['skuCount'], 0)
        self.assertEqual(r['quarantine']['skus'], [])
        self.assertEqual(r['stock']['negativeLotsIgnored'], 2)

    def test_quarantine_matches_every_spelling_of_the_sku(self):
        items, r = quarantine_build([cenic(1, 'SC CLEAR')],
                                    [lot(1, '10000', 'SC CLEAR', 0.5), lot(2, '10001', 'SCCLEAR', 4), lot(3, '10002', 'SC CLEAR', 9)])
        self.assertEqual(items['SCCLEAR']['quantity'], 0)
        self.assertEqual(r['build']['allowedStockOnMisalignedCodes'], 0)  # misaligned lot of the SKU removed too

    def test_many_fractional_lots_of_one_sku_are_one_sku(self):
        items, r = quarantine_build([cenic(1, 'A')], [lot(i, '10001', 'A', 0.5) for i in range(1, 31)])
        self.assertEqual(items['A']['quantity'], 0)
        self.assertEqual((r['quarantine']['skuCount'], r['quarantine']['lotCount']), (1, 30))
        self.assertEqual(len(r['quarantine']['skus'][0]['lots']), m.MAX_QUARANTINE_LOTS_REPORTED)

    def test_limit_of_five_skus(self):
        five = ['Q%d' % i for i in range(5)]
        items, r = quarantine_build([cenic(i + 1, s) for i, s in enumerate(five + ['OK'])],
                                    [lot(i + 1, '10000', s, 1.25) for i, s in enumerate(five)] + [lot(9, '10000', 'OK', 3)])
        self.assertEqual(r['quarantine']['skuCount'], 5)
        self.assertEqual(items['OK']['quantity'], 3)
        with self.assertRaises(m.ExportDataError) as ctx:
            build([cenic(i + 1, 'Q%d' % i) for i in range(6)], [lot(i + 1, '10000', 'Q%d' % i, 1.25) for i in range(6)])
        self.assertIn('6 SKUs with fractional Kolvo', str(ctx.exception))
        self.assertIn('limit of 5', str(ctx.exception))

    def test_quarantine_never_masks_other_corruption(self):
        with self.assertRaises(m.ExportDataError) as ctx:
            build([cenic(1, 'A'), cenic(2, 'B')], [lot(1, '10000', 'A', 7.99), lot(2, '10000', 'B', 3e9)])
        self.assertIn('too_large', str(ctx.exception))

    def test_fractional_sku_without_cenic_row_is_reported(self):
        items, r = quarantine_build([cenic(1, 'A')], [lot(1, '10000', 'GHOST', 2.5), lot(2, '10000', 'A', 1)])
        self.assertEqual(items['A']['quantity'], 1)
        self.assertEqual((r['quarantine']['skuCount'], r['quarantine']['exportedItems']), (1, 0))
        self.assertEqual(r['build']['allowedStockWithoutCenic'], 0)

    def test_quarantined_export_passes_preflight_and_xml_round_trip(self):
        items, r = quarantine_build([cenic(1, 'BC6.0'), cenic(2, 'B')],
                                    [lot(1, '10000', 'BC6.0', 7.99), lot(2, '10000', 'B', 2)])
        metrics = check_items(r['items'], 0, LOW, None)
        check_xml_bytes(r['xml'], r['items'])
        self.assertEqual(metrics['totalQuantity'], 2)

    def test_verify_quarantine_detects_leaks(self):
        self.assertEqual(m.verify_quarantine([{'sku': 'A', 'quantity': 0, 'warehouses': [0] * 9}], ['A']), 1)
        with self.assertRaises(m.ExportDataError):
            m.verify_quarantine([{'sku': 'A', 'quantity': 0, 'warehouses': [1] + [0] * 8}], ['A'])
        with self.assertRaises(m.ExportDataError):
            m.verify_quarantine([{'sku': 'A', 'quantity': 3, 'warehouses': [0] * 9}], {'A'})


class XmlTests(unittest.TestCase):
    def test_contract_and_escaping(self):
        r = build([cenic(1, '0021P', code=' 4750000000001', title='L"oreal & Co <x>; a\r\nb')],
                  [lot(1, '10000', '0021P', 2), lot(2, '10007', '0021P', 3)])
        xml = r['xml']
        self.assertTrue(xml.startswith(b'\xef\xbb\xbf<?xml version="1.0" encoding="utf-8"?><root><item><sku>0021P</sku>'))
        self.assertIn('<title>L"oreal &amp; Co &lt;x&gt;; a  b</title>'.encode(), xml)
        self.assertIn(b'<code>4750000000001</code>', xml)
        self.assertIn(b'<quantity>5</quantity><warehouses><warehouse id="1">2</warehouse>', xml)
        self.assertIn(b'<warehouse id="8">3</warehouse><warehouse id="9">0</warehouse></warehouses>', xml)
        self.assertEqual(xml.count(b'<warehouse id='), 9)
        self.assertTrue(xml.endswith(b'</root>'))
        check_xml_bytes(xml, r['items'])

    def test_cp1257_decoding_and_empty_code(self):
        r = build([cenic(1, 'A', title=b'\xd0amp\xfbns \xe2 \x83')], [])     # raw cp1257 bytes
        self.assertIn('<title>Šampūns ā \x83</title>'.encode('utf-8'), r['xml'])  # 0x83 undefined -> U+0083
        self.assertIn('<code></code>'.encode(), r['xml'])

    def test_deterministic(self):
        rows = [cenic(i, 'S%d' % i) for i in range(1, 30)]
        lots = [lot(i, '10001', 'S%d' % i, i) for i in range(1, 30)]
        self.assertEqual(build(rows, lots)['xml'], build(rows, lots)['xml'])

    def test_no_trailing_data_or_nul_tail(self):
        r = build([cenic(1, 'A')], [])
        for bad in (r['xml'] + b'\x00' * 10, r['xml'] + b'<x/>', r['xml'][:-3]):
            with self.assertRaises(Exception):
                check_xml_bytes(bad, r['items'])

    def test_doctype_refused(self):
        r = build([cenic(1, 'A')], [])
        evil = r['xml'].replace(b'<root>', b'<!DOCTYPE r [<!ENTITY a "b">]><root>', 1)
        with self.assertRaises(Exception):
            check_xml_bytes(evil, r['items'])


if __name__ == '__main__':
    unittest.main()
