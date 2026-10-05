# GRINS PRO EXPORTER — HANDOFF

Last updated: 2026-10-05 (этап 2: операционная готовность — см. раздел «ЭТАП 2» в конце; он имеет приоритет над §§ 13, 16, 22, 24, 25 ниже). Для любого следующего агента (любая модель/инструмент). Секретов здесь нет и не должно быть.
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
`probe-ftps` проверяет возможности сервера тем же `_put_atomic`, только на `probe-*` файлах (этап 2: замена существующего файла доказывается SIZE; вердикт `FTPS ATOMIC PUBLISH: PASS|FAIL`).

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
- Витрина: Елгава (10010) скрыта из блока наличия товара на этапе 2; справочник магазинов (data/stores.ts) не тронут.
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

---

## ЭТАП 2 — ОПЕРАЦИОННАЯ ГОТОВНОСТЬ (2026-10-05)

Цель: Git-аудит, готовность к установке, shadow/probe-процедуры, мелкие решения. Архитектура не менялась.

### E2.1 Git-аудит `origin/main..main` (15 локальных коммитов, НИЧЕГО не запушено)

`origin/main` = `67589105`. Push в `main` = деплой всех 15 сразу (выборочного push без переписывания истории нет;
история не переписывалась). Секрет-скан всех 15: реальных секретов нет (единственные похожие строки — фейковые
фикстуры `test-secret`/`production-secret` в pricing-тестах `8d096950`; их хосты не совпадают с хостами из `.env*`).
Бинарников/данных GrinS нет; `git show --check` чисто для GrinS-коммитов.

| commit | purpose | files (суть) | GrinS | safe to push | action |
|---|---|---|---|---|---|
| 627c0b5d | docs(pricing) continuation | 1 doc | нет | да | KEEP |
| fec60300 | pricing schema + domain | `prisma/schema.prisma` (+6 моделей), `prisma/pending-migrations/…` (НЕ в `prisma/migrations` → `migrate deploy` её не применит), `lib/competitor-pricing/*` | нет | условно: модели без таблиц, runtime к ним не обращается | REVIEW (владелец pricing) |
| b7afb2eb | safe fetch, `net-ip-guard`, рефакторинг `lib/webhook-sender.ts` | меняет SSRF-guard живой доставки webhook (тестировано) | нет | условно | REVIEW |
| 2b181078 | JSON-LD adapter | lib only, не подключено | нет | да | KEEP |
| 8f3f01a1 | matching engine | lib only | нет | да | KEEP |
| 94083013 | observation ingestion | lib only | нет | да | KEEP |
| 424ba7d4 | recommendations | lib only | нет | да | KEEP |
| 6078af57 | admin pricing shell | новый маршрут `/admin/pricing` + пункт меню (видно админам) | нет | условно | REVIEW |
| 8d096950 | isolated DB integration | `.env.example`, `package.json` (opt-in скрипты), vitest-конфиг | нет | да (без влияния на build) | KEEP |
| fa1b97ac | pricing semantics | lib + pending migration + schema | нет | условно | REVIEW (как fec60300) |
| 1108d19a | research GrinS | research/, research handoff | да | да | KEEP |
| a9cf2d29 | Pro exporter | tools/grins-pro-exporter | да | да (не деплоится на сайт) | KEEP |
| aee5ac73 | consumer: slot 9 → null, manifest check | lib/sync, scripts/verify-ftps-source.ts | да | да | KEEP |
| 0971144e | docs exporter | docs, handoff | да | да | KEEP |
| 64f6c4ab (было 678e1bc8) | **параллельная работа**: storefront «prevent full catalog reads» | app pages/API, `lib/product-overrides-store.ts` (+361), catalog-service | нет | неизвестно (не проверял) | REVIEW (вне этой задачи) |

**SAFE TO PUSH: NO** (как целое): GrinS-коммиты безопасны, но push публикует также REVIEW-коммиты других
направлений (pricing-схема/админка/webhook-guard, свежий storefront-коммит 678e1bc8). Решение — за владельцем.

### E2.2 Рабочее дерево (UNRELATED WORKTREE CHANGES — не трогались)

