"""READ-ONLY research emulator of the legacy GrinS -> Hairshop.lv exporter (GrinsSyncService.exe).

Not production code. Never writes to Paradox files (opened 'rb'), never touches the network,
the database or the FTPS source. Output is written only where --out points (outside the repo).

The algorithm below was recovered by static IL disassembly of GrinsSyncService.exe
(SyncService::CreateXmlFile, ToSku, ToDecimal, RemoveSpecChars) and ParadoxReader.dll
(ParadoxFile::Enumerate/GetBlock/GetString, ParadoxRecord::get_DataValues/ConvertBytes*).
See GRINS_PARADOX_RESEARCH_HANDOFF.md for the evidence and the IL offsets.

Exporter semantics reproduced here:
  * tables are read from copyPath (the exporter's own file copy), not from the live dbPath;
  * ParadoxReader walks ALL physical blocks 0..fileBlocks-1 (not the next-block chain);
    records per block = C# int division (addDataSize / recordSize) + 1;
  * a field whose bytes are all 0x00 is DBNull (ToString() == "");
  * Alpha = Encoding.Default bytes up to the first NUL searched from the field start inside the
    block buffer, capped at the field size. Exporter host ANSI code page = 1257 (proven by the
    byte-exact comparison: cp1251 would turn 0xD7/0xEB into Cyrillic, the reference has x / e-dot);
  * Number = Paradox double (sign-bit flip / full inversion), NaN -> DBNull;
  * every value reaches XML through object.ToString(): .NET Framework double.ToString() = "G15";
  * OSTATOK: positional fields [1]=SkladKod, [2]=TovarKod, [6]=Kolvo; a lot counts only when
    int.TryParse(Kolvo.ToString()) succeeds AND the value is > 0;
      total[TovarKod]                 += Kolvo   (all warehouses, including unmapped ones)
      total[TovarKod + "_" + Sklad]   += Kolvo   (only when Sklad.Trim() is not empty)
  * CENIC: positional fields [1] sku, [2] code, [5] title, [6] capacity, [17..20] price1..price4;
    join key = the untrimmed TovarKod string;
  * warehouse ids 1..9 = SkladKod 10000..10007, 10009 (hard-coded).
"""
from __future__ import annotations

import argparse
import hashlib
import os
import re
import struct
import sys

from paradox_reader import read_header

INT32_MIN, INT32_MAX = -2 ** 31, 2 ** 31 - 1

# XML <warehouse id="N"> -> GrinS SkladKod, hard-coded in CreateXmlFile (IL_01F2..IL_0262).
WAREHOUSE_IDS = ('10000', '10001', '10002', '10003', '10004', '10005', '10006', '10007', '10009')

# Positional field indices used by CreateXmlFile (ldc.i4 before ldelem.ref).
CENIC_IDX = {'sku': 1, 'code': 2, 'title': 5, 'capacity': 6,
             'price1': 17, 'price2': 18, 'price3': 19, 'price4': 20}
OSTATOK_IDX = {'sklad': 1, 'tovar': 2, 'kolvo': 6}

# RemoveSpecChars: maps Cyrillic letters (what cp1257 Latvian bytes look like under cp1251) back to
# Latvian. On the cp1257 exporter host this table is a no-op for GrinS data; kept for fidelity.
_LV_FIX = [(1074, 257), (1080, 269), (1079, 275), (1084, 291), (1086, 299), (1085, 311),
           (1087, 316), (1090, 326), (1088, 353), (1099, 363), (1102, 382),
           (1042, 256), (1048, 268), (1047, 274), (1052, 290), (1054, 298), (1053, 310),
           (1055, 315), (1058, 325), (1056, 352), (1067, 362), (1070, 381)]
_SPEC_REPLACEMENTS = [(';', ','), ('\r', ' '), ('\n', ' '), ('"', '&quot;'), ("'", '&quot;'),
                      ('<', '&lt;'), ('>', '&gt;'), ('&', '&amp;'), ('&amp;quot;', '&quot;'),
                      ('&amp;lt;', '&lt;'), ('&amp;gt;', '&gt;')]

