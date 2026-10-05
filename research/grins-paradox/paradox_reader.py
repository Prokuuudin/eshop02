"""Minimal READ-ONLY Paradox (.DB) table reader for GrinS research.

Never writes, locks, rebuilds or reindexes anything: files are opened with mode 'rb' only.
Layout follows the publicly documented Paradox format (pxlib / "Paradox file format" by
Kevin Mitchell). Only the field types actually needed are decoded; unknown types are
returned as raw hex so nothing is silently guessed.

Usage (library):  from paradox_reader import read_table
Usage (CLI):      python paradox_reader.py <table.DB> [--encoding cp1257] [--limit N]
"""
from __future__ import annotations

import datetime as _dt
import json
import struct
import sys
from dataclasses import dataclass, field

FIELD_TYPES = {
    0x01: 'Alpha', 0x02: 'Date', 0x03: 'Short', 0x04: 'Long', 0x05: 'Money', 0x06: 'Number',
    0x09: 'Logical', 0x0C: 'Memo', 0x0D: 'BLOB', 0x0E: 'FmtMemo', 0x0F: 'OLE', 0x10: 'Graphic',
    0x14: 'Time', 0x15: 'Timestamp', 0x16: 'Autoinc', 0x17: 'BCD', 0x18: 'Bytes',
}
FILE_TYPES = {0: 'indexed .DB (keyed)', 1: 'primary index .PX', 2: 'non-indexed .DB',
              3: 'non-inc secondary .Xnn', 4: 'secondary .Ynn', 5: 'inc secondary .Xnn',
              6: 'non-inc secondary .XGn', 7: 'secondary .YGn', 8: 'inc secondary .XGn'}
VERSIONS = {3: '3.0', 4: '3.5', 5: '4.x', 6: '4.x', 7: '4.x', 8: '4.x', 9: '4.x',
            10: '5.x', 11: '5.x', 12: '7.x'}


@dataclass
class Field:
    name: str
    type_code: int
    size: int
    offset: int

    @property
    def type_name(self) -> str:
        return FIELD_TYPES.get(self.type_code, f'unknown(0x{self.type_code:02x})')


@dataclass
class Header:
    record_size: int
    header_size: int
    file_type: int
    block_size: int
    num_records: int
    file_blocks: int
    first_block: int
    last_block: int
    num_fields: int
    key_fields: int
    sort_order: int
    write_protected: int
    version_id: int
    code_page: int | None
    table_name: str
    encryption: int
    fields: list[Field] = field(default_factory=list)

    def describe(self) -> dict:
        return {
            'file_type': f'{self.file_type} ({FILE_TYPES.get(self.file_type, "?")})',
            'version_id': f'0x{self.version_id:02x} (Paradox {VERSIONS.get(self.version_id, "?")})',
            'record_size': self.record_size, 'header_size': self.header_size,
            'block_size': self.block_size, 'num_records_header': self.num_records,
            'file_blocks': self.file_blocks, 'first_block': self.first_block, 'last_block': self.last_block,
            'num_fields': self.num_fields, 'key_fields': self.key_fields,
            'sort_order': f'0x{self.sort_order:02x}', 'write_protected': self.write_protected,
            'code_page_header': self.code_page, 'encryption': self.encryption,
            'table_name': self.table_name,
            'fields': [{'name': f.name, 'type': f.type_name, 'type_code': f'0x{f.type_code:02x}',
                        'size': f.size, 'offset': f.offset} for f in self.fields],
        }


def _u16(b: bytes, o: int) -> int:
    return struct.unpack_from('<H', b, o)[0]


def _u32(b: bytes, o: int) -> int:
    return struct.unpack_from('<I', b, o)[0]


