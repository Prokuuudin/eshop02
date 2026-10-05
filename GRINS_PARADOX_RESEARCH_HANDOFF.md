# GRINS PARADOX RESEARCH — HANDOFF

Last updated: 2026-10-05 (fresh SyncHairshop bundle). Для любого следующего агента (Claude, Codex, другой) —
читать целиком, затем протокол «ПРИЁМ» внизу. Секретов и ERP-дампов в файле нет — так и держать.

## 1. GOAL

Независимо воспроизвести штатный `export.xml` Hairshop.lv из Paradox-таблиц GrinS и доказать точные правила
SKU / цен / остатков / `quantity` / `warehouses`, чтобы затем (ОТДЕЛЬНО, после подтверждения владельца) спроектировать
собственный exporter GrinS → Hairshop Pro. Этап = только reverse engineering + verification. Production не трогается.

## 2. CURRENT STATE — ЗАДАЧА ВОСПРОИЗВЕДЕНИЯ РЕШЕНА

- **FACT: независимый эмулятор выдаёт XML, байт-в-байт идентичный эталону** (SHA-256 обоих
  `12a7ff3ac7f95d91a0acabdb739102c134272803270a398dea7c68be8412cdbf`, 8 853 248 B, 16 179 items) из `Copy/CENIC.DB` +
  `Copy/OSTATOK.DB` свежего комплекта. Все 18 полей × 16 179 = 100 %.
- Алгоритм восстановлен из IL `GrinsSyncService.exe` + `ParadoxReader.dll` (статически, reflection-only, без
  выполнения кода) и подтверждён байтовым совпадением.
- Блокер прошлой сессии (копии 2020 года) снят: свежий комплект от 2026-10-05.
- Production exporter НЕ писался. Sync/ENV/БД/FTPS не трогались.

## 3. INPUT FILES (вне репозитория, не коммитить)