# Char.IsWhiteSpace set used by .NET Framework String.Trim().
_NET_WS = ''.join(map(chr, [9, 10, 11, 12, 13, 32, 0x85, 0xA0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003,
                            0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200A, 0x2028, 0x2029,
                            0x202F, 0x205F, 0x3000]))

ALPHA, DATE, SHORT, LONG, CURRENCY, NUMBER, LOGICAL, AUTOINC, BCD = 1, 2, 3, 4, 5, 6, 9, 22, 23


class ParadoxFormatError(ValueError):
    pass


class DBNull:
    """Stand-in for System.DBNull.Value (ToString() == "")."""

    def __str__(self) -> str:
        return ''

    def __repr__(self) -> str:
        return 'DBNull'


DB_NULL = DBNull()

_LONE_SURROGATE = re.compile('[\udc80-\udcff]')


def decode_default(raw: bytes, codepage: str = 'cp1257') -> str:
    """Encoding.Default.GetString on the exporter host. Bytes the code page leaves undefined
    (cp1257: 0x81 0x83 0x88 0x8A 0x8C 0x90 0x98 0x9A 0x9C 0x9F 0xA1 0xA5) become U+0081.. like Windows."""
    s = raw.decode(codepage, errors='surrogateescape')
    return _LONE_SURROGATE.sub(lambda m: chr(ord(m.group()) - 0xDC00), s)


def net_double_to_string(x: float) -> str:
    """.NET Framework double.ToString() ("G" = 15 significant digits), invariant separators."""
    if x != x:
        return 'NaN'
    if x in (float('inf'), float('-inf')):
        return 'Infinity' if x > 0 else '-Infinity'
    if x == 0:
        return '0'  # .NET Framework prints -0.0 as "0"
    s = format(x, '.15g')
    if 'e' in s:
        mant, exp = s.split('e')
        sign = exp[0]
        digits = exp[1:].lstrip('0').rjust(2, '0')
        s = f'{mant}E{sign}{digits}'
    return s


def net_to_string(v) -> str:
    """object.ToString() for the values ParadoxReader produces."""
    if v is DB_NULL or v is None:
        return ''
    if isinstance(v, bool):
        return 'True' if v else 'False'
    if isinstance(v, float):
        return net_double_to_string(v)
    return str(v)


def net_int_try_parse(s: str):
    """int.TryParse(s, out v) with NumberStyles.Integer; returns int or None."""
    m = re.fullmatch(r'[\t\n\v\f\r ]*([+-]?)(\d+)[\t\n\v\f\r \x00]*', s)
    if not m:
        return None
    v = int(m.group(2)) * (-1 if m.group(1) == '-' else 1)
    return v if INT32_MIN <= v <= INT32_MAX else None


def wrap_int32(v: int) -> int:
    return (v + 2 ** 31) % 2 ** 32 - 2 ** 31


def net_trim(s: str) -> str:
    return s.strip(_NET_WS)


def to_sku(s: str) -> str:
    """SyncService.ToSku: empty -> "0"; otherwise remove every U+0020 (Trim() result is discarded)."""
    return '0' if not s else s.replace(' ', '')


def to_decimal(s: str) -> str:
    """SyncService.ToDecimal: empty -> "0"; otherwise replace ',' with '.' (Trim() result discarded)."""
    return '0' if not s else s.replace(',', '.')


def remove_spec_chars(s: str) -> str:
    if not s:
        return s
    for a, b in _LV_FIX:
        s = s.replace(chr(a), chr(b))
    for a, b in _SPEC_REPLACEMENTS:
        s = s.replace(a, b)
    return s


def _flip_signed(b: bytes) -> int:
    """ConvertBytes (xor 0x80 on the first byte, big-endian) + ReadInt16/ReadInt32."""
    v = int.from_bytes(bytes([b[0] ^ 0x80]) + b[1:], 'big')
    bits = 8 * len(b)
    return v - (1 << bits) if v >= 1 << (bits - 1) else v


def _paradox_number(b: bytes) -> float:
    """ConvertBytesNum + ReadDouble."""
    if b[0] & 0x80:
        b = bytes([b[0] & 0x7F]) + b[1:]
    elif any(b):
        b = bytes(x ^ 0xFF for x in b)
    return struct.unpack('>d', b)[0]


