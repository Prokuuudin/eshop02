# GRINS PRO EXPORTER — HANDOFF

Last updated: 2026-10-05. Для любого следующего агента (любая модель/инструмент). Секретов здесь нет и не должно быть.
Историческое доказательство алгоритма — `GRINS_PARADOX_RESEARCH_HANDOFF.md` (не редактировать).

## 1. Цель

Production-exporter GrinS → Hairshop Pro: из Paradox-базы GrinS (CENIC + OSTATOK) безопасно строить совместимый
`export.xml` по бизнес-правилам Hairshop Pro и атомарно публиковать его на ОТДЕЛЬНЫЙ FTPS Hairshop Pro (candidate).
Этап = код + тесты + shadow/candidate-режимы + документация. **Production НЕ переключён.**

## 2. Архитектура

```
GrinS live DB (C:\Grins\Sklad\DB, только чтение)
 → stable snapshot (A, пауза, B; SHA равны; size/mtime источника не менялись; ≤3 попыток)
 → Paradox validation (fingerprint схемы, размер файла, цепочка блоков, header = chain = physical)
 → Pro XML (политика складов 10000–10007)
 → preflight (пороги consumer, инварианты, round-trip XML)
 → локально export.xml + export.manifest.json
 → [mode=publish] candidate FTPS: STOR .part → SIZE → RNFR/RNTO
 → существующий Hairshop Pro sync (parser/preflight/runner без изменений)
```
Код: `tools/grins-pro-exporter/grins_pro_exporter/` — `paradox.py` (reader+валидация), `model.py` (политика,
форматирование, XML), `preflight.py`, `snapshot.py`, `publish.py`, `credentials.py` (Credential Manager),
`runtime.py` (lock, JSON-логи), `alerts.py`, `config.py`, `runner.py`, `compare.py`, `__main__.py` (CLI).
Язык: **Python 3.8+ stdlib** (протестировано на 3.13; синтаксис 3.8 проверяется тестом). Выбор: переиспользует
доказанное байт-в-байт чтение Paradox (минимальный риск регрессии), ftplib даёт explicit TLS, ctypes — Credential
Manager, msvcrt — lock; нулевые зависимости. Node потребовал бы переписать бинарный reader и ставить Node+npm-пакеты
на машину GrinS. Приоритет correctness > единый стек.

## 3. Доказанные research-факты (FACT, golden master 2026-10-05)

Legacy-эмулятор `research/grins-paradox/grins_export_emulator.py` из `C:\SyncHairshop\Copy` строит XML, байт-в-байт
равный эталону (SHA-256 `12a7ff3ac7f95d91a0acabdb739102c134272803270a398dea7c68be8412cdbf`, 8 853 248 B, 16 179 items).
SKU = TovarKod без пробелов; priceN = CenaN (price3 = **Cena3**; формула CenaNakl1×1.05 опровергнута); склад =
Σ положительных целых Kolvo по партиям; id1..8 = 10000..10007, id9 = 10009; legacy quantity = по всем складам;
строки cp1257; чтение по физическим блокам. Эмулятор НЕ изменялся (тест это проверяет).

## 4. INTENTIONAL BUSINESS DIFFERENCES (решение владельца 2026-10-05)

| | legacy Hairshop.lv | Hairshop Pro |
|---|---|---|
| warehouse id 9 | 10009 | всегда `0` |
| quantity | Σ по всем SkladKod | Σ id 1..8 (10000–10007) |
| title | двойное экранирование `&amp;quot;` | одинарное (title не используется sync: parser ставит `title = sku`) |
Всё остальное (SKU, порядок, code, capacity, price1–4, warehouse1–8) — идентично legacy на одном снимке (доказано).

## 5. Warehouse policy