- Комплект: `C:\SyncHairshop\` (копия распаковки) == `C:\Users\User\Desktop\ESHOP_M+ MATERIALS\SyncHairshop\`
  (`diff -rq` пусто), исходный архив `...\ESHOP_M+ MATERIALS\SyncHairshop.zip` (646 записей).
- Эталон, извлечённый из ZIP: `C:\tmp\grins-paradox-research\input-2026-10-05\reference-export.xml`.
- Выходы: `C:\tmp\grins-paradox-research\out-2026-10-05\` (`generated-export.xml`, `verify-report.json`).
- IL-дампы (содержат секреты EXE — НЕ копировать никуда): только в scratchpad сессии, не сохранены в проект.
- Старый снимок 2020 г. (`C:\tempGrinS\`, `C:\tmp\grins-paradox-research\input\`) — устарел, не использовать.

## 4. SHA-256

| file | size | SHA-256 |
|---|---:|---|
| Copy/CENIC.DB | 11 980 800 | `03b807c98cf33db14a8a2e8f24711d8aa57733940b0c6a2b1ed3cb6d0835416e` |
| Copy/CENIC.PX | 73 728 | `2feb94faff10c9a74adb2db413df3fa9c3ee581acafe28ca7031121137dff53f` |
| Copy/CENIC.MB | 8 192 | `d4f1635b2214001144f18be1640f8f508f7b628696c13737b7935db0c62a1c90` |
| Copy/OSTATOK.DB | 80 711 680 | `3160cc7650a8adba0c7e3839bdcc09eb5e1c47655773231b6756e4b064b65675` |
| Copy/OSTATOK.PX | 407 552 | `c64c376e46d7e42ab0aaa872cd33ee78579566ce14b82cc1475d0a0dd5c95464` |
| XML/export.xml (аномальный) | 552 968 764 | `6575fd219d8f8d72e3a8f8262d220711e9114064c526c1ef6123032cc6028c4e` |
| XML/export.xml.zip | 677 912 | `f204ba5750c524ed877a731275d3f2fe2d5de06086b19ca419af866f731ff439` |
| ZIP-entry `Sync/XML/export.xml` = эталон | 8 853 248 | `12a7ff3ac7f95d91a0acabdb739102c134272803270a398dea7c68be8412cdbf` |
| GrinsSyncService.exe | 14 848 | `f91e272e9b1d9bbd13f3e2cc2f6574ec990f9cd3cdb661a29e38d5ba755e2338` |
| GrinsSyncService.exe.config | 578 | `1158bd46124509868954a3f313a95a25204e8d5eef5981e28ae4f5a79a85013f` |
| GrinsSyncService.pdb | 40 448 | `abfc6ab48664c8c4cd9c1f2e77f094674b5f3d8c139598afae5c489c72589c85` |
| ParadoxReader.dll | 23 552 | `aefbf6a7de919d9481ea339dfb546e1b019ab7d21608a4b50f440801fb2752cc` |
| SyncHairshop.zip (полученный архив) | 77 533 298 | `970c48607e55b83692d5bf1c92a3019c1c6fe9f679bcd6b5573d01d3d298af33` |

## 5. CENIC STRUCTURE (свежий)

Paradox 7.x (`0x0C`), keyed (`fileType=0`, 1 key field `KeyPx`), record 618 B, header 4096 B, block 2048 B,
5 848 блоков, **16 179 записей** (= item'ов в XML), 68 полей — схема идентична снимку 2020 (полная таблица полей/
offset'ов: `python research/grins-paradox/paradox_reader.py C:/SyncHairshop/Copy/CENIC.DB --limit 0`). Поля, используемые exporter,
по ПОЗИЦИИ: `[1] TovarKod A14`, `[2] StrihKod A14`, `[5] TovarNai A60`, `[6] Emkost N`, `[17] Cena1`, `[18] Cena2`,
`[19] Cena3`, `[20] Cena4` (N = Paradox Number/double). Заголовочная кодовая страница 1252 игнорируется.
Свежесть: max `KorrData` 2026-10-05, max `SozdData` 2026-10-02.

## 6. OSTATOK STRUCTURE (свежий)

Paradox 7.x keyed, record 160 B, header 2048 B, 39 409 блоков, **412 286 записей** (партии), 23 поля, схема как в
2020. Exporter использует по позиции: `[1] SkladKod A6`, `[2] TovarKod A14`, `[6] Kolvo N`. Свежесть: max
`DataPrihod`/`DataRashod` 2026-10-05. `KolvoRezerv` = 0 во всех строках; дробных `Kolvo` 0; `Kolvo > int32` 0.

SkladKod (rows / rows с Kolvo>0 / Σ положительных Kolvo):
10000 77 269/1 718/28 572 · 10001 74 430/5 760/10 288 · 10002 58 137/4 457/7 810 · 10003 38 200/3 170/5 256 ·
10004 35 811/3 600/7 107 · 10005 20 991/1 503/2 592 · 10006 46 503/3 582/6 662 · 10007 30 177/2 938/4 817 ·
**10008** 3 002/26/1 310 · **10009** 20 536/0/0 · **10010** 7 124/2 559/6 282 · `2377` 5/5/5 ·
мусорные коды `0`,`11`,`1917`,`4318`,`4869`,`5732`,`90009` и пустой SkladKod (76) — все Kolvo=0.

## 7. SKU RULE — FACT (код + 100 %)

`ToSku(s)`: `s` пустой/NULL → `"0"`; иначе `s.Replace(" ", "")` (удаляются ВСЕ U+0020; результат `Trim()` в коде
отбрасывается — эффекта нет; табы/NBSP не удаляются). `s` = `CENIC.TovarKod` как строка из ParadoxReader (байты до
первого NUL, cp1257). Без числовых преобразований → ведущие нули сохраняются (115 SKU), 25 кодов с внутренними
пробелами, 0 пустых, 0 дублей, 0 коллизий после удаления пробелов, 0 non-ASCII.

## 8. PRICE MAPPING — FACT (код + 100 %)

`priceN = ToDecimal(Cena{N}.ToString())`, N = 1..4, т.е. **`price3 = Cena3`** (НЕ `CenaNakl1×1.05`: прошлый вывод
F6 опровергнут; на свежих данных он совпадает лишь в 13 180/16 179 — корреляция, GrinS часто ставит Cena3≈себест.×1.05).
`capacity = Emkost` тем же способом. `ToDecimal`: пусто/NULL → `"0"`; иначе замена `,`→`.`.
Формат: .NET Framework `double.ToString()` = "G" 15 значащих цифр (без экспоненты в текущих данных; E-нотация
возможна при |x|<1e-4 или ≥1e15). Округления сверх G15 нет. `price2` → `Product.price` в Hairshop Pro.

## 9. WAREHOUSE MAPPING — FACT (жёстко зашито в CreateXmlFile)

`<warehouse id="1..8">` = SkladKod `10000..10007`, **`id="9"` = `10009`** (НЕ 10010). `10008`, `10010`, `2377`,
пустой и прочие коды отдельными элементами НЕ экспортируются.
Значение склада = `Σ Kolvo` по партиям `(TovarKod, SkladKod.Trim())`, где `int.TryParse(Kolvo.ToString())` успешен
и `> 0` (отрицательные, дробные, NULL, > int32 — пропускаются). Нет партий → `"0"`.
Проверка формул (16 179×9 = 145 611 ячеек): A ΣKolvo 99.943 % · B max(0,Σ) 99.945 % · **C Σmax(0,Kolvo) 100 %** ·
D Σ(Kolvo−Rezerv) 99.943 % · **E формула кода 100 %** (C≡E на этих данных, т.к. дробных Kolvo нет).

**Расхождение с Hairshop Pro (не исправлено, вне scope):** `lib/sync/grins-warehouse-map.ts` трактует индекс 9 как
`10010` (Елгава, «confirmed by owner 2026-07-30»). Фактически это `10009` (везде 0). Реальный остаток Елгавы (10010:
1 880 SKU с наличием) в `warehouses` отсутствует и виден только внутри `quantity`. Product.stock не затронут
(10010 и так в EXCLUDED), но витринная доступность «Елгава» всегда 0. Нужно решение владельца.

## 10. QUANTITY — FACT (код + 100 %)

`quantity = Σ Kolvo` по ВСЕМ партиям TovarKod (любой SkladKod, включая пустой и не экспортируемые), с тем же фильтром
«int и > 0»; нет партий → `"0"`. Сравнение вариантов (16 179 items): Σ XML-складов 88.380 % · 10000–10007+10009
88.380 % · +10010 99.920 % · +10010+10008 99.969 % · **все SkladKod 100 %** · **формула кода 100 %**.
`quantity > Σwarehouses` у 1 880 item (вклад: 10010 — 1 880, 10008 — 8, 2377 — 5); `quantity < Σ` — 0.
Ключ join = **необрезанная** строка TovarKod (CENIC и OSTATOK должны совпасть побайтно, включая ведущие пробелы):
2 TovarKod в OSTATOK отличаются от CENIC только выравниванием → их остаток exporter теряет (так и воспроизведено).
951 TovarKod в OSTATOK без CENIC — не экспортируются.

## 11. MASS COMPARISON — RESULT

| Поле | Matches | Total | % |
|---|---:|---:|---:|
| SKU / code / title / capacity | 16 179 | 16 179 | 100 |
| price1 / price2 / price3 / price4 | 16 179 | 16 179 | 100 |
| quantity | 16 179 | 16 179 | 100 |
| warehouse1 … warehouse9 | 16 179 каждый | 16 179 | 100 |

Порядок item'ов совпадает позиционно (16 179/16 179); missing 0/0; дубли 0/0; max abs diff 0. Файл целиком — байт в байт.

## 12. REMAINING MISMATCHES

Нет. (Эмулятор воспроизводит и «грязные» особенности: двойное экранирование title, U+0083/U+008C/U+009A из
неопределённых байтов cp1257, потерю остатка при разном выравнивании TovarKod.)

## 13. 553 MB `export.xml` — ВЫВОД

FACT: `[0, 8 851 456)` = эталон; `[8 851 456, 8 853 248)` = 1 792 NUL вместо байтов эталона; `[8 853 248, 8 855 040)` =
последние 1 792 байта эталона (сдвиг +1 792, оканчивается `</root>`); далее до 552 968 764 — только NUL.
Аномалия уже внутри полученного `SyncHairshop.zip` (там 552 968 764 B). ZIP, созданный exporter'ом в 12:03:00.437
из этого же файла, содержит корректные 8 853 248 B. ⇒ файл повреждён после упаковки ZIP или при копировании с сервера;
как эталон НЕ использовать.
FACT (код): exporter делает `File.Delete` в try/catch с проглатыванием ошибки и открывает `FileMode.OpenOrCreate`
БЕЗ усечения (`FileShare.ReadWrite`) ⇒ при неудачном удалении возможен «хвост» от старого файла. Это объясняет
возможность лишнего хвоста, но НЕ NUL-дыру со сдвигом. Причина — UNKNOWN (гипотеза: копирование/синхронизация
файла на сервере, преаллокация копировщиком). На Hairshop.lv уходит ZIP, не голый XML.

## 14. LEGACY EXPORTER — ВОССТАНОВЛЕННЫЙ АЛГОРИТМ (FACT, IL)

Windows-сервис `SyncService` (.NET Framework 4.5, `GrinsSyncService.exe`, 2023-05-29). Таймер 3 600 000 мс
(раз в час, ~:02). Цикл `Timer_Elapsed`: `ClearFiles` (удалить все файлы `copyPath`) → `CopyDataBase`
(`File.Copy` каждого файла верхнего уровня `dbPath`→`copyPath`, без блокировок/снимка, по файлу) → `CreateXmlFile`
→ `SendToServer`. Конфиг: `dbPath=C:\Grins\Sklad\DB`, `copyPath=C:\Sync\Copy`, `exportPath=C:\Sync\XML`,
`siteUrl=https://hairshop.lv/Plugins/Importer/Run`.
`CreateXmlFile` читает **из `copyPath`** через `ParadoxTable(copyPath, "CENIC"/"OSTATOK")`:
1. OSTATOK → `Dictionary<string,int>` (см. §9–10);
2. XmlWriter (UTF-8 c BOM, без отступов) `root/item{sku,code,title,capacity,price1..4,quantity,warehouses/warehouse[@id]}`
   по CENIC в порядке ParadoxReader; `code = StrihKod.Trim()` (`""` → `<code></code>`); `title =
   RemoveSpecChars(TovarNai)` (кириллица→латышские буквы — на cp1257-хосте холостая; `;`→`,`; CR/LF→пробел; `"`,`'`
   → `&quot;`; `<`,`>`,`&` → сущности) и затем WriteString экранирует ещё раз → `&amp;quot;` в файле (by design).