def _currency_as_reader(b: bytes) -> float:
    """ParadoxReader decodes Money with ConvertBytes (xor only) -> wrong for negatives; reproduced as-is."""
    return struct.unpack('>d', bytes([b[0] ^ 0x80]) + b[1:])[0]


class NetParadoxTable:
    """Re-implementation of ParadoxReader.ParadoxFile.Enumerate(null) + ParadoxRecord.DataValues."""

    def __init__(self, path: str, codepage: str = 'cp1257'):
        self.path = path
        self.codepage = codepage
        with open(path, 'rb') as fh:
            raw = fh.read(0x2000)
        if len(raw) < 0x78:
            raise ParadoxFormatError(f'{path}: file too short for a Paradox header')
        try:
            self.header = read_header(raw)
        except (ValueError, IndexError, struct.error) as e:
            raise ParadoxFormatError(f'{path}: malformed Paradox header: {e}') from e
        h = self.header
        if h.record_size == 0 or h.block_size == 0:
            raise ParadoxFormatError(f'{path}: zero record/block size')
        # 0xFF00FF00 at 0x25 is the "not encrypted" marker of v4+ tables; the real flag is encryption2 (0x5C).
        if h.encryption not in (0, 0xFF00FF00) or (h.version_id >= 5 and struct.unpack_from('<I', raw, 0x5C)[0]):
            raise ParadoxFormatError(f'{path}: encrypted table')
        self.fields = h.fields
        self.stats = {'blocks_scanned': 0, 'records': 0, 'empty_blocks': 0, 'odd_blocks': []}

    def records(self):
        """Yield DataValues lists in the exact order ParadoxReader enumerates them."""
        h = self.header
        size = os.path.getsize(self.path)
        with open(self.path, 'rb') as fh:
            for block_id in range(h.file_blocks):
                pos = h.header_size + block_id * h.block_size
                fh.seek(pos)
                head = fh.read(6)
                if len(head) < 6:
                    raise ParadoxFormatError(f'{self.path}: block {block_id} beyond EOF ({size} bytes)')
                _nxt, _num, add = struct.unpack('<HHh', head)
                count = int(add / h.record_size) + 1  # C# int division truncates toward zero
                self.stats['blocks_scanned'] += 1
                if count < 0:
                    raise ParadoxFormatError(f'{self.path}: block {block_id} negative record count ({add})')
                if count == 0:
                    self.stats['empty_blocks'] += 1
                    continue
                data = fh.read(count * h.record_size)
                if len(data) < count * h.record_size:
                    raise ParadoxFormatError(f'{self.path}: block {block_id} truncated')
                if count * h.record_size > h.block_size - 6:
                    self.stats['odd_blocks'].append(block_id)
                for rec in range(count):
                    self.stats['records'] += 1
                    yield self._values(data, rec * h.record_size)

    def _values(self, data: bytes, start: int) -> list:
        out = []
        pos = start
        for f in self.fields:
            size = 17 if f.type_code == BCD else f.size
            b = data[pos:pos + size]
            if not any(b):
                out.append(DB_NULL)
            elif f.type_code == ALPHA:
                z = data.find(b'\x00', pos)
                n = -1 - pos if z < 0 else z - pos
                n = min(n, size)
                out.append(decode_default(data[pos:pos + max(n, 0)], self.codepage))
            elif f.type_code == NUMBER:
                v = _paradox_number(b)
                out.append(DB_NULL if v != v else v)
            elif f.type_code == CURRENCY:
                out.append(_currency_as_reader(b))
            elif f.type_code in (LONG, AUTOINC):
                out.append(_flip_signed(b[:4]))
            elif f.type_code == SHORT:
                out.append(_flip_signed(b[:2]))
            elif f.type_code == DATE:
                out.append(('date', _flip_signed(b[:4])))
            elif f.type_code == LOGICAL:
                out.append(b[0] - 128 > 0)
            else:
                out.append(('raw', f.type_code))
            pos += size
        return out


