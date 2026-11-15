"""Hairshop Pro export model: warehouse policy, stock/quantity, value formatting, XML rendering.

Reading of CENIC/OSTATOK is identical to the legacy Hairshop.lv exporter. The warehouse policy is
an INTENTIONAL BUSINESS DIFFERENCE (owner decision 2026-10-05):

  legacy Hairshop.lv                         Hairshop Pro (this module)
  warehouse id 1..8 = 10000..10007           warehouse id 1..8 = 10000..10007 (identical values)
  warehouse id 9    = 10009                  warehouse id 9    = always 0 (slot kept for the parser)
  quantity = positive Kolvo, ALL SkladKod    quantity = sum of warehouse id 1..8 (allowlist only)

10008, 10009, 10010 (Jelgava, closing), 2377, blank and any unknown SkladKod are ignored and only
reported in diagnostics.
"""
from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from typing import Dict, Iterable, List, Optional, Tuple

# Explicit allowlist (XML warehouse id = position + 1). Never "everything except ...".
ALLOWED_WAREHOUSES: Tuple[str, ...] = ('10000', '10001', '10002', '10003', '10004', '10005', '10006', '10007')
XML_WAREHOUSE_SLOTS = 9          # parser contract: ids 1..9 always present
KNOWN_IGNORED_WAREHOUSES = ('10008', '10009', '10010', '2377')
INT32_MAX = 2 ** 31 - 1
# Hard limit, deliberately not configurable: more distinct SKUs with a fractional Kolvo than this
# is treated as corrupted/changed source data and stops the whole export.
MAX_QUARANTINED_SKUS = 5
MAX_QUARANTINE_LOTS_REPORTED = 20
PRICE_FIELDS = ('price1', 'price2', 'price3', 'price4')

_NET_WS = ''.join(map(chr, [9, 10, 11, 12, 13, 32, 0x85, 0xA0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003,
                            0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200A, 0x2028, 0x2029,
                            0x202F, 0x205F, 0x3000]))
_XML_INVALID = re.compile('[\x00-\x08\x0b\x0c\x0e-\x1f￾￿\ud800-\udfff]')
DECIMAL_RE = re.compile(r'^\d+(\.\d+)?$')


class ExportDataError(Exception):
    """Source data the exporter refuses to turn into stock (fail closed)."""


def net_trim(s: str) -> str:
    """.NET String.Trim() (Char.IsWhiteSpace set) — legacy `code` semantics."""
    return s.strip(_NET_WS)


def to_sku(raw: str) -> str:
    """Legacy ToSku: remove every U+0020; leading zeros and other characters kept verbatim."""
    return raw.replace(' ', '')


def format_number(x: Optional[float]) -> str:
    """Legacy text form: .NET Framework double.ToString() ("G", 15 significant digits) with '.'.
    NULL -> "0". 15 significant digits removes binary float artefacts (12.950000000000001 -> 12.95)."""
    if x is None:
        return '0'
    if x != x or x in (float('inf'), float('-inf')):
        raise ExportDataError('non-finite number %r' % x)
    if x == 0:
        return '0'
    s = format(x, '.15g')
    if 'e' in s:
        mant, exp = s.split('e')
        s = '%sE%s%s' % (mant, exp[0], exp[1:].lstrip('0').rjust(2, '0'))
    return s


def clean_title(raw: str) -> str:
    """Display text for <title>. Unlike legacy RemoveSpecChars there is no pre-escaping (the XML
    writer escapes once). CR/LF become spaces like in legacy; other XML-invalid characters, which
    would abort the legacy writer, become spaces too. Title is diagnostic only for Hairshop Pro."""
    return _XML_INVALID.sub(' ', raw.replace('\r', ' ').replace('\n', ' '))


