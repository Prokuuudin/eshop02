"""Export preflight: everything that must hold before an export.xml may leave this machine.

Thresholds default to the consumer's scheduled-sync preflight (lib/sync/sync-preflight.ts:
feedMinRows 14 000, feedMinRatio 0.9, feedMaxRatio 1.2, stockSumDropHard 0.3, stockSumGrowthHard 3)
so an export that the consumer would block is not published in the first place.
"""
from __future__ import annotations

import io
import xml.etree.ElementTree as ET
from collections import Counter
from dataclasses import dataclass
from typing import List, Optional

from .model import DECIMAL_RE, PRICE_FIELDS, XML_WAREHOUSE_SLOTS


@dataclass
class Thresholds:
    min_products: int = 14000
    max_drop_ratio: float = 0.10
    max_growth_ratio: float = 0.20
    max_quantity_drop_ratio: float = 0.30
    max_quantity_growth_factor: float = 3.0


def parse_xml_no_dtd(xml: bytes) -> ET.Element:
    """Parse an export file. The contract has no DTD, so any DOCTYPE/ENTITY is rejected up front
    (no entity expansion, no external resources) without needing a third-party parser."""
    head = xml[:4096].lower()
    if b'<!doctype' in head or b'<!entity' in xml.lower():
        raise ValueError('XML contains a DTD/entity declaration; refused')
    return ET.parse(io.BytesIO(xml)).getroot()


class PreflightError(Exception):
    def __init__(self, failures: List[str]):
        super().__init__('; '.join(failures[:10]))
        self.failures = failures


def check_items(items: List[dict], leading_zero_source: int, thresholds: Thresholds,
                previous: Optional[dict]) -> dict:
    """Raise PreflightError with every failure found; return metrics when clean."""
    f: List[str] = []
    n = len(items)
    skus = [it['sku'] for it in items]
    counts = Counter(skus)
    dups = [s for s, c in counts.items() if c > 1]
    empty = sum(1 for s in skus if not s)
    ws = sum(1 for s in skus if s != s.strip() or ' ' in s)
    leading_zero = sum(1 for s in skus if len(s) > 1 and s.startswith('0'))
    if n < thresholds.min_products:
        f.append('product count %d < minimum %d' % (n, thresholds.min_products))
    if empty:
        f.append('%d empty SKUs' % empty)
    if dups:
        f.append('%d duplicate SKUs (e.g. %s)' % (len(dups), ', '.join(sorted(dups)[:5])))
    if ws:
        f.append('%d SKUs contain whitespace' % ws)
    if leading_zero != leading_zero_source:
        f.append('leading-zero SKUs %d != source %d' % (leading_zero, leading_zero_source))

    bad_price = 0
    price2_zero = 0
    total_qty = 0
    bad_wh = 0
    bad_qty = 0
    for it in items:
        for p in PRICE_FIELDS + ('capacity',):
            if not DECIMAL_RE.match(it[p]):   # rejects negatives, exponents, NaN/Infinity, commas
                bad_price += 1
        if it['price2'] == '0':
            price2_zero += 1
        whs = it['warehouses']
        if (len(whs) != XML_WAREHOUSE_SLOTS or whs[-1] != 0
                or any((not isinstance(v, int)) or isinstance(v, bool) or v < 0 for v in whs)):
            bad_wh += 1
        elif it['quantity'] != sum(whs[:8]):
            bad_qty += 1
        total_qty += it['quantity']
    if bad_price:
        f.append('%d price/capacity values are not plain non-negative decimals' % bad_price)
    if bad_wh:
        f.append('%d items violate the warehouse contract (9 slots, integers >= 0, slot 9 == 0)' % bad_wh)
    if bad_qty:
        f.append('%d items have quantity != sum(warehouse 1..8)' % bad_qty)

    if previous:
        prev_n = int(previous.get('productCount') or 0)
        if prev_n:
            if n < prev_n * (1 - thresholds.max_drop_ratio):
                f.append('product count %d dropped > %.0f%% vs last good export (%d)' % (n, thresholds.max_drop_ratio * 100, prev_n))
            if n > prev_n * (1 + thresholds.max_growth_ratio):
                f.append('product count %d grew > %.0f%% vs last good export (%d)' % (n, thresholds.max_growth_ratio * 100, prev_n))
        prev_q = int((previous.get('stats') or {}).get('totalQuantity') or 0)
        if prev_q:
            if total_qty < prev_q * (1 - thresholds.max_quantity_drop_ratio):
                f.append('total quantity %d dropped > %.0f%% vs last good export (%d)' % (total_qty, thresholds.max_quantity_drop_ratio * 100, prev_q))
            if total_qty > prev_q * thresholds.max_quantity_growth_factor:
                f.append('total quantity %d grew > x%g vs last good export (%d)' % (total_qty, thresholds.max_quantity_growth_factor, prev_q))
    if f:
        raise PreflightError(f)
    return {'productCount': n, 'uniqueSkus': len(counts), 'leadingZeroSkus': leading_zero,
            'price2Zero': price2_zero, 'price2ZeroRatio': round(price2_zero / n, 6) if n else 0,
            'totalQuantity': total_qty}


def check_xml_bytes(xml: bytes, items: List[dict]) -> None:
    """Round-trip the exact bytes that will be published: well-formed, nothing after </root>,
    same items in the same order (protects against writer bugs and NUL/garbage tails)."""
    f: List[str] = []
    if not xml.startswith(b'\xef\xbb\xbf<?xml version="1.0" encoding="utf-8"?><root>'):
        f.append('unexpected XML prolog')
    if not xml.endswith(b'</root>'):
        f.append('XML does not end exactly with </root> (trailing data)')
    if b'\x00' in xml:
        f.append('XML contains NUL bytes')
    try:
        root = parse_xml_no_dtd(xml)
    except (ET.ParseError, ValueError) as e:
        raise PreflightError(f + ['XML is not well-formed: %s' % e])
    parsed = root.findall('item')
    if len(parsed) != len(items):
        f.append('XML has %d items, model has %d' % (len(parsed), len(items)))
    else:
        for el, it in zip(parsed, items):
            whs = el.findall('warehouses/warehouse')
            if ((el.findtext('sku') or '') != it['sku'] or (el.findtext('price2') or '') != it['price2']
                    or [w.get('id') for w in whs] != [str(i) for i in range(1, XML_WAREHOUSE_SLOTS + 1)]
                    or [int(w.text or '') for w in whs] != it['warehouses']
                    or int(el.findtext('quantity') or '') != it['quantity']):
                f.append('XML item %r does not round-trip' % it['sku'])
                break
    if f:
        raise PreflightError(f)