def aggregate_ostatok(table: NetParadoxTable) -> tuple[dict, dict]:
    """First loop of CreateXmlFile. Returns (dict, stats)."""
    d: dict[str, int] = {}
    st = {'rows': 0, 'counted': 0, 'skipped_nonpositive': 0, 'skipped_unparsable': 0}
    for vals in table.records():
        st['rows'] += 1
        tovar = net_to_string(vals[OSTATOK_IDX['tovar']])
        sklad = net_trim(net_to_string(vals[OSTATOK_IDX['sklad']]))
        key = tovar + '_' + sklad
        q = net_int_try_parse(net_to_string(vals[OSTATOK_IDX['kolvo']]))
        if q is None:
            st['skipped_unparsable'] += 1
            continue
        if q <= 0:
            st['skipped_nonpositive'] += 1
            continue
        st['counted'] += 1
        d[tovar] = wrap_int32(d.get(tovar, 0) + q)
        if sklad:
            d[key] = wrap_int32(d.get(key, 0) + q)
    return d, st


_INVALID_XML = re.compile('[\x00-\x08\x0b\x0c\x0e-\x1f￾￿]')


def xml_text(s: str) -> str:
    """XmlWriter.WriteString with default XmlWriterSettings (CheckCharacters, NewLineHandling.Replace)."""
    m = _INVALID_XML.search(s)
    if m:
        raise ParadoxFormatError(f'invalid XML character U+{ord(m.group()):04X} (exporter would abort)')
    s = s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    return re.sub('\r\n|\r|\n', '\r\n', s)


def build_items(cenic: NetParadoxTable, stock: dict):
    """Second loop of CreateXmlFile: one dict per CENIC record in enumeration order."""
    for vals in cenic.records():
        raw = net_to_string(vals[CENIC_IDX['sku']])
        item = {
            'sku': to_sku(raw),
            'code': net_trim(net_to_string(vals[CENIC_IDX['code']])),
            'title': remove_spec_chars(net_to_string(vals[CENIC_IDX['title']])),
            'capacity': to_decimal(net_to_string(vals[CENIC_IDX['capacity']])),
        }
        for k in ('price1', 'price2', 'price3', 'price4'):
            item[k] = to_decimal(net_to_string(vals[CENIC_IDX[k]]))
        item['quantity'] = str(stock[raw]) if raw in stock else '0'
        item['warehouses'] = [str(stock[raw + '_' + w]) if raw + '_' + w in stock else '0'
                              for w in WAREHOUSE_IDS]
        yield item


def render_xml(items) -> bytes:
    parts = ['<?xml version="1.0" encoding="utf-8"?><root>']
    for it in items:
        parts.append('<item>')
        for k in ('sku', 'code', 'title', 'capacity', 'price1', 'price2', 'price3', 'price4', 'quantity'):
            parts.append(f'<{k}>{xml_text(it[k])}</{k}>')
        parts.append('<warehouses>')
        for i, v in enumerate(it['warehouses'], 1):
            parts.append(f'<warehouse id="{i}">{v}</warehouse>')
        parts.append('</warehouses></item>')
    parts.append('</root>')
    return b'\xef\xbb\xbf' + ''.join(parts).encode('utf-8')


def generate(copy_dir: str, codepage: str = 'cp1257'):
    ost = NetParadoxTable(os.path.join(copy_dir, 'OSTATOK.db'), codepage)
    stock, st = aggregate_ostatok(ost)
    cen = NetParadoxTable(os.path.join(copy_dir, 'CENIC.db'), codepage)
    items = list(build_items(cen, stock))
    return items, render_xml(items), {'ostatok': st, 'ostatok_reader': ost.stats, 'cenic_reader': cen.stats}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--copy-dir', required=True, help='directory with CENIC.DB + OSTATOK.DB (exporter copyPath)')
    ap.add_argument('--out', required=True, help='output XML path (must be outside the repository)')
    ap.add_argument('--codepage', default='cp1257')
    a = ap.parse_args(argv)
    repo = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
    if os.path.abspath(a.out).lower().startswith(repo.lower() + os.sep):
        print('refusing to write generated data inside the repository', file=sys.stderr)
        return 2
    items, xml, stats = generate(a.copy_dir, a.codepage)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, 'wb') as fh:
        fh.write(xml)
    print({'items': len(items), 'bytes': len(xml), 'sha256': hashlib.sha256(xml).hexdigest(), **stats})
    return 0


if __name__ == '__main__':
    sys.exit(main())
