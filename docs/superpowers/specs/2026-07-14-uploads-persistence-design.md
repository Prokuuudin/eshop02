# Персистентность аплоадов — картинки в Neon вместо файловой системы

**Дата:** 2026-07-14
**Статус:** approved, готов к implementation plan
**Контекст:** саб-проект 4 из 5 инициативы «админка меняет любой текст/картинку». Сейчас upload пишет `fs.writeFile` в `public/uploads` — на Vercel serverless ФС эфемерна, всё загруженное пропадает при редеплое. В git закоммичено 0 файлов из `public/uploads`, т.е. на проде уже нечего терять/мигрировать.

**Решение пользователя:** хранить байты картинок в новой таблице Neon (Vercel Blob отклонён). Правило «не менять схему БД» ослаблено осознанно: НОВЫЕ таблицы можно, существующие — по-прежнему нельзя. Новая таблица безопасна для будущего подключения к реальной базе: синк pull-only в `Product`, чужие таблицы ему невидимы (как `Order`, `User`, `KeyValueSetting`).

## Архитектура

Файловая система уходит целиком. Одна таблица + один публичный serving-роут + три админ-роута переписываются с fs на Prisma. Клиентские админ-страницы (`app/admin/content/page.tsx`, `app/admin/content/banners/page.tsx`, `app/admin/content/media/page.tsx`) **не меняются** — формы запросов/ответов API сохраняются.

### Модель — `prisma/schema.prisma` (только добавление)

```prisma
model MediaAsset {
  name      String   @id
  mimeType  String
  size      Int
  data      Bytes
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

`name` — первичный ключ (формат `<timestamp>-<слаг>.<ext>`, уникальность гарантирована timestamp'ом; все операции API ключуются по name, отдельный id не нужен). После правки схемы — `npx prisma generate` (локально, БД не нужна).

### Создание таблицы — `scripts/apply-media-asset-table.ts` (новый)

Prisma CLI (`migrate`, `db push`) требует TCP 5432 — VPN пользователя его блокирует. Поэтому таблица создаётся скриптом через рабочий WebSocket-канал (443), тем же prisma-клиентом, что и приложение:

```sql
CREATE TABLE IF NOT EXISTS "MediaAsset" (
  "name"      TEXT NOT NULL,
  "mimeType"  TEXT NOT NULL,
  "size"      INTEGER NOT NULL,
  "data"      BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("name")
);
```

Скрипт идемпотентен (`IF NOT EXISTS`), запускается один раз вручную (`npx tsx scripts/apply-media-asset-table.ts`), по образцу остальных `scripts/*.ts`. Файл миграции Prisma не создаём — каталог миграций в репо не является источником правды для этой БД, а применить его CLI всё равно не может.

### Публичная отдача — `app/api/media/[name]/route.ts` (новый)

`GET /api/media/<name>`, без авторизации (картинки публичные — показываются на витрине):

- Валидация `name` тем же `safeName`-паттерном (без `/`, `..`, `\`) — 400.
- `findUnique` по name; нет строки — 404.
- Ответ: тело `data`, заголовки `Content-Type: <mimeType>`, `Content-Length: <size>`, `X-Content-Type-Options: nosniff`, `Cache-Control: public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400`.

Кэш: CDN Vercel и браузер держат час — повторные показы не бьют ни функцию, ни Neon. После replace (имя сохраняется) устаревание максимум час — приемлемо для админ-картинок. `next/image` работает с этим путём как с любым same-origin URL, `remotePatterns` не трогаем.

### Админ-роуты (переписываются, формы ответов прежние)

**`app/api/admin/content/upload/route.ts`** — POST: `requireAdmin`, те же проверки (MIME-whitelist jpeg/png/webp/gif/avif — SVG исключён намеренно, stored XSS; лимит 10MB; `normalizeFileBaseName`). Вместо `fs.writeFile` — `prisma.mediaAsset.create`. Ответ: `{ path: '/api/media/<name>', originalName, size, mimeType }` — изменился только префикс пути, потребители используют возвращённое значение как есть.

**`app/api/admin/media/route.ts`**:
- GET — `findMany` **без колонки `data`** (select метаданных, байты не тянутся), сортировка `updatedAt desc`. Ответ прежней формы: `{ files: [{ name, path: '/api/media/<name>', size, isImage, ext, createdAt, modifiedAt }] }`; `ext` — из name, `isImage` — по прежнему набору расширений, `modifiedAt` — `updatedAt`.
- DELETE — `{ name | names[] }`, `deleteMany` по валидным именам; невалидные/ненайденные — в `errors`. Ответ `{ ok, deleted, errors }` как сейчас.

**`app/api/admin/media/replace/route.ts`** — POST FormData (name + file): те же проверки, `update` строки (`data`, `mimeType`, `size`; `updatedAt` бампается автоматически) — имя и путь сохраняются, все ссылки в KV/баннерах остаются валидными. Ненайденное имя — 404. Ответ `{ ok: true, path: '/api/media/<name>' }`.

## Ограничения и заметки

- **Лимит 10MB** остаётся в коде, но на Vercel serverless тело запроса ограничено ~4.5MB платформой — аплоад крупнее упадёт с 413 до нашей проверки. Известное ограничение, фиксируем в доке, не чиним (текущий код имеет его же).
- **Квота Neon:** байты в таблице едят storage-план. Картинки админки — единицы-десятки МБ, не критично; в медиатеке размер файла уже показывается.
- **Старые ссылки `/uploads/<name>`:** на проде файлы уже потеряны (эфемерная ФС), на dev статика продолжает отдаваться Next'ом как раньше. Redirect-мост не делаем — восстанавливать нечего; битые оверрайды админ перезаливает через медиатеку.
- **Dev = prod:** одна и та же таблица Neon в обоих окружениях, никакого fs-фолбэка и ветвления по среде.

## Обработка ошибок

Как в текущих роутах: try/catch → `{ error: '<код>' }` с тем же словарём кодов (`file_is_required`, `unsupported_file_type`, `file_too_large`, `invalid_filename`, `name_required`, `failed_to_upload_file`, `failed_to_delete`, `replace_failed`); serving-роут — 400/404/500.

## Тестирование

Vitest, prisma мокается (`vi.mock('@/lib/prisma')`), по образцу существующих route-тестов:

1. **upload**: не-админ → gate; нет файла → 400 `file_is_required`; SVG → 400 `unsupported_file_type`; >10MB → 400 `file_too_large`; успех → create вызван, ответ `{ path: '/api/media/...', originalName, size, mimeType }`.
2. **media GET**: ответ прежней формы, `data` не входит в select, сортировка по `modifiedAt` desc.
3. **media DELETE**: name/names[], невалидные имена в `errors`, `deleted` считается.
4. **replace**: валидации, update по name, 404 на ненайденное имя, путь в ответе сохраняет имя.
5. **serving GET**: found → 200 + Content-Type/Cache-Control/nosniff; не найдено → 404; невалидное имя → 400.

Ручная верификация: применить скрипт таблицы → загрузить картинку через /admin/content → увидеть в медиатеке → подставить в оверрайд → увидеть на витрине → replace → delete.

## Вне рамок

- Миграция старых файлов (нечего мигрировать — git пуст, прод потерян).
- Пересборка `next/image`-оптимизации, remotePatterns, CDN-инвалидация при replace.
- Хардкод-текст (саб-проект 2), логотип (саб-проект 3), stores/company (саб-проект 5).
- Уборка мёртвых Showcases/баннер-типов.
