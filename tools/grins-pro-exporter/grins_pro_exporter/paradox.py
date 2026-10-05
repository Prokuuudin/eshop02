"""Read-only, fail-closed Paradox 7 table reader for the GrinS CENIC and OSTATOK tables.

Value decoding is the reading proven byte-for-byte against the legacy Hairshop.lv exporter
(research/grins-paradox, golden master SHA-256 12a7ff3a...): physical block order, C# record
count per block, all-zero field = NULL, Alpha = bytes up to the first NUL (searched from the
field start, capped at the field size) decoded as cp1257, Number = Paradox double.

On top of that this reader refuses anything it cannot fully account for: unexpected schema,
file size that does not match the header, broken block chain, record counts that disagree
between the header, the chain and the physical scan. A refused table is never exported.
"""
from __future__ import annotations

import hashlib
import os
import re
import struct
from dataclasses import dataclass, field
from typing import Dict, Iterator, List, Optional, Tuple

ALPHA, DATE, SHORT, LONG, CURRENCY, NUMBER, LOGICAL, AUTOINC, BCD = 1, 2, 3, 4, 5, 6, 9, 22, 23
HEADER_READ = 0x2000
_LONE_SURROGATE = re.compile('[\udc80-\udcff]')


class ParadoxError(Exception):
    """Structural problem: the table must not be exported."""


@dataclass(frozen=True)
class Field:
    name: str
    type_code: int
    size: int
    offset: int


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
    key_fields: int
    version_id: int
    encryption1: int
    encryption2: int
    fields: List[Field] = field(default_factory=list)

    def fingerprint(self) -> str:
        """SHA-256 over the ordered (name, type, size) list: any schema change changes it."""
        text = ';'.join('%s:%d:%d' % (f.name, f.type_code, f.size) for f in self.fields)
        return hashlib.sha256(text.encode('ascii', 'backslashreplace')).hexdigest()


@dataclass(frozen=True)
class ExpectedSchema:
    table: str
    record_size: int
    field_count: int
    fingerprint: str
    required: Tuple[Tuple[str, int, int], ...]  # (name, index, type) the exporter relies on


def _u16(b: bytes, o: int) -> int:
    return struct.unpack_from('<H', b, o)[0]


def _u32(b: bytes, o: int) -> int:
    return struct.unpack_from('<I', b, o)[0]


def parse_header(raw: bytes) -> Header:
    if len(raw) < 0x78:
        raise ParadoxError('file too short for a Paradox header')
    try:
        version = raw[0x39]
        h = Header(
            record_size=_u16(raw, 0x00), header_size=_u16(raw, 0x02), file_type=raw[0x04],
            block_size=raw[0x05] * 1024, num_records=_u32(raw, 0x06), file_blocks=_u16(raw, 0x0C),
            first_block=_u16(raw, 0x0E), last_block=_u16(raw, 0x10), key_fields=_u16(raw, 0x23),
            version_id=version, encryption1=_u32(raw, 0x25),
            encryption2=_u32(raw, 0x5C) if version >= 5 else 0,
        )
        num_fields = _u16(raw, 0x21)
        if version < 5:
            raise ParadoxError('unsupported Paradox version 0x%02x' % version)
        if not 0 < num_fields <= 255 or h.record_size == 0 or h.block_size == 0:
            raise ParadoxError('implausible header (fields=%d record=%d block=%d)' % (num_fields, h.record_size, h.block_size))
        if h.header_size < 0x78 or h.header_size > len(raw):
            raise ParadoxError('implausible header size %d' % h.header_size)
        pos = 0x78
        types = []
        for _ in range(num_fields):
            types.append((raw[pos], raw[pos + 1]))
            pos += 2
        pos += 4 + 4 * num_fields
        pos += 261 if version >= 12 else 79
        offset = 0
        for type_code, size in types:
            end = raw.index(b'\x00', pos, h.header_size)
            h.fields.append(Field(raw[pos:end].decode('latin-1'), type_code, size, offset))
            pos = end + 1
            offset += 17 if type_code == BCD else size
    except (IndexError, ValueError, struct.error) as e:
        if isinstance(e, ParadoxError):
            raise
        raise ParadoxError('malformed Paradox header: %s' % e)
    if offset != h.record_size:
        raise ParadoxError('field sizes sum %d != record size %d' % (offset, h.record_size))
    if h.encryption1 not in (0, 0xFF00FF00) or h.encryption2:
        raise ParadoxError('table is encrypted')
    return h


def decode_cp1257(raw: bytes) -> str:
    """Windows cp1257: undefined bytes (0x81, 0x83, ...) map to U+0081.. as Encoding.Default does."""
    s = raw.decode('cp1257', errors='surrogateescape')
    return _LONE_SURROGATE.sub(lambda m: chr(ord(m.group()) - 0xDC00), s)


def _flip_signed(b: bytes) -> int:
    v = int.from_bytes(bytes([b[0] ^ 0x80]) + b[1:], 'big')
    bits = 8 * len(b)
    return v - (1 << bits) if v >= 1 << (bits - 1) else v


def _number(b: bytes) -> Optional[float]:
    if b[0] & 0x80:
        b = bytes([b[0] & 0x7F]) + b[1:]
    else:
        b = bytes(x ^ 0xFF for x in b)
    v = struct.unpack('>d', b)[0]
    return None if v != v else v


