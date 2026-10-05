import ast
import hashlib
import os
import sys
import unittest
import zipfile

from grins_pro_exporter.compare import compare, legacy_remove_spec_chars
from grins_pro_exporter.model import render_xml

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.join(HERE, '..', 'grins_pro_exporter')
RESEARCH = os.path.abspath(os.path.join(HERE, '..', '..', '..', 'research', 'grins-paradox'))

# Golden master of 2026-10-05 (GRINS_PARADOX_RESEARCH_HANDOFF.md). Data is not in Git; the test
# runs where the snapshot exists (override with the environment variables below).
GOLDEN_DIR = os.environ.get('GRINS_GOLDEN_SNAPSHOT_DIR', r'C:\SyncHairshop\Copy')
GOLDEN_ZIP = os.environ.get('GRINS_GOLDEN_REFERENCE_ZIP', r'C:\SyncHairshop\XML\export.xml.zip')
LEGACY_SHA256 = '12a7ff3ac7f95d91a0acabdb739102c134272803270a398dea7c68be8412cdbf'
LEGACY_SIZE = 8853248
PRO_SHA256 = '706260fef9720c96acf86e12b47abc2e111ca436b8f2cd5545d308808f656dbf'


def item(sku, w=None, q=None, title='T', **prices):
    whs = w or [0] * 9
    it = {'sku': sku, 'code': '', 'title': title, 'capacity': '1', 'price1': '1', 'price2': '2', 'price3': '3', 'price4': '4',
          'warehouses': whs, 'quantity': sum(whs[:8]) if q is None else q}
    it.update(prices)
    return it


def legacy_xml(items):
    """Legacy-shaped XML: warehouses as given, quantity as given, title already legacy-escaped."""
    return render_xml(items)


class CompareTests(unittest.TestCase):
    def test_only_intentional_differences_pass(self):
        legacy = [item('A', w=[1, 0, 0, 0, 0, 0, 0, 0, 4], q=9, title=legacy_remove_spec_chars('L"oreal; x')),
                  item('B', w=[2] + [0] * 8, q=2)]
        pro = [item('A', w=[1] + [0] * 8, title='L"oreal; x'), item('B', w=[2] + [0] * 8)]
        r = compare(legacy_xml(legacy), render_xml(pro), same_snapshot=True)
        self.assertEqual(r['verdict'], 'PASS', r)
        self.assertEqual(r['intentionalDifferences'], {
            'warehouse9 (legacy 10009 -> Pro 0)': 1, 'quantity (legacy all SkladKod -> Pro sum 1..8)': 1,
            'title (single XML escaping instead of legacy double escaping)': 1})
        self.assertEqual(r['legacyMinusProQuantity'], 8)

    def test_price_or_stock_difference_is_suspicious(self):
        legacy = [item('A', w=[1] + [0] * 8)]
        for pro in ([item('A', w=[1] + [0] * 8, price2='2.5')], [item('A', w=[0, 1] + [0] * 7)], [item('B')]):
            r = compare(legacy_xml(legacy), render_xml(pro), same_snapshot=True)
            self.assertEqual(r['verdict'], 'FAIL', pro)
            r = compare(legacy_xml(legacy), render_xml(pro), same_snapshot=False)
            self.assertEqual(r['verdict'], 'REVIEW')                     # time drift between two sources

    def test_pro_invariants_always_fail(self):
        pro = [item('A', w=[1] + [0] * 7 + [5], q=6)]                    # slot 9 used
        r = compare(legacy_xml([item('A', w=[1] + [0] * 7 + [5], q=6)]), render_xml(pro), same_snapshot=False)
        self.assertEqual(r['verdict'], 'FAIL')
        self.assertIn('proWarehouse9NotZero', r['suspiciousDifferences'])


class Python38CompatTests(unittest.TestCase):
    def test_sources_parse_as_python_3_8(self):
        for name in os.listdir(PKG):
            if name.endswith('.py'):
                with open(os.path.join(PKG, name), encoding='utf-8') as fh:
                    ast.parse(fh.read(), filename=name, feature_version=(3, 8))


@unittest.skipUnless(os.path.exists(os.path.join(GOLDEN_DIR, 'CENIC.DB')) and os.path.exists(GOLDEN_ZIP),
                     'golden snapshot not available on this machine')
class GoldenSnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.reference = zipfile.ZipFile(GOLDEN_ZIP).read('Sync/XML/export.xml')
        sys.path.insert(0, RESEARCH)
        import grins_export_emulator as legacy  # research emulator, unchanged
        _items, cls.legacy_xml, _st = legacy.generate(GOLDEN_DIR)
        from grins_pro_exporter.runner import generate_from_dir
        cls.pro = generate_from_dir(GOLDEN_DIR)

    def test_reference_is_the_golden_master(self):
        self.assertEqual(hashlib.sha256(self.reference).hexdigest(), LEGACY_SHA256)
        self.assertEqual(len(self.reference), LEGACY_SIZE)

    def test_legacy_emulator_still_reproduces_reference_byte_for_byte(self):
        self.assertEqual(hashlib.sha256(self.legacy_xml).hexdigest(), LEGACY_SHA256)
        self.assertEqual(self.legacy_xml, self.reference)

    def test_pro_differs_only_by_intentional_policy(self):
        r = compare(self.reference, self.pro['xml'], same_snapshot=True)
        self.assertEqual(r['verdict'], 'PASS', r['suspiciousDifferences'])
        self.assertEqual((r['legacyItems'], r['proItems'], r['commonSkus']), (16179, 16179, 16179))
        self.assertTrue(r['orderSame'])
        for f in ('code', 'capacity', 'price1', 'price2', 'price3', 'price4') + tuple('warehouse%d' % i for i in range(1, 9)):
            self.assertEqual(r['fieldMatches'][f]['pct'], 100.0, f)
        self.assertEqual(r['intentionalDifferences']['quantity (legacy all SkladKod -> Pro sum 1..8)'], 1880)
        self.assertEqual(r['legacyMinusProQuantity'], 7597)              # 10010 6282 + 10008 1310 + 2377 5
        self.assertEqual(r['suspiciousDifferences'], {})

    def test_pro_output_is_pinned(self):
        self.assertEqual(hashlib.sha256(self.pro['xml']).hexdigest(), PRO_SHA256)


if __name__ == '__main__':
    unittest.main()
