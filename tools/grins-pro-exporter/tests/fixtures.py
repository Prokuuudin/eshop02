"""Synthetic Paradox 7 tables with the exact GrinS CENIC/OSTATOK schemas (names/types/sizes only;
no GrinS data). Used by the unit tests instead of real ERP files."""
from __future__ import annotations

import os
import struct
from typing import Dict, List, Optional, Sequence, Tuple

CENIC_FIELDS = [('KeyPx', 22, 4), ('TovarKod', 1, 14), ('StrihKod', 1, 14), ('Xarakter', 1, 45), ('SkladKod', 1, 6), ('TovarNai', 1, 60), ('Emkost', 6, 8), ('Krepost', 6, 8), ('AkcizNalog', 6, 8), ('EdIzm', 1, 6), ('EdIzm1', 1, 6), ('EdIzm2', 1, 6), ('EdIzmKoef1', 6, 8), ('EdIzmKoef2', 6, 8), ('Massa', 6, 8), ('ProcNal', 3, 2), ('SchetKod', 1, 4), ('Cena1', 6, 8), ('Cena2', 6, 8), ('Cena3', 6, 8), ('Cena4', 6, 8), ('TovarGrup', 1, 15), ('UpakKoeff', 6, 8), ('UpakKod', 1, 14), ('NormaZapas1', 6, 8), ('NormaZapas2', 6, 8), ('KlientKod', 1, 6), ('AlkogolGrup', 1, 40), ('PlanPrizn', 9, 1), ('PlanKod', 1, 1), ('DniRezerv', 3, 2), ('CenaUchetn1', 6, 8), ('CenaUchetn2', 6, 8), ('CenaUchetn3', 6, 8), ('CenaUchetn4', 6, 8), ('CenaUchetn5', 6, 8), ('CenaNakl1', 6, 8), ('CenaNakl2', 6, 8), ('CenaNakl3', 6, 8), ('CenaNakl4', 6, 8), ('CenaNakl5', 6, 8), ('DataCenaUchetn1', 2, 4), ('DataCenaUchetn2', 2, 4), ('DataCenaUchetn3', 2, 4), ('DataCenaUchetn4', 2, 4), ('DataCenaUchetn5', 2, 4), ('Parol', 1, 6), ('ParolKorr', 1, 6), ('SozdData', 2, 4), ('KorrData', 2, 4), ('SrokGarantDni', 3, 2), ('SrokGarantChas', 3, 2), ('Brutto', 6, 8), ('EdIzmDef', 3, 2), ('Comment', 12, 20), ('ProcZarPlata', 6, 8), ('ProcProcee', 6, 8), ('TovarNaiKratk', 1, 40), ('TamozKod', 1, 14), ('ValstProizvKod', 1, 2), ('ProcNaklRashod', 6, 8), ('ProcSkid', 6, 8), ('KolvoDefault', 6, 8), ('ProizvodKod', 1, 6), ('TovarZapret', 9, 1), ('PriznKonvCen', 9, 1), ('KolvoVihod', 6, 8), ('Revers', 1, 2)]
OSTATOK_FIELDS = [('KeyPx', 22, 4), ('SkladKod', 1, 6), ('TovarKod', 1, 14), ('CenaUcetn', 6, 8), ('DataPrihod', 2, 4), ('DataRashod', 2, 4), ('Kolvo', 6, 8), ('KolvoOld', 6, 8), ('KolvoRezerv', 6, 8), ('OstatkFakt', 6, 8), ('DataOporn', 2, 4), ('KolvoOporn', 6, 8), ('Parol', 1, 6), ('ParolKorr', 1, 6), ('SozdData', 2, 4), ('KorrData', 2, 4), ('Summa', 6, 8), ('SummaOporn', 6, 8), ('KolvoPrihod', 6, 8), ('SummaPrihod', 6, 8), ('SummaRezerv', 6, 8), ('CenaUcetnDo', 6, 8), ('SummaLVL', 6, 8)]

BLOCK = 2048