Явный allowlist `ALLOWED_WAREHOUSES = 10000..10007` (`model.py`). Игнорируются 10008, 10009, 10010 (Елгава,
закрывается), 2377, пустой и любой неизвестный код — с диагностикой (`ignoredRowsByWarehouse`,
`ignoredPositiveQuantityByWarehouse`, `unknownWarehouseCodes`; warning в лог, если у неизвестного кода есть остаток).
stock(sku, wh) = SUM(max(0, Kolvo)) (+10, −3, +2 → 12). Kolvo дробный или > int32 в разрешённом складе → **fail closed**
(legacy молча отбрасывал; в данных 2026-10-05 таких 0). Join OSTATOK↔CENIC по точной строке TovarKod (как legacy);
коды, совпадающие только после удаления пробелов, НЕ присоединяются, их остаток в диагностике
`allowedStockOnMisalignedCodes` (сейчас 0: два таких кода, оба Kolvo=0).

## 6. Quantity policy

`quantity = Σ warehouse1..8`, `warehouse9 = 0` — строгий инвариант preflight экспорта и проверка compare.
`Product.stock` в Hairshop Pro — ОТДЕЛЬНАЯ сущность, не изменена: Σ max(0) по 10000/10001/10002/10005
(`lib/sync/sync-rules.ts`). XML quantity в sync не используется (только аудит/верификация).

## 7. Snapshot

`snapshot.py`: обязательны только `CENIC.DB` и `OSTATOK.DB` (reader не использует .PX/.MB). Поиск без учёта регистра,
symlink/reparse point и файлы < 4 KB отвергаются. Попытка: stat → копия A (потоково, SHA при записи, `xb`, fsync) →
пауза (config) → копия B → stat; принято, если SHA(A)=SHA(B) для всех файлов и size/mtime не изменились и размер копии
= размеру источника. Иначе `snapshot_unstable`, удаление попытки, пауза, повтор; после `maxAttempts` (по умолч. 3) —
`SnapshotError`, exit 30, ничего не публикуется. Каждый запуск — новый каталог `work\runs\<runId>`, хранится `keepRuns`.
Рабочие каталоги внутри live-DB запрещены конфигом.

## 8. FTPS publish

`publish.py`: explicit TLS (`AUTH TLS`, PROT P, переиспользование TLS-сессии на data-канале), системное хранилище
сертификатов или `caFile`, проверка hostname, TLS ≥ 1.2, обхода нет. Порядок: `STOR export.xml.part` → `SIZE` == локальный
размер → `RNFR/RNTO export.xml.part → export.xml` → `SIZE`; затем так же manifest. Ошибка на любом шаге → `.part`
удаляется, `export.xml` на сервере не трогается. **Нет delete+rename fallback.** Отказ сервера переименовать поверх
существующего файла = отказ публикации. Перед загрузкой локальный XML перехэшируется и сверяется с manifest.
`probe-ftps` проверяет возможности сервера только на `probe-*` файлах (`atomicPublishSupported`).

## 9. Manifest

`export.manifest.json` (локально и рядом с XML на FTPS): `schemaVersion, exporterVersion, runId, mode, generatedAt (UTC,
…Z), generatedAtLocal, hostTimeZone{utcOffset,…}, sourceSnapshotAt, sourceHashes{CENIC.DB,OSTATOK.DB}, sourceFiles,
sourceTables (records, fingerprint), xmlFileName, xmlSha256, xmlSizeBytes, productCount, warehousePolicy
"10000-10007", warehouseSlots, quantityPolicy, stats`. Без секретов и персональных данных.
Consumer-проверка (новое): `verifyExportManifest()` в `lib/sync/ftps-source-verification.ts`,
`verify-ftps-source.ts --source candidate --manifest` / `--file X --manifest-file M`: SHA/размер/кол-во совпадают,
политика складов, `generatedAt` ≤ 36 ч, не в будущем. Scheduled sync freshness пока НЕ проверяет (см. §25).

## 10. Configuration