class ParadoxTable:
    """One .DB file. `validate()` must pass before `records()` is used for an export."""

    def __init__(self, path: str):
        self.path = path
        with open(path, 'rb') as fh:
            raw = fh.read(HEADER_READ)
        self.header = parse_header(raw)
        self.size = os.path.getsize(path)
        self.index: Dict[str, int] = {f.name: i for i, f in enumerate(self.header.fields)}
        self.validated = False

    # ── structural validation ───────────────────────────────────────────────

    def validate(self, expected: ExpectedSchema) -> dict:
        h = self.header
        name = expected.table
        if h.file_type not in (0, 2):
            raise ParadoxError('%s: not a data table (file type %d)' % (name, h.file_type))
        if h.record_size != expected.record_size or len(h.fields) != expected.field_count:
            raise ParadoxError('%s: record size/field count %d/%d, expected %d/%d' % (
                name, h.record_size, len(h.fields), expected.record_size, expected.field_count))
        fp = h.fingerprint()
        if fp != expected.fingerprint:
            raise ParadoxError('%s: schema fingerprint %s differs from the pinned schema %s' % (name, fp[:16], expected.fingerprint[:16]))
        for fname, idx, ftype in expected.required:
            if self.index.get(fname) != idx or h.fields[idx].type_code != ftype:
                raise ParadoxError('%s: field %s not at index %d with type %d' % (name, fname, idx, ftype))
        expected_size = h.header_size + h.file_blocks * h.block_size
        if self.size != expected_size:
            raise ParadoxError('%s: file size %d != header_size + blocks*block_size = %d (partial or padded copy)' % (
                name, self.size, expected_size))
        per_block_max = (h.block_size - 6) // h.record_size
        physical = 0
        blocks: Dict[int, Tuple[int, int]] = {}
        with open(self.path, 'rb') as fh:
            for block_id in range(h.file_blocks):
                fh.seek(h.header_size + block_id * h.block_size)
                nxt, _prev, add = struct.unpack('<HHh', fh.read(6))
                count = int(add / h.record_size) + 1
                if count > per_block_max or (add >= 0 and add % h.record_size) or (add < 0 and add != -h.record_size):
                    raise ParadoxError('%s: block %d has an invalid record area (addDataSize %d)' % (name, block_id + 1, add))
                physical += count
                blocks[block_id + 1] = (nxt, count)
        chained = 0
        seen = set()
        block = h.first_block if h.num_records else 0
        last = 0
        while block:
            if block in seen or block not in blocks:
                raise ParadoxError('%s: broken block chain at block %d' % (name, block))
            seen.add(block)
            chained += blocks[block][1]
            last = block
            block = blocks[block][0]
        if h.num_records and last != h.last_block:
            raise ParadoxError('%s: block chain ends at %d, header says %d' % (name, last, h.last_block))
        if not (physical == chained == h.num_records):
            raise ParadoxError('%s: record counts disagree (header %d, chain %d, physical %d)' % (
                name, h.num_records, chained, physical))
        self.validated = True
        return {'table': name, 'records': h.num_records, 'blocks': h.file_blocks, 'chainedBlocks': len(seen),
                'recordSize': h.record_size, 'fingerprint': fp, 'sizeBytes': self.size}

    # ── record decoding (proven legacy semantics) ──────────────────────────

    def records(self) -> Iterator[list]:
        if not self.validated:
            raise ParadoxError('%s: records() called before validate()' % self.path)
        h = self.header
        with open(self.path, 'rb') as fh:
            for block_id in range(h.file_blocks):
                fh.seek(h.header_size + block_id * h.block_size)
                _n, _p, add = struct.unpack('<HHh', fh.read(6))
                count = int(add / h.record_size) + 1
                if count <= 0:
                    continue
                data = fh.read(count * h.record_size)
                if len(data) != count * h.record_size:
                    raise ParadoxError('%s: block %d truncated' % (self.path, block_id + 1))
                for rec in range(count):
                    yield self._values(data, rec * h.record_size)

    def _values(self, data: bytes, start: int) -> list:
        out = []
        pos = start
        for f in self.header.fields:
            size = 17 if f.type_code == BCD else f.size
            b = data[pos:pos + size]
            if not any(b):
                out.append(None)
            elif f.type_code == ALPHA:
                z = data.find(b'\x00', pos)
                n = min(size, z - pos) if z >= 0 else 0
                out.append(decode_cp1257(data[pos:pos + n]))
            elif f.type_code == NUMBER:
                out.append(_number(b))
            elif f.type_code in (LONG, AUTOINC):
                out.append(_flip_signed(b[:4]))
            elif f.type_code == SHORT:
                out.append(_flip_signed(b[:2]))
            else:
                out.append(b)  # not used by the exporter; kept raw
            pos += size
        return out


# Pinned from the golden snapshot of 2026-10-05 (CENIC 68 fields / 618 B, OSTATOK 23 fields / 160 B).
CENIC_SCHEMA = ExpectedSchema(
    table='CENIC', record_size=618, field_count=68,
    fingerprint='3acdd1e8a83a582538c9e5c6a8818ab5ec298d702fb76fdfc3b3cc9a6febd85f',
    required=(('TovarKod', 1, ALPHA), ('StrihKod', 2, ALPHA), ('TovarNai', 5, ALPHA), ('Emkost', 6, NUMBER),
              ('Cena1', 17, NUMBER), ('Cena2', 18, NUMBER), ('Cena3', 19, NUMBER), ('Cena4', 20, NUMBER)),
)
OSTATOK_SCHEMA = ExpectedSchema(
    table='OSTATOK', record_size=160, field_count=23,
    fingerprint='1fa051f27a2e0e33809cc05d6428e9dc6046d2bba7bf859495ef4dc93d89ce72',
    required=(('SkladKod', 1, ALPHA), ('TovarKod', 2, ALPHA), ('Kolvo', 6, NUMBER)),
)
