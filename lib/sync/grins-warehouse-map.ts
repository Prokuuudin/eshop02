// Confirmed by the store owner 2026-07-30 and verified against export_sample.xml
// (item 6580075: warehouse id="1" = 22, already inside the 51-vs-quantity-53 sum,
// so index 1 is the central warehouse itself, not excluded from the feed).
// Index 0 here = XML `warehouse id="1"`, index 8 = `warehouse id="9"`.
export const GRINS_WAREHOUSE_INDEX_TO_ID: readonly string[] = [
  '10000', // 1: Centrāla noliktava, Rencēnu iela 10A
  '10001', // 2: Plavnieki, Brāļu Kaudzīšu iela 13, Rīga
  '10002', // 3: Imanta, Anniņmuižas bulvāris 82, Rīga
  '10003', // 4: Liepāja, Graudu iela 43N
  '10004', // 5: Daugavpils, Viestura iela 68
  '10005', // 6: Rīga (veikals), Rencēnu iela 10A
  '10006', // 7: Valmiera, Stacijas iela 17
  '10007', // 8: Rēzekne, Atbrīvošanas aleja 128
  '10010', // 9: Jelgava, Katoļu iela 1A, LV-3001
]