JSON (`config.example.json`): `mode` (shadow|publish, по умолч. shadow), `source.dbPath`, `paths.{workDir,outputDir,
logDir,stateDir}` (абсолютные), `snapshot.{maxAttempts,pauseBetweenCopiesSeconds,retryDelaySeconds,keepRuns}`,
`keepOutputs`, `preflight.{minProducts 14000, maxDropRatio 0.10, maxGrowthRatio 0.20, maxQuantityDropRatio 0.30,
maxQuantityGrowthFactor 3}` (= пороги consumer preflight), `publish.{label,host,port,remoteDir,fileName,
manifestFileName,credentialTarget,caFile,timeoutSeconds,requireRemoteSize}`, `alerts.{type none|smtp|webhook,…}`.
Удалённые пути — только `[A-Za-z0-9._-/]`, без `..`. Расписание в конфиге/коде отсутствует.

## 11. Secrets

Только Windows Credential Manager (generic, per-user): `cmdkey /generic:GrinsProExporter/ftps /user:<u> /pass`
(запрашивает пароль). Создавать под учёткой задачи планировщика. Конфиг с `password/user` отвергается. Логи редактируют
секретные ключи; тексты ошибок FTPS очищаются от логина/пароля; `Credential.__repr__` скрывает секрет.
Зашитые креды legacy `GrinsSyncService.exe` = [REDACTED], нигде не используются; ротация — после будущего cutover.

## 12. CLI

```
py -3 -m grins_pro_exporter --config config.json check-config
py -3 -m grins_pro_exporter --config config.json run [--dry-run | --shadow]
py -3 -m grins_pro_exporter --config config.json probe-ftps
py -3 -m grins_pro_exporter build --snapshot-dir DIR --out X.xml [--manifest M.json]
py -3 -m grins_pro_exporter compare --legacy A.xml --pro B.xml [--same-snapshot] [--report R.json]
```
Exit: 0 ok, 2 compare suspicious, 10 lock занят (skipped), 20 config, 30 snapshot, 40 source, 50 data/preflight,
60 publish, 70 internal. `run-exporter.cmd` — обёртка для планировщика. Lock: OS byte-range lock `state\exporter.lock`
(снимается ОС при смерти процесса — stale lock невозможен).

## 13. Tests (результаты 2026-10-05)

- Python: `cd tools/grins-pro-exporter && py -3 -m unittest discover -s tests` → **74 OK, 1 skipped** (symlink: нет
  привилегии у пользователя). Покрыто: SKU, цены/форматирование, партии/отрицательные, allowlist/ignored/unknown/blank,
  quantity, XML (9 складов, id9=0, экранирование, cp1257, детерминизм, NUL-хвост, DTD), Paradox (fingerprint, частичная
  копия, счётчики, stale-блок, петля цепочки, битый блок, шифрование, мусор), snapshot (стабильный, изменение и повтор,
  исчерпание, частичная копия, отсутствующие/мелкие файлы, источник не меняется), publish (последовательность, сбой
  upload/SIZE/rename, TLS, редакция, валидация путей, probe), runner (shadow/dry-run/publish/сбой publish/нет секрета/
  preflight/падение каталога/битый источник/lock), config, alerts, логи, Python 3.8 синтаксис, **golden** (эталон SHA,
  legacy-эмулятор байт-в-байт, Pro vs legacy strict PASS, Pro SHA закреплён `706260fe…6dbf`).
- Research: `research/grins-paradox`: `python -m unittest test_grins_export_emulator` → 14 OK.
- TS: `npx vitest run lib/sync` → 359 passed; `npx tsc --noEmit` → 0; eslint изменённых файлов → 0.
- Consumer на Pro XML: `verify-ftps-source --file` PASS; `compare-ftps-exports` (legacy vs Pro) PASS;
  `--manifest-file` свежий PASS / устаревший FAIL (exit 2).

## 14. Shadow mode