class StockAggregation:
    """OSTATOK lots -> per (raw TovarKod, allowed warehouse) stock = SUM(max(0, Kolvo)).

    Stock quarantine (owner decision 2026-11-15): a positive, finite, in-range but FRACTIONAL Kolvo
    in an allowed warehouse puts the whole SKU in quarantine — it is exported with 0 in every
    warehouse slot (never rounded, never partially counted) and reported. More than
    MAX_QUARANTINED_SKUS such SKUs, or any too large / non-finite / non-numeric Kolvo, still stops
    the whole export (fail closed): that pattern means a format change or corrupted data, not a typo.
    """

    def __init__(self) -> None:
        self.stock: Dict[Tuple[str, str], int] = defaultdict(int)
        self.rows = 0
        self.counted_lots = 0
        self.negative_lots = 0
        self.zero_or_null_lots = 0
        self.ignored_rows: Counter = Counter()
        self.ignored_positive_qty: Counter = Counter()
        self.unknown_warehouses: Counter = Counter()
        self.errors: List[str] = []
        self.error_count = 0
        # SKU (to_sku form) -> fractional lots that caused the quarantine (bounded sample per SKU).
        self.quarantine: Dict[str, List[dict]] = {}
        self.quarantined_lot_count = 0

    def _quarantine(self, tovar: str, sklad: str, kolvo: float) -> None:
        self.quarantined_lot_count += 1
        lots = self.quarantine.setdefault(to_sku(tovar), [])
        if len(lots) < MAX_QUARANTINE_LOTS_REPORTED:
            lots.append({'warehouse': sklad, 'kolvo': format_number(kolvo)})

    def add(self, tovar: Optional[str], sklad_raw: Optional[str], kolvo: Optional[float]) -> None:
        self.rows += 1
        tovar = tovar or ''
        sklad = net_trim(sklad_raw or '')
        if sklad not in ALLOWED_WAREHOUSES:
            label = sklad or '<blank>'
            self.ignored_rows[label] += 1
            if kolvo is not None and kolvo > 0:
                self.ignored_positive_qty[label] += kolvo
            if sklad not in KNOWN_IGNORED_WAREHOUSES:
                self.unknown_warehouses[label] += 1
            return
        if kolvo is None:
            self.zero_or_null_lots += 1
            return
        # Fail closed: never round or clamp. Type and finiteness first (int(nan)/int(inf) would raise).
        if isinstance(kolvo, bool) or not isinstance(kolvo, (int, float)):
            kind = 'non_numeric'
        elif not math.isfinite(kolvo):
            kind = 'non_finite'
        elif kolvo == 0:
            self.zero_or_null_lots += 1
            return
        elif kolvo < 0:
            self.negative_lots += 1   # max(0, Kolvo): a negative lot never reduces another lot
            return
        elif kolvo > INT32_MAX:
            kind = 'too_large'
        elif kolvo != int(kolvo):
            self._quarantine(tovar, sklad, kolvo)   # SKU-level quarantine, decided in finalize()
            return
        else:
            kind = None
        if kind:
            self.error_count += 1
            if len(self.errors) < 20:   # bounded sample: SKU, warehouse, kind — never a data dump
                self.errors.append('%s Kolvo %r for SKU %r in warehouse %s' % (kind, kolvo, to_sku(tovar), sklad))
            return
        self.counted_lots += 1
        self.stock[(tovar, sklad)] += int(kolvo)

    def finalize(self) -> None:
        """Fail closed on unusable values or too many quarantined SKUs; otherwise remove every
        allowed-warehouse stock entry of a quarantined SKU (all raw spellings of that SKU), so its
        integer lots in other warehouses cannot leak into the export either."""
        if self.error_count:
            raise ExportDataError('OSTATOK: %d lots with unusable Kolvo in allowed warehouses (fail closed): %s' % (
                self.error_count, '; '.join(self.errors[:5])))
        if len(self.quarantine) > MAX_QUARANTINED_SKUS:
            sample = '; '.join('%s %s' % (s, ','.join('%s=%s' % (l['warehouse'], l['kolvo']) for l in lots))
                               for s, lots in sorted(self.quarantine.items())[:5])
            raise ExportDataError('OSTATOK: %d SKUs with fractional Kolvo in allowed warehouses exceed the quarantine '
                                  'limit of %d (fail closed): %s' % (len(self.quarantine), MAX_QUARANTINED_SKUS, sample))
        for key in [k for k in self.stock if to_sku(k[0]) in self.quarantine]:
            del self.stock[key]

    def quarantine_report(self) -> dict:
        return {
            'policy': 'fractional Kolvo in 10000-10007 -> SKU exported with 0 in every warehouse; source unchanged',
            'maxSkus': MAX_QUARANTINED_SKUS,
            'skuCount': len(self.quarantine),
            'lotCount': self.quarantined_lot_count,
            'skus': [{'sku': s, 'lots': lots} for s, lots in sorted(self.quarantine.items())],
        }

    def diagnostics(self) -> dict:
        return {
            'ostatokRows': self.rows, 'countedLots': self.counted_lots, 'negativeLotsIgnored': self.negative_lots,
            'zeroOrNullLots': self.zero_or_null_lots,
            'ignoredRowsByWarehouse': dict(sorted(self.ignored_rows.items())),
            'ignoredPositiveQuantityByWarehouse': {k: format_number(v) for k, v in sorted(self.ignored_positive_qty.items())},
            'unknownWarehouseCodes': dict(sorted(self.unknown_warehouses.items())),
        }


