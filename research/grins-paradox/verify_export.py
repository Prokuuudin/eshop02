"""READ-ONLY verification: semantic comparison of the emulated export with the reference export.xml,
plus statistical checks of alternative stock / quantity formulas and warehouse roles.

Usage:
  python verify_export.py --copy-dir <dir with CENIC.DB/OSTATOK.DB> --reference <export.xml>
                          [--out <report.json outside the repo>]
Prints aggregates and at most a handful of example SKUs. Never writes next to the inputs.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import sys
from collections import Counter, defaultdict
from decimal import Decimal, ROUND_HALF_EVEN
from xml.sax.saxutils import unescape

import grins_export_emulator as em

FIELDS = ('price1', 'price2', 'price3', 'price4', 'quantity') + tuple(f'warehouse{i}' for i in range(1, 10))
EXAMPLES = 5


def _text(m) -> str | None:
    """Element text as XmlReader would return it (entities decoded, CRLF normalised to LF)."""
    return None if m is None else _nl(unescape(m.group(1)))


def _nl(s: str) -> str:
    return s.replace('\r\n', '\n').replace('\r', '\n')


def parse_reference(xml_bytes: bytes) -> list[dict]:
    """Parse export.xml with a regex tolerant to the exporter's flat, unindented layout."""
    text = xml_bytes.decode('utf-8-sig')
    if not text.rstrip().endswith('</root>'):
        raise ValueError('reference XML is truncated (no </root>)')
    items = []
    for body in re.findall(r'<item>(.*?)</item>', text, flags=re.S):
        it = {k: _text(re.search(f'<{k}>(.*?)</{k}>', body, flags=re.S))
              for k in ('sku', 'code', 'title', 'capacity', 'price1', 'price2', 'price3', 'price4', 'quantity')}
        whs = re.findall(r'<warehouse id="(\d+)">(.*?)</warehouse>', body)
        for wid, val in whs:
            it[f'warehouse{wid}'] = val
        items.append(it)
    return items


def flatten(item: dict) -> dict:
    out = {k: v for k, v in item.items() if k != 'warehouses'}
    for i, v in enumerate(item.get('warehouses', []), 1):
        out[f'warehouse{i}'] = v
    return out


def compare(generated: list[dict], reference: list[dict]) -> dict:
    gen = [{k: (_nl(v) if isinstance(v, str) else v) for k, v in flatten(x).items()} for x in generated]
    dup_g = [k for k, c in Counter(x['sku'] for x in gen).items() if c > 1]
    dup_r = [k for k, c in Counter(x['sku'] for x in reference).items() if c > 1]
    g_by, r_by = {x['sku']: x for x in gen}, {x['sku']: x for x in reference}
    common = [s for s in r_by if s in g_by]
    res = {
        'items_generated': len(gen), 'items_reference': len(reference),
        'positional_sku_match': sum(1 for a, b in zip(gen, reference) if a['sku'] == b['sku']),
        'duplicate_sku_generated': len(dup_g), 'duplicate_sku_reference': len(dup_r),
        'missing_in_generated': [s for s in r_by if s not in g_by][:EXAMPLES],
        'missing_in_generated_count': sum(1 for s in r_by if s not in g_by),
        'missing_in_reference_count': sum(1 for s in g_by if s not in r_by),
        'fields': {},
    }
    # Compare positionally (exact exporter order; duplicates included) and report per field.
    for f in ('sku', 'code', 'title', 'capacity') + FIELDS:
        pairs = list(zip(gen, reference))
        ok = sum(1 for a, b in pairs if a.get(f) == b.get(f))
        diffs = []
        for a, b in pairs:
            if a.get(f) != b.get(f):
                try:
                    diffs.append(abs(Decimal(a.get(f)) - Decimal(b.get(f))))
                except Exception:
                    pass
        res['fields'][f] = {
            'matches': ok, 'total': len(pairs), 'pct': round(100 * ok / len(pairs), 4) if pairs else None,
            'mismatch_examples': [(a['sku'], a.get(f), b.get(f)) for a, b in pairs if a.get(f) != b.get(f)][:EXAMPLES],
            'abs_diff_max': str(max(diffs)) if diffs else '0',
            'abs_diff_mean': str(sum(diffs) / len(diffs)) if diffs else '0',
            'abs_diff_median': str(statistics.median(diffs)) if diffs else '0',
        }
    return res


def load_rows(path: str, codepage: str) -> tuple[em.NetParadoxTable, list[list]]:
    t = em.NetParadoxTable(path, codepage)
    return t, list(t.records())


def num(v) -> float | None:
    return v if isinstance(v, float) else None