`"mode": "shadow"` или `run --shadow`: snapshot → валидация → XML → preflight → `out\<runId>\export.xml` +
`export.manifest.json`, обновляется `state\last-good-manifest.json` (база порогов). FTPS не используется никогда.
`--dry-run`: всё до preflight, ничего не пишет (ни out, ни state).

## 15. Candidate mode

`"mode": "publish"` + секция `publish` → публикация в ОТДЕЛЬНЫЙ FTPS Hairshop Pro (label `candidate`). Consumer читает
его только через `GRINS_FTPS_CANDIDATE_*` в `verify-ftps-source.ts --source candidate`. Primary (`GRINS_FTPS_*`) не
затрагивается; переключение primary → candidate автоматически не происходит.

## 16. Known limitations

- Атомарная замена зависит от FTPS-сервера (RNTO поверх существующего файла). IIS FTP, по опыту, может отказывать —
  проверить `probe-ftps` ДО включения publish; при отказе нужно отдельное решение (другой сервер / версионные имена).
- Python 3.8 проверен только синтаксически; запуск протестирован на 3.13 (Windows 11).
- Консистентность копии на уровне GrinS-транзакций не гарантируется (A/B совпадение + окно после 19:00/16:00
  снижают риск; файлы копируются последовательно, не атомарно вместе).
- Scheduled sync не проверяет manifest/freshness (только candidate-инструмент).
- Витрина: строка «Елгава» (`lib/warehouse-availability.ts`, public) теперь получает `null` → «Нет в наличии» (как и
  раньше фактически было 0). Скрывать ли Елгаву — решение владельца.
- Неизвестные legacy-коды складов с нулевым остатком (`0,11,1917,4318,4869,5732,90009`, пустой) логируются как info.

## 17. Deployment prerequisites

