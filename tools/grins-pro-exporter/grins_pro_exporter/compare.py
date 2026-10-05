"""Legacy (Hairshop.lv) export.xml vs Hairshop Pro export.xml, with every difference classified.

INTENTIONAL (owner-approved warehouse policy / formatting):
  warehouse9   legacy = SkladKod 10009, Pro = always 0
  quantity     legacy = positive Kolvo over all SkladKod, Pro = sum(warehouse 1..8)
  title        legacy pre-escapes (RemoveSpecChars) then the writer escapes again; Pro escapes once.
               Counted intentional only when legacy == RemoveSpecChars(Pro title).
Everything else (SKU set/order, code, capacity, price1..4, warehouse1..8, Pro invariants) is
SUSPICIOUS. With --same-snapshot the verdict is FAIL on any suspicious difference; across two
different points in time (primary vs candidate) price/stock drift is expected and the verdict
is REVIEW.
"""
from __future__ import annotations

from collections import Counter
from typing import Dict, List

from .preflight import parse_xml_no_dtd

PRICE_FIELDS = ('price1', 'price2', 'price3', 'price4')
STRICT_FIELDS = ('code', 'capacity') + PRICE_FIELDS + tuple('warehouse%d' % i for i in range(1, 9))
SAMPLE = 5

_LV_FIX = [(1074, 257), (1080, 269), (1079, 275), (1084, 291), (1086, 299), (1085, 311), (1087, 316), (1090, 326),
           (1088, 353), (1099, 363), (1102, 382), (1042, 256), (1048, 268), (1047, 274), (1052, 290), (1054, 298),
           (1053, 310), (1055, 315), (1058, 325), (1056, 352), (1067, 362), (1070, 381)]
_SPEC = [(';', ','), ('\r', ' '), ('\n', ' '), ('"', '&quot;'), ("'", '&quot;'), ('<', '&lt;'), ('>', '&gt;'),
         ('&', '&amp;'), ('&amp;quot;', '&quot;'), ('&amp;lt;', '&lt;'), ('&amp;gt;', '&gt;')]


def legacy_remove_spec_chars(s: str) -> str:
    """GrinsSyncService.RemoveSpecChars, recovered from IL (see research/grins-paradox)."""
    if not s:
        return s
    for a, b in _LV_FIX:
        s = s.replace(chr(a), chr(b))
    for a, b in _SPEC:
        s = s.replace(a, b)
    return s


def read_items(xml: bytes) -> List[Dict[str, str]]:
    root = parse_xml_no_dtd(xml)
    out = []
    for el in root.findall('item'):
        it = {k: (el.findtext(k) or '') for k in ('sku', 'code', 'title', 'capacity', 'quantity') + PRICE_FIELDS}
        for w in el.findall('warehouses/warehouse'):
            it['warehouse' + (w.get('id') or '?')] = (w.text or '').strip()
        out.append(it)
    return out


def compare(legacy_xml: bytes, pro_xml: bytes, same_snapshot: bool) -> dict:
    legacy, pro = read_items(legacy_xml), read_items(pro_xml)
    lb = {x['sku']: x for x in legacy}
    pb = {x['sku']: x for x in pro}
    suspicious: Counter = Counter()
    samples: Dict[str, list] = {}
    intentional: Counter = Counter()
    fields_ok: Counter = Counter()

    def flag(kind: str, example) -> None:
        suspicious[kind] += 1
        samples.setdefault(kind, [])
        if len(samples[kind]) < SAMPLE:
            samples[kind].append(example)

    for kind, n in (('duplicateSkuLegacy', len(legacy) - len(lb)), ('duplicateSkuPro', len(pro) - len(pb))):
        if n:
            suspicious[kind] += n
    only_l = [s for s in lb if s not in pb]
    only_p = [s for s in pb if s not in lb]
    for s in only_l:
        flag('skuOnlyInLegacy', s)
    for s in only_p:
        flag('skuOnlyInPro', s)
    common = [s for s in lb if s in pb]
    order_same = [x['sku'] for x in legacy if x['sku'] in pb] == [x['sku'] for x in pro if x['sku'] in lb]
    if not order_same:
        flag('orderDiffers', 'relative order of common SKUs differs')
    quantity_delta = 0
    for s in common:
        a, b = lb[s], pb[s]
        for f in STRICT_FIELDS:
            if a.get(f) == b.get(f):
                fields_ok[f] += 1
            else:
                flag(f, (s, a.get(f), b.get(f)))
        # Pro invariants
        try:
            whs = [int(b.get('warehouse%d' % i, 'x')) for i in range(1, 10)]
            qty = int(b['quantity'])
        except ValueError:
            flag('proInvariantNotInteger', s)
            continue
        if whs[8] != 0:
            flag('proWarehouse9NotZero', (s, whs[8]))
        if qty != sum(whs[:8]):
            flag('proQuantityNotSumOf1to8', (s, qty, sum(whs[:8])))
        # intentional differences
        if a.get('warehouse9') != b.get('warehouse9'):
            intentional['warehouse9 (legacy 10009 -> Pro 0)'] += 1
        if a.get('quantity') != b.get('quantity'):
            intentional['quantity (legacy all SkladKod -> Pro sum 1..8)'] += 1
            try:
                quantity_delta += int(a['quantity']) - qty
            except ValueError:
                flag('legacyQuantityNotInteger', s)
        else:
            fields_ok['quantity'] += 1
        if a.get('title') == b.get('title'):
            fields_ok['title'] += 1
        elif a.get('title') == legacy_remove_spec_chars(b.get('title', '')):
            intentional['title (single XML escaping instead of legacy double escaping)'] += 1
        else:
            flag('title', (s, a.get('title'), b.get('title')))
    for s in common:
        if lb[s].get('warehouse9') == pb[s].get('warehouse9'):
            fields_ok['warehouse9'] += 1
    total = len(common)
    if same_snapshot:
        verdict = 'FAIL' if suspicious else 'PASS'
    else:
        hard = {k for k in suspicious if k.startswith('pro') or k.startswith('duplicate') or k == 'legacyQuantityNotInteger'}
        verdict = 'FAIL' if hard else ('REVIEW' if suspicious else 'PASS')
    return {
        'verdict': verdict, 'sameSnapshot': same_snapshot,
        'legacyItems': len(legacy), 'proItems': len(pro), 'commonSkus': total, 'orderSame': order_same,
        'fieldMatches': {f: {'matches': fields_ok[f], 'total': total, 'pct': round(100.0 * fields_ok[f] / total, 4) if total else None}
                         for f in ('sku',) + STRICT_FIELDS + ('warehouse9', 'quantity', 'title') if f != 'sku'},
        'intentionalDifferences': dict(intentional),
        'legacyMinusProQuantity': quantity_delta,
        'suspiciousDifferences': dict(suspicious),
        'suspiciousSamples': samples,
    }