`components/admin/products/AddProductForm.tsx`, `docs/deployment-checklist.md`, `lib/product-form-mapping(.test).ts`,
корневые `*.md/*.json/*.csv` аудитов, `research/grins-paradox/{analyze,control_skus,deep_dive}.py`, 2 старых stash;
во время этапа параллельная сессия дополнительно меняла `app/api/admin/import/*`, `app/api/admin/orders/send-invoice/*`,
`lib/product-overrides-store.ts` (и закоммитила 678e1bc8). Всё это — чужая работа, не включалась в коммиты этапа.
Ни stash, ни reset, ни checkout не выполнялись.

### E2.3 Изменения этапа 2

- `publish.py`: `probe-ftps` теперь использует ровно `_put_atomic` (STOR .part → SIZE → RNFR/RNTO → SIZE) на
  `probe-<runId>.txt`: шаг 1 — на свободное имя, шаг 2 — ДЛИННЕЕ файл на уже существующее имя; SIZE после rename
  доказывает, что замена произошла (ловит «молчаливый» отказ). PASS требует SIZE. Файлы probe удаляются;
  `export.xml`, `export.manifest.json` и их `.part` не затрагиваются (тест). CLI: `probe-ftps` пишет вердикт
  `FTPS ATOMIC PUBLISH: PASS|FAIL`, exit 0 / 60.
- `model.py`: Kolvo fail-closed — тип нарушения (`fractional` / `too_large`), SKU, склад; точный счётчик и выборка ≤ 20
  (исправлено: раньше `inf` давал OverflowError → exit 70, а список рос без ограничения).
- `runner.py`: `runStartedAt` в manifest, `durationSeconds` в `export_completed`/`export_failed`.
- `lib/warehouse-availability.ts`: Елгава (10010) `public: false` → скрыта из блока «Наличие в магазинах» на
  странице товара (+ тест `lib/warehouse-availability.test.ts`).
- `docs/grins-pro-exporter-runbook.md` переписан как пошаговая инструкция оператора.

### E2.4 Елгава — решение

Скрыта ТОЛЬКО в наличии товара (`lib/warehouse-availability.ts`; модуль используется лишь
`/api/products/[id]/availability` → `ProductStoreAvailability`). НЕ тронуто: `data/stores.ts` (id `jelgava`) —
используется checkout (pickup), `app/api/orders`, счета (`lib/invoice-template.ts`), адреса заказов, история, контакты,
CMS `lib/content-registry.ts`, переводы, `/stores/jelgava.jpg`. Убирать магазин из pickup/контактов — отдельное решение
владельца (persisted `pickupStoreId` в старых заказах). `EXCLUDED_STOCK_WAREHOUSE_IDS` с '10010' — безвредно, оставлено.

### E2.5 Shadow — точные команды (из кода)

```
cd /d C:\GrinsProExporter
py -3 -m grins_pro_exporter --config C:\GrinsProExporter\config.json check-config
py -3 -m grins_pro_exporter --config C:\GrinsProExporter\config.json run --dry-run
py -3 -m grins_pro_exporter --config C:\GrinsProExporter\config.json run --shadow
```
Конфиг для shadow — БЕЗ секции `publish` (runbook §3). Приёмка: exit 0, события до `export_completed`,
≥ 3 вечера на разных снимках; сводка — однострочник runbook §6 (runId, старт, snapshotAt, count, XML SHA, total
quantity, SHA CENIC/OSTATOK, ignored warehouses). Проверено на golden-копии: 2 прогона exit 0, XML SHA
`706260fe…`, 10.6 с.

### E2.6 Windows / account / candidate

Требования — runbook §1 (Windows 10+/Server 2016+; Win7 → только Python 3.8; Python из python.org с `py`;
одна учётка задачи: чтение GrinS DB, полный доступ к `C:\GrinsProExporter`, секреты в её Credential Manager;
задача планировщика с сохранённым паролем `/RP` — S4U не видит Credential Manager).
Candidate FTPS — НЕ ХВАТАЕТ: host, port, user (+ пароль в Credential Manager), remoteDir, подтверждение доверенного
сертификата и passive-портов; на сервере Hairshop Pro — `GRINS_FTPS_CANDIDATE_*` для чтения. Вымышленные значения не
создавались; сетевые проверки не выполнялись.