Windows-машина в LAN GrinS с правом чтения `C:\Grins\Sklad\DB` (локально или UNC); Python 3.8+ (python.org, для всех
пользователей, `py`); отдельная учётка задачи (только чтение GrinS, полный доступ к `C:\GrinsProExporter\`); исходящий
доступ к FTPS (21 + passive); сертификат FTPS от доверенного CA; учётка FTPS только для candidate-каталога.

## 18. Task Scheduler

`schtasks /Create /TN "GrinsProExporter" /SC DAILY /ST 20:00 /RU <DOMAIN\user> /RP /TR "C:\GrinsProExporter\run-exporter.cmd"`;
«не запускать новый экземпляр», стоп через 1 ч. 20:00 удовлетворяет «будни после 19:00, выходные после 16:00».

## 19. Rollback

Shadow/candidate production не затрагивают: `schtasks /Change /TN "GrinsProExporter" /DISABLE`, при необходимости
`"mode": "shadow"`. Удаление: задача, `cmdkey /delete:GrinsProExporter/ftps`, каталог. Consumer-коммит `aee5ac73`
откатывается `git revert` (slot 9 снова → 10010; поведение Product.stock от него не зависит).

## 20. Cutover plan (НЕ выполнялся; только после отдельного одобрения)

1) установка на машину GrinS → shadow несколько дней (логи, `compare --legacy <Hairshop.lv export> --pro out\…` →
только intentional + временной дрейф); 2) `probe-ftps` → `atomicPublishSupported: true`; 3) mode publish в candidate;
4) на сервере Hairshop Pro: `verify --source candidate --manifest` PASS, `compare-ftps-exports`, `sync-products --dry-run
--file` (critical []); 5) одобрение владельца → замена `GRINS_FTPS_*` по `docs/erp-ftps-source-migration.md`;
6) после стабильной работы — рекомендовать ротацию legacy-кредов Hairshop.lv (не раньше: сломает Hairshop.lv).

## 21. Files changed

Добавлено: `tools/grins-pro-exporter/**` (пакет, 6 тест-модулей + fixtures, `config.example.json`, `run-exporter.cmd`,
`.gitignore`), `docs/grins-pro-exporter-runbook.md`, этот файл.
Изменено: `lib/sync/grins-warehouse-map.ts` (+test), `lib/sync/grins-xml-parser.test.ts`,
`lib/sync/ftps-source-verification.ts` (+test), `scripts/verify-ftps-source.ts`, `docs/erp-ftps-source-migration.md`.
Не изменено: research-эмулятор и research-handoff, parser/preflight/runner/scheduled sync, Prisma schema, env.

## 22. Commits (локальные, НЕ запушены)

- `1108d19a research: verify GrinS Paradox export algorithm` (прошлый этап)
- `a9cf2d29 feat(exporter): add safe GrinS Paradox exporter for Hairshop Pro`
- `aee5ac73 fix(sync): stop treating warehouse slot 9 as Jelgava; verify exporter manifest`
- `docs: GrinS Pro exporter runbook and handoff` (содержит этот файл; хэш — `git log -1 -- GRINS_PRO_EXPORTER_HANDOFF.md`)
Push не выполнялся: push в `main` может запустить деплой; нужен отдельный разрешающий ответ владельца.

## 23. Exact commands

```bash
# тесты
cd tools/grins-pro-exporter && py -3 -m unittest discover -s tests
cd research/grins-paradox && python -m unittest test_grins_export_emulator
npx vitest run lib/sync && npx tsc --noEmit
# golden вручную (данные вне Git: C:\SyncHairshop)
cd tools/grins-pro-exporter
py -3 -m grins_pro_exporter build --snapshot-dir C:/SyncHairshop/Copy --out C:/tmp/pro.xml --manifest C:/tmp/pro.manifest.json
py -3 -c "import zipfile;open('C:/tmp/legacy.xml','wb').write(zipfile.ZipFile(r'C:\SyncHairshop\XML\export.xml.zip').read('Sync/XML/export.xml'))"
py -3 -m grins_pro_exporter compare --legacy C:/tmp/legacy.xml --pro C:/tmp/pro.xml --same-snapshot   # PASS
npx tsx scripts/verify-ftps-source.ts --file C:/tmp/pro.xml --manifest-file C:/tmp/pro.manifest.json # PASS
```

## 24. Git status (на момент handoff)

Ветка `main`, впереди `origin/main` на 14 коммитов (включая `1108d19a` и 3 коммита этого этапа), ничего не запушено. Рабочее дерево содержит ЧУЖИЕ
незакоммиченные изменения параллельной работы (app/…, components/…, lib/product-*, lib/initial-catalog-products*,
docs/deployment-checklist.md, корневые *.md/*.json/*.csv, research/grins-paradox/{analyze,control_skus,deep_dive}.py) —
не трогались и не включались.

## 25. Remaining UNKNOWN / решения

1. Поддерживает ли целевой FTPS rename поверх существующего файла (определит `probe-ftps`).
2. Хост/учётка/каталог candidate FTPS Hairshop Pro; машина и учётка для exporter; версия Python там.
3. Показывать ли «Елгаву» на витрине (сейчас всегда «нет в наличии»).
4. Дробный/огромный Kolvo в рабочих складах: сейчас fail closed — устраивает ли (в данных 0 случаев).
5. Нужна ли freshness-проверка manifest в scheduled sync (сейчас только candidate-инструмент).
6. Каналы алертов (SMTP/webhook) и получатели.
7. Причина 553 MB legacy XML (не влияет на новый exporter: он пишет temp → fsync → проверка → rename, тест на NUL-хвост).

## 26. Production

**Production source NOT switched. Production DB NOT modified. No production sync executed. No deployment performed.
No push.** Legacy Hairshop.lv integration и её креды не тронуты.

## Следующий безопасный шаг

Установить exporter на Windows-машину GrinS в shadow-режиме на несколько дней → `probe-ftps` на candidate FTPS →
mode publish в candidate → сравнить candidate с primary → отдельно согласовать cutover.