ParadoxReader: перебирает ВСЕ физические блоки `0..fileBlocks-1` (не цепочку next-block), записей в блоке =
`addDataSize/recordSize+1` (C#-деление), `.PX` не используется для чтения, поле из одних 0x00 = DBNull,
строки = `Encoding.Default` (хост = **cp1257**, FACT по байтовому сравнению), Number: стандартная инверсия Paradox,
NaN → DBNull. Нет фильтров (TovarZapret, группы, нулевые цены — всё экспортируется).
`SendToServer`: Ionic.Zip упаковывает export.xml → `export.xml.zip`, HTTP POST (WebClient.UploadFile) на siteUrl.

## 15. SECURITY FINDINGS (без раскрытия)

- `GrinsSyncService.exe` (метод `SendToServer`) содержит **жёстко зашитые логин и пароль** импорт-эндпоинта
  hairshop.lv (передаются HTTP-заголовками `login`/`password`). Значения: [REDACTED]. Любой, у кого есть EXE, может
  вызывать импорт Hairshop.lv. Рекомендация: владельцу Hairshop.lv ротировать учётку при переходе на новый exporter.
- `.config` секретов не содержит. Логи (`Log/*.log`) — только статус и HTML-ответ импортёра, без секретов.
- IL-дампы с этими строками НЕ сохранялись в репозиторий и не должны.

## 16. SCRIPTS (`research/grins-paradox/`, Python 3.13 stdlib)

- `grins_export_emulator.py` — точный эмулятор exporter (read-only; `--out` внутри репозитория запрещён).
- `verify_export.py` — byte-compare + семантическое сравнение по полям + альтернативные формулы + роли складов.
- `test_grins_export_emulator.py` — 14 unittest (SKU, leading zero, decimal/G15, price3, партии, отрицательные,
  дробные, NULL, маппинг складов, join, XML-байты, детерминизм, физический обход блоков, битые входы, compare).
- `paradox_reader.py` — header-parser (переиспользуется эмулятором). Поле `encryption` в его выводе: `0xFF00FF00` =
  «не зашифровано» для v4+ (это НЕ признак шифрования).
- `.gitignore` — блокирует *.DB/PX/MB/X*/Y*, xml, zip, exe/dll/pdb, json/csv, out*/, input*/.
- Устаревшие (прошлая сессия, untracked, НЕ коммитились): `analyze.py`, `deep_dive.py`, `control_skus.py` — построены
  на гипотезах 2020 г. (price3 = CenaNakl1×1.05, обход по цепочке блоков). Не использовать как источник истины.

## 17. COMMANDS

```bash
export PYTHONIOENCODING=utf-8
R=C:/Users/User/Desktop/eshop02/research/grins-paradox
W=/c/tmp/grins-paradox-research
python -c "import zipfile;open('$W/input-2026-10-05/reference-export.xml','wb').write(zipfile.ZipFile(r'C:\SyncHairshop\XML\export.xml.zip').read('Sync/XML/export.xml'))"
python $R/grins_export_emulator.py --copy-dir /c/SyncHairshop/Copy --out $W/out-2026-10-05/generated-export.xml   # ~13 s
cmp $W/out-2026-10-05/generated-export.xml $W/input-2026-10-05/reference-export.xml && echo BYTE-IDENTICAL
python $R/verify_export.py --copy-dir /c/SyncHairshop/Copy --reference $W/input-2026-10-05/reference-export.xml --out $W/out-2026-10-05/verify-report.json   # ~31 s
cd $R && python -m unittest -v test_grins_export_emulator
```

## 18. TIMING / SNAPSHOT (FACT по логу и mtime)

`Log/2026-10-05.log`: 12:02 PM recall → clear → copy start/complete (12:02) → XML start 12:02, completed 12:03 → zip,
send 12:03 → ответ импортёра 12:07. Max mtime в `Copy/` = 12:02:24.87 (TTNO.DB), OSTATOK.DB 12:02:19.05, CENIC.DB
11:57:04 (File.Copy сохраняет mtime источника) ⇒ Copy = снимок, сделанный этим запуском 12:02; XML 12:03:00.249, ZIP
12:03:00.437. Байтовое совпадение доказывает: этот XML построен ровно из этого Copy. Гонки copy↔XML нет (XML читает
только Copy). Внутренняя согласованность Copy (CENIC скопирован раньше OSTATOK, файлы копируются без блокировок
при работающем GrinS) — не проверяема и UNKNOWN; на результат сравнения не влияет. BDE cache / LOCAL SHARE /
чтение live-DB — опровергнуто для exporter (он не использует BDE; читает файлы Copy напрямую).

## 19. UNKNOWN

U1. Точная причина 553 MB файла (§13). U2. Внутренняя консистентность файловой копии при активной записи GrinS
(важно для дизайна нового exporter: нужна стратегия snapshot/повтор/валидация). U3. Что такое SkladKod `10008`,
`10009`, `2377` и почему Елгава (10010) не в warehouses — исторически (exporter 2022–2023 г. не обновлялся). U4.
Должен ли новый exporter сохранять «баги» старого (id9=10009, quantity по всем складам, двойное экранирование
title, потеря при разном выравнивании TovarKod) — решение владельца. U5. Безопасно ли читать `C:\Grins\Sklad\DB`
напрямую vs копия.

## 20. NEXT SAFE STEP

Доказательств достаточно для ПРОЕКТИРОВАНИЯ (не реализации) production exporter. Перед реализацией — ответы
владельца/сисадмина: (a) id9: 10009 или 10010; (b) quantity: копировать формулу «все склады» или считать только
витринные; (c) совместимость title/escaping; (d) где и как exporter будет читать файлы (копия + валидация заголовка/
счётчиков записей, повтор при несоответствии); (e) ротация зашитой учётки Hairshop.lv. Production — только с
отдельного разрешения.

## 21. GIT

Branch `main`, базовый коммит `fa1b97ac`. Коммит этой работы: см. `git log -- research/grins-paradox` (сообщение
`research: verify GrinS Paradox export algorithm`). В коммит входят только: этот файл, `research/grins-paradox/
{.gitignore, paradox_reader.py, grins_export_emulator.py, verify_export.py, test_grins_export_emulator.py}`.
Чужие незакоммиченные изменения (`components/admin/products/AddProductForm.tsx`, `docs/deployment-checklist.md`,
`lib/product-form-mapping*.ts`, `*.md/*.json/*.csv` аудитов в корне) НЕ включены и не тронуты.

## DO NOT DO

Не запускать `GrinsSyncService.exe`/LISDBD/DbRemaker/BDE на данных; не писать в Paradox-файлы; не коммитить данные,
XML, ZIP, EXE/DLL/PDB, IL-дампы; не выводить зашитые креды; не менять scheduled sync, `GRINS_FTPS_*`, parser,
`grins-warehouse-map.ts`, preflight; не трогать production DB/FTPS/deploy без явного разрешения.

## ПРИЁМ (для NEXT AGENT)

1) прочитать этот файл; 2) `git status`, `git log --oneline -5`; 3) проверить наличие `C:\SyncHairshop\Copy` и SHA-256
(§4); 4) `python -m unittest test_grins_export_emulator` в `research/grins-paradox`; 5) прогнать эмулятор + `cmp` (§17)
→ ожидать BYTE-IDENTICAL; 6) при новом комплекте — новые `input-<date>`/`out-<date>`, те же команды; любое
расхождение классифицировать (формула / snapshot / данные / парсинг), не подгонять.