### E2.7 XML + manifest атомарность

Пара файлов не меняется транзакционно (FTPS этого не умеет). Порядок: XML, затем manifest. Окно «новый XML + старый
manifest» и гонка при скачивании consumer'ом детектируются: `verifyExportManifest` требует
`manifest.xmlSha256 == SHA(скачанного XML)`, размер и productCount → иначе FAIL (повторить позже). Это уже в
`verify-ftps-source --source candidate --manifest` (+ `--manifest-file`), тесты есть. Scheduled sync manifest пока
не проверяет (см. E2.8).

### E2.8 Freshness — план для scheduled sync (НЕ внедрено; отдельный этап перед cutover)

`lib/sync/scheduled-sync.ts`, сразу после `source = await deps.download()`: если `GRINS_FTPS_REQUIRE_MANIFEST === 'true'`
— `deps.downloadManifest()` (тот же FTPS-конфиг, путь `manifestPathFor(remotePath)`), `verifyExportManifest(source.content,
manifest, now())`; при FAIL → существующий `fail('export manifest check failed: …', { stage: 'manifest', xmlSha256 })`
(без записей в Product, SyncRun failed, alert; следующий часовой запуск повторит). По умолчанию флаг выключен →
поведение production не меняется до cutover. Тесты: свежий/устаревший/несовпадающий manifest, флаг выключен.
Порог 36 ч (экспорт раз в сутки в 20:00).

### E2.9 Alerts

Реализован SMTP-адаптер (STARTTLS с проверкой сертификата, получатели в `alerts.to`). Технический получатель не
задан (sales@ не используется) → `"type": "none"` до решения владельца; провал всё равно в логе + exit ≠ 0 +
история Task Scheduler. Заполнить ДО включения расписания.

### E2.10 Тесты этапа 2

Python exporter 77 OK / 1 skipped (symlink); golden (research-эмулятор = эталон `12a7ff3a…`, Pro SHA `706260fe…`)
внутри; research 14 OK; vitest `lib/sync` + availability 361 passed; `tsc --noEmit` 0; eslint изменённых файлов 0;
реальные CLI-прогоны: shadow ×2, check-config, probe-ftps без publish → exit 20.

### E2.11 Что блокирует

- **Candidate**: параметры candidate FTPS + `probe-ftps` = `FTPS ATOMIC PUBLISH: PASS`; ≥ 3 успешных shadow на машине
  GrinS; одобрение владельца на publish.
- **Cutover**: всё выше + сравнение candidate vs primary (`compare-ftps-exports`, `sync-products --dry-run --file`),
  freshness-enforcement в scheduled sync (E2.8), alert-получатель, деплой consumer-коммитов (push = отдельное решение),
  отдельное одобрение.

### E2.12a Коммиты этапа 2 (локальные, НЕ запушены)

- `f73a5536 fix(exporter): prove atomic replace in probe; harden Kolvo diagnostics`
- `8c9392d8 fix(storefront): hide closing Jelgava warehouse from product availability` (проверено живым API dev-сервера:
  `/api/products/21797/availability` → 7 магазинов, без Елгавы)
- `docs: GrinS exporter operational runbook and stage-2 handoff` (этот файл + runbook)
Параллельная сессия за время этапа добавила ещё `14e3317a fix: bound remaining admin product reads` (и amend-ила свой
`762b03da→678e1bc8→64f6c4ab`; один её `--amend` в 15:52 ошибочно попал на мой `8c9392d8`, через 2 минуты она сама
вернула HEAD и разнесла изменения — содержимое моих коммитов проверено, чистое). Итого `origin/main..main` = 19.
SAFE TO PUSH: NO (см. E2.1; 14e3317a — тоже чужое, REVIEW).

### E2.12 Production

Production source NOT switched. Production DB NOT modified. No production sync executed. No candidate publication
performed. No production deployment performed. No push.

### Следующий шаг

Получить/подтвердить Windows-машину GrinS и service account, установить exporter и выполнить первый ручной shadow run.