def aggregate_ostatok(rows: Iterable[list], idx: Dict[str, int]) -> StockAggregation:
    agg = StockAggregation()
    i_s, i_t, i_k = idx['SkladKod'], idx['TovarKod'], idx['Kolvo']
    for r in rows:
        agg.add(r[i_t], r[i_s], r[i_k])
    agg.finalize()
    return agg


def verify_quarantine(items: List[dict], quarantined: Iterable[str]) -> int:
    """Independent post-build check: every exported item of a quarantined SKU has 0 everywhere.
    Returns how many exported items are quarantined."""
    q = set(quarantined)
    hit = 0
    for it in items:
        if it['sku'] in q:
            hit += 1
            if it['quantity'] != 0 or any(it['warehouses']):
                raise ExportDataError('quarantined SKU %r would be exported with stock (internal invariant)' % it['sku'])
    return hit


def build_items(cenic_rows: Iterable[list], idx: Dict[str, int], agg: StockAggregation) -> Tuple[List[dict], dict]:
    """One item per CENIC record, in source (legacy) order. Join key = untrimmed TovarKod (legacy)."""
    items: List[dict] = []
    raw_codes = set()
    leading_zero_raw = 0
    for r in cenic_rows:
        raw = r[idx['TovarKod']] or ''
        raw_codes.add(raw)
        sku = to_sku(raw)
        if sku.startswith('0') and len(sku) > 1:
            leading_zero_raw += 1
        if sku in agg.quarantine:
            whs = [0] * len(ALLOWED_WAREHOUSES)
        else:
            whs = [agg.stock.get((raw, w), 0) for w in ALLOWED_WAREHOUSES]
        item = {
            'sku': sku,
            'code': net_trim(r[idx['StrihKod']] or ''),
            'title': clean_title(r[idx['TovarNai']] or ''),
            'capacity': format_number(r[idx['Emkost']]),
            'price1': format_number(r[idx['Cena1']]),
            'price2': format_number(r[idx['Cena2']]),
            'price3': format_number(r[idx['Cena3']]),
            'price4': format_number(r[idx['Cena4']]),
            'warehouses': whs + [0],
            'quantity': sum(whs),
        }
        items.append(item)
    # OSTATOK codes that match a CENIC code only after removing spaces are NOT joined (legacy
    # semantics); report how much allowed stock that leaves out so the owner can decide.
    by_norm = {c.replace(' ', ''): c for c in raw_codes}
    misaligned = Counter()
    for (tovar, _w), qty in agg.stock.items():
        if tovar not in raw_codes and tovar.replace(' ', '') in by_norm:
            misaligned[tovar.strip()] += qty
    diag = {'cenicRows': len(items), 'leadingZeroSkus': leading_zero_raw,
            'allowedStockOnMisalignedCodes': sum(misaligned.values()), 'misalignedCodeCount': len(misaligned),
            'allowedStockWithoutCenic': sum(q for (t, _w), q in agg.stock.items()
                                            if t not in raw_codes and t.replace(' ', '') not in by_norm)}
    return items, diag


def _esc(s: str) -> str:
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def render_xml(items: List[dict]) -> bytes:
    """Same envelope as legacy: UTF-8 BOM, declaration, no indentation, <code></code> for empty."""
    parts = ['<?xml version="1.0" encoding="utf-8"?><root>']
    for it in items:
        parts.append('<item>')
        for k in ('sku', 'code', 'title', 'capacity') + PRICE_FIELDS:
            parts.append('<%s>%s</%s>' % (k, _esc(it[k]), k))
        parts.append('<quantity>%d</quantity><warehouses>' % it['quantity'])
        for i, v in enumerate(it['warehouses'], 1):
            parts.append('<warehouse id="%d">%d</warehouse>' % (i, v))
        parts.append('</warehouses></item>')
    parts.append('</root>')
    return b'\xef\xbb\xbf' + ''.join(parts).encode('utf-8')
