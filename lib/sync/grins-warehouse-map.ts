// XML `warehouse id="N"` → GrinS SkladKod. Index 0 here = id="1", index 8 = id="9".
//
// Ids 1..8 = 10000..10007: proven from the legacy Hairshop.lv exporter's code and a byte-exact
// reproduction of its export.xml (GRINS_PARADOX_RESEARCH_HANDOFF.md, 2026-10-05), and identical in
// the Hairshop Pro exporter (tools/grins-pro-exporter).
//
// Id 9 is NOT a real warehouse for Hairshop Pro: the legacy exporter wrote SkladKod 10009 there
// (closed, always 0) — never Jelgava/10010, as assumed earlier — and the Hairshop Pro exporter
// writes a constant 0 (owner decision 2026-10-05: 10008/10009/10010/2377 are not used). The slot
// stays in the XML contract so the parser/preflight see 9 warehouses, but it maps to nothing.
export const GRINS_WAREHOUSE_INDEX_TO_ID: readonly (string | null)[] = [
  '10000', // 1: Centrāla noliktava, Rencēnu iela 10A
  '10001', // 2: Plavnieki, Brāļu Kaudzīšu iela 13, Rīga
  '10002', // 3: Imanta, Anniņmuižas bulvāris 82, Rīga
  '10003', // 4: Liepāja, Graudu iela 43N
  '10004', // 5: Daugavpils, Viestura iela 68
  '10005', // 6: Rīga (veikals), Rencēnu iela 10A
  '10006', // 7: Valmiera, Stacijas iela 17
  '10007', // 8: Rēzekne, Atbrīvošanas aleja 128
  null, //    9: unused slot (legacy 10009, Hairshop Pro always 0) — not Jelgava
]

/** XML warehouse index (1-based) → SkladKod, or null for the unused slot / out of range. */
export function grinsWarehouseIdForIndex(index: number): string | null {
  return GRINS_WAREHOUSE_INDEX_TO_ID[index - 1] ?? null
}