def enc_value(ftype: int, size: int, v) -> bytes:
    if v is None:
        return b'\x00' * size
    if ftype == 1:
        b = v.encode('cp1257') if isinstance(v, str) else v
        return b.ljust(size, b'\x00')[:size]
    if ftype == 6:
        b = bytearray(struct.pack('>d', float(v)))
        if v >= 0:
            b[0] |= 0x80
        else:
            b = bytearray(x ^ 0xFF for x in b)
        return bytes(b)
    if ftype == 22:
        return bytes([((v >> 24) & 0xFF) ^ 0x80]) + (v & 0xFFFFFF).to_bytes(3, 'big')
    return b'\x00' * size


def right(s: str, size: int) -> str:
    """GrinS codes are right-aligned with leading spaces."""
    return s.rjust(size)


def write_table(path: str, fields: Sequence[Tuple[str, int, int]], rows: List[Dict[str, object]],
                header_size: int = 4096, per_block: Optional[int] = None,
                extra_blocks: Sequence[Tuple[int, bytes]] = (), num_records: Optional[int] = None,
                chain: Optional[List[int]] = None, encryption2: int = 0) -> None:
    rec = sum(f[2] for f in fields)
    per = per_block or (BLOCK - 6) // rec
    payloads = []
    for i in range(0, len(rows), per):
        chunk = rows[i:i + per]
        data = b''.join(b''.join(enc_value(t, s, r.get(n)) for n, t, s in fields) for r in chunk)
        payloads.append(((len(chunk) - 1) * rec, data))
    if not payloads:
        payloads.append((-rec, b''))
    n_chain = len(payloads)
    payloads.extend(extra_blocks)
    order = chain or list(range(1, n_chain + 1))
    nxt = {b: (order[i + 1] if i + 1 < len(order) else 0) for i, b in enumerate(order)}
    hdr = bytearray(header_size)
    struct.pack_into('<HHBB', hdr, 0, rec, header_size, 0, BLOCK // 1024)
    struct.pack_into('<I', hdr, 6, len(rows) if num_records is None else num_records)
    struct.pack_into('<HHH', hdr, 0x0C, len(payloads), order[0], order[-1])
    struct.pack_into('<HH', hdr, 0x21, len(fields), 1)
    struct.pack_into('<I', hdr, 0x25, 0xFF00FF00)
    hdr[0x29] = 0x4C
    hdr[0x39] = 0x0C
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
    out = bytearray(hdr)
    for i, (add, data) in enumerate(payloads):
        out += (struct.pack('<HHh', nxt.get(i + 1, 0), i + 1, add) + data).ljust(BLOCK, b'\x00')
    with open(path, 'wb') as fh:
        fh.write(bytes(out))


def cenic(key: int, sku: str, price=(10.0, 8.0, 5.0, 0.0), code: str = '', title: str = 'Prece', cap=1.0) -> dict:
    return {'KeyPx': key, 'TovarKod': right(sku, 14) if sku else None, 'StrihKod': code or None, 'TovarNai': title,
            'Emkost': cap, 'Cena1': price[0], 'Cena2': price[1], 'Cena3': price[2], 'Cena4': price[3]}


def lot(key: int, sklad: str, sku: str, kolvo) -> dict:
    return {'KeyPx': key, 'SkladKod': right(sklad, 6) if sklad else None, 'TovarKod': right(sku, 14), 'Kolvo': kolvo}


def write_snapshot(directory: str, cenic_rows: List[dict], ostatok_rows: List[dict], **ostatok_kw) -> str:
    os.makedirs(directory, exist_ok=True)
    write_table(os.path.join(directory, 'CENIC.DB'), CENIC_FIELDS, cenic_rows)
    write_table(os.path.join(directory, 'OSTATOK.DB'), OSTATOK_FIELDS, ostatok_rows, header_size=2048, **ostatok_kw)
    return directory


def catalog(n: int, start: int = 1) -> List[dict]:
    """n plain products (enough rows to pass the minimum-count threshold in tests that lower it)."""
    return [cenic(start + i, 'P%05d' % (start + i)) for i in range(n)]