def stock_analysis(ost_rows: list[list], ost_names: list[str], cen_rows: list[list], reference: list[dict]) -> dict:
    ix = {n: i for i, n in enumerate(ost_names)}
    i_s, i_t, i_k, i_r = ix['SkladKod'], ix['TovarKod'], ix['Kolvo'], ix['KolvoRezerv']
    per = defaultdict(lambda: defaultdict(list))   # raw tovar -> sklad -> [(kolvo, rezerv)]
    sklad_stats = defaultdict(Counter)
    for r in ost_rows:
        tovar = em.net_to_string(r[i_t])
        sklad = em.net_trim(em.net_to_string(r[i_s]))
        k, rz = num(r[i_k]), num(r[i_r])
        per[tovar][sklad].append((k, rz))
        st = sklad_stats[sklad or '<empty>']
        st['rows'] += 1
        if k is None:
            st['kolvo_null'] += 1
            continue
        if k > 0:
            st['positive_rows'] += 1
            st['sum_positive_x1000'] += round(k * 1000)
        if k < 0:
            st['negative_rows'] += 1
        if k != int(k):
            st['fractional_rows'] += 1
        st['sum_all_x1000'] += round(k * 1000)
        if rz:
            st['rezerv_nonzero_rows'] += 1

    def f_exporter(lots):
        s = 0
        for k, _ in lots:
            q = em.net_int_try_parse(em.net_to_string(k if k is not None else em.DB_NULL))
            if q is not None and q > 0:
                s += q
        return s

    formulas = {
        'A_sum_kolvo': lambda lots: sum(k or 0 for k, _ in lots),
        'B_max0_sum_kolvo': lambda lots: max(0, sum(k or 0 for k, _ in lots)),
        'C_sum_max0_kolvo': lambda lots: sum(max(0, k or 0) for k, _ in lots),
        'D_sum_kolvo_minus_rezerv': lambda lots: sum((k or 0) - (rz or 0) for k, rz in lots),
        'E_exporter_sum_positive_int_kolvo': f_exporter,
    }

    def fmt(x):
        return str(int(x)) if float(x).is_integer() else repr(x)

    cen_raw = [em.net_to_string(r[em.CENIC_IDX['sku']]) for r in cen_rows]
    res = {'sklad_stats': {k: dict(v) for k, v in sorted(sklad_stats.items())}, 'warehouse_formulas': {},
           'quantity_formulas': {}}
    for name, fn in formulas.items():
        ok = tot = 0
        for raw, ref in zip(cen_raw, reference):
            for i, w in enumerate(em.WAREHOUSE_IDS, 1):
                tot += 1
                ok += fmt(fn(per.get(raw, {}).get(w, []))) == ref[f'warehouse{i}']
        res['warehouse_formulas'][name] = {'matches': ok, 'total': tot, 'pct': round(100 * ok / tot, 4)}

    all_sklads = sorted({s for d in per.values() for s in d})
    q_variants = {
        '1_sum_xml_warehouses': None,
        '2_sum_10000_10007_10009': list(em.WAREHOUSE_IDS),
        '3_plus_10010': list(em.WAREHOUSE_IDS) + ['10010'],
        '4_plus_10010_10008': list(em.WAREHOUSE_IDS) + ['10010', '10008'],
        '5_all_nonempty_sklad': [s for s in all_sklads if s],
        '6_exporter_all_rows_incl_empty_sklad': all_sklads,
    }
    pos = formulas['E_exporter_sum_positive_int_kolvo']
    for name, sk in q_variants.items():
        ok = 0
        for raw, ref in zip(cen_raw, reference):
            if sk is None:
                val = sum(int(ref[f'warehouse{i}']) for i in range(1, 10))
            else:
                val = sum(pos(per.get(raw, {}).get(s, [])) for s in sk)
            ok += str(val) == ref['quantity']
        res['quantity_formulas'][name] = {'matches': ok, 'total': len(reference), 'pct': round(100 * ok / len(reference), 4)}

    # Why quantity > sum(xml warehouses): attribute the gap to SkladKod values outside the XML map.
    gap = Counter()
    gap_items = 0
    for raw, ref in zip(cen_raw, reference):
        diff = int(ref['quantity']) - sum(int(ref[f'warehouse{i}']) for i in range(1, 10))
        if diff:
            gap_items += 1
            for s, lots in per.get(raw, {}).items():
                if s not in em.WAREHOUSE_IDS and pos(lots):
                    gap[s or '<empty>'] += 1
    res['quantity_gt_sum_items'] = gap_items
    res['quantity_gap_contributing_sklad_items'] = dict(gap)
    res['quantity_lt_sum_items'] = sum(
        1 for ref in reference if int(ref['quantity']) < sum(int(ref[f'warehouse{i}']) for i in range(1, 10)))
    return res