def read_header(raw: bytes) -> Header:
    version = raw[0x39]
    extended = version >= 5
    h = Header(
        record_size=_u16(raw, 0x00), header_size=_u16(raw, 0x02), file_type=raw[0x04],
        block_size=raw[0x05] * 1024, num_records=_u32(raw, 0x06), file_blocks=_u16(raw, 0x0C),
        first_block=_u16(raw, 0x0E), last_block=_u16(raw, 0x10), num_fields=_u16(raw, 0x21),
        key_fields=_u16(raw, 0x23), sort_order=raw[0x29], write_protected=raw[0x38],
        version_id=version, code_page=_u16(raw, 0x6A) if extended else None, table_name='',
        encryption=_u32(raw, 0x25),
    )
    pos = 0x78 if extended else 0x58
    types = []
    for _ in range(h.num_fields):
        types.append((raw[pos], raw[pos + 1]))
        pos += 2
    pos += 4                      # table-name pointer
    pos += 4 * h.num_fields       # field-name pointers
    name_len = 261 if version >= 12 else 79
    h.table_name = raw[pos:pos + name_len].split(b'\x00', 1)[0].decode('latin-1')
    pos += name_len
    offset = 0
    for type_code, size in types:
        end = raw.index(b'\x00', pos)
        name = raw[pos:end].decode('latin-1')
        pos = end + 1
        h.fields.append(Field(name, type_code, size, offset))
        offset += size
    if offset != h.record_size:
        raise ValueError(f'field sizes sum {offset} != record size {h.record_size}')
    return h


def _flip_int(b: bytes):
    if not any(b):
        return None
    v = int.from_bytes(b, 'big') ^ (1 << (8 * len(b) - 1))
    if v >= 1 << (8 * len(b) - 1):
        v -= 1 << (8 * len(b))
    return v


def _double(b: bytes):
    if not any(b):
        return None
    if b[0] & 0x80:
        b = bytes([b[0] & 0x7F]) + b[1:]
    else:
        b = bytes(x ^ 0xFF for x in b)
    return struct.unpack('>d', b)[0]


def decode_value(f: Field, b: bytes, encoding: str, raw_alpha: bool = False, errors: str = 'strict'):
    t = f.type_code
    if t == 0x01:
        data = b.split(b'\x00', 1)[0]
        return data if raw_alpha else data.decode(encoding, errors)
    if t in (0x05, 0x06):
        return _double(b)
    if t in (0x03, 0x04, 0x16):
        return _flip_int(b)
    if t == 0x02:
        v = _flip_int(b)
        return None if v is None else _dt.date.fromordinal(v).isoformat()
    if t == 0x09:
        return None if b[0] == 0 else bool(b[0] & 0x7F)
    if t in (0x0C, 0x0D, 0x0E, 0x0F, 0x10):
        # last 10 bytes: offset(4) length(4) modnum(2); leading bytes = inline prefix of text
        ptr = b[-10:]
        return {'mb_offset': _u32(ptr, 0), 'length': _u32(ptr, 4), 'inline_prefix': b[:-10].split(b'\x00', 1)[0].decode(encoding, 'replace')}
    return b.hex()


def iter_blocks(path: str, h: Header):
    """Yield (block_no, records_in_block, block_bytes) following the next-block chain from first_block."""
    seen = set()
    with open(path, 'rb') as fh:
        block = h.first_block
        while block:
            if block in seen:
                raise ValueError(f'block chain loop at {block}')
            seen.add(block)
            fh.seek(h.header_size + (block - 1) * h.block_size)
            data = fh.read(h.block_size)
            nxt, _prev, add = struct.unpack_from('<HHh', data, 0)
            count = 0 if add < 0 else add // h.record_size + 1
            yield block, count, data
            block = nxt


def read_table(path: str, encoding: str = 'cp1252', raw_alpha: bool = False, errors: str = 'strict'):
    """Return (header, rows, stats). rows are dicts keyed by field name."""
    with open(path, 'rb') as fh:
        raw = fh.read(0x2000)
    h = read_header(raw)
    rows = []
    blocks = 0
    for _no, count, data in iter_blocks(path, h):
        blocks += 1
        for i in range(count):
            rec = data[6 + i * h.record_size: 6 + (i + 1) * h.record_size]
            rows.append({f.name: decode_value(f, rec[f.offset:f.offset + f.size], encoding, raw_alpha, errors) for f in h.fields})
    stats = {'blocks_in_chain': blocks, 'records_read': len(rows), 'records_header': h.num_records}
    return h, rows, stats


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('path')
    ap.add_argument('--encoding', default='cp1252')
    ap.add_argument('--limit', type=int, default=3)
    a = ap.parse_args()
    hdr, rs, st = read_table(a.path, a.encoding)
    print(json.dumps({'header': hdr.describe(), 'stats': st, 'sample': rs[:a.limit]}, ensure_ascii=False, indent=1, default=str))