def price_analysis(cen_rows: list[list], cen_names: list[str], reference: list[dict]) -> dict:
    ix = {n: i for i, n in enumerate(cen_names)}

    def s(v):
        return em.to_decimal(em.net_to_string(v))

    res = {'field_at_index': {k: cen_names[i] for k, i in em.CENIC_IDX.items()}}
    for col in ('Cena1', 'Cena2', 'Cena3', 'Cena4'):
        for p in ('price1', 'price2', 'price3', 'price4'):
            ok = sum(1 for r, ref in zip(cen_rows, reference) if s(r[ix[col]]) == ref[p])
            if ok > len(reference) * 0.5:
                res[f'{p}=={col}'] = ok
    q = Decimal('0.000001')
    ok_old = sum(1 for r, ref in zip(cen_rows, reference)
                 if isinstance(r[ix['CenaNakl1']], float)
                 and Decimal(repr(r[ix['CenaNakl1']] * 1.05)).quantize(q, ROUND_HALF_EVEN).normalize() == Decimal(ref['price3']).normalize())
    res['old_hypothesis_price3==round(CenaNakl1*1.05,6)'] = ok_old
    return res


def sku_analysis(cen_rows: list[list], ost_rows: list[list], ost_names: list[str]) -> dict:
    raws = [em.net_to_string(r[em.CENIC_IDX['sku']]) for r in cen_rows]
    skus = [em.to_sku(x) for x in raws]
    norm = Counter(skus)
    raw_set = set(raws)
    i_t = ost_names.index('TovarKod')
    ost_raw = {em.net_to_string(r[i_t]) for r in ost_rows}
    by_stripped = defaultdict(set)
    for x in raw_set:
        by_stripped[x.replace(' ', '')].add(x)
    padding_mismatch = sorted(x for x in ost_raw if x not in raw_set and x.replace(' ', '') in by_stripped)
    return {
        'cenic_rows': len(raws), 'unique_raw': len(raw_set), 'unique_sku': len(norm),
        'empty_raw': sum(1 for x in raws if not x), 'sku_zero_from_empty': sum(1 for x in raws if not x),
        'duplicate_sku': sum(1 for c in norm.values() if c > 1),
        'collisions_after_space_removal': sum(1 for v in by_stripped.values() if len(v) > 1),
        'internal_spaces': sum(1 for x in raws if ' ' in x.strip(' ')),
        'leading_zero_sku': sum(1 for x in skus if len(x) > 1 and x.startswith('0')),
        'max_raw_len': max(map(len, raws)), 'non_ascii_sku': sum(1 for x in skus if not x.isascii()),
        'ostatok_tovar_not_in_cenic_but_matches_after_space_removal': len(padding_mismatch),
        'ostatok_tovar_without_cenic': sum(1 for x in ost_raw if x.replace(' ', '') not in by_stripped),
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--copy-dir', required=True)
    ap.add_argument('--reference', required=True)
    ap.add_argument('--out')
    ap.add_argument('--codepage', default='cp1257')
    a = ap.parse_args(argv)
    with open(a.reference, 'rb') as fh:
        ref_bytes = fh.read()
    reference = parse_reference(ref_bytes)
    items, xml, gen_stats = em.generate(a.copy_dir, a.codepage)
    ost, ost_rows = load_rows(os.path.join(a.copy_dir, 'OSTATOK.db'), a.codepage)
    cen, cen_rows = load_rows(os.path.join(a.copy_dir, 'CENIC.db'), a.codepage)
    ost_names = [f.name for f in ost.fields]
    cen_names = [f.name for f in cen.fields]
    report = {
        'byte_identical': xml == ref_bytes,
        'generator_stats': gen_stats,
        'comparison': compare(items, reference),
        'sku': sku_analysis(cen_rows, ost_rows, ost_names),
        'prices': price_analysis(cen_rows, cen_names, reference),
        'stock': stock_analysis(ost_rows, ost_names, cen_rows, reference),
    }
    text = json.dumps(report, ensure_ascii=False, indent=1, default=str)
    if a.out:
        repo = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
        if os.path.abspath(a.out).lower().startswith(repo.lower() + os.sep):
            print('refusing to write report inside the repository', file=sys.stderr)
            return 2
        with open(a.out, 'w', encoding='utf-8') as fh:
            fh.write(text)
    print(text)
    return 0


if __name__ == '__main__':
    sys.exit(main())
