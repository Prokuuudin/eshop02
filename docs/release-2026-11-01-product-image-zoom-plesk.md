# Plesk release: product image zoom

Дата: 2026-11-01

Release-ветка: `release/2026-11-01-product-image-zoom`

База текущего Plesk: `3afab567684625f43250911e8b2e3304e2e7b9ca`

## Состав релиза

- боковое окно лупы увеличено до 112% и выровнено с основным фото по центральной линии;
- возвращена прежняя прозрачность линзы (`bg-primary/10`);
- узкие увеличенные изображения центрируются внутри окна, а не прижимаются влево;
- геометрия лупы учитывает фактический размер увеличенного окна;
- добавлен unit-тест центрирования узкого изображения.

Релиз не содержит новых изображений, изменений Prisma schema, миграций, переменных
окружения или данных. Относительно базы меняются только:

- `components/ProductImageZoom.tsx`;
- `hooks/useImageZoom.ts`;
- `lib/image-zoom-geometry.ts`;
- `lib/image-zoom-geometry.test.ts`;
- этот release-handoff.

## Перед Deploy Now

1. Записать текущие branch и SHA Plesk. Ожидаемая база до релиза — `3afab567`.
2. Убедиться, что нет незавершённого предыдущего Deploy Now или build.
3. Не менять `.env.local`, `web.config`, `iisnode.yml`, изображения и настройки
   scheduled tasks.
4. Убедиться, что в Git выбран проект `hairshoppro.lv` и сохранён прежний deployment path.

## Деплой

1. Plesk → Websites & Domains → `hairshoppro.lv` → Git.
2. Выбрать ветку `release/2026-11-01-product-image-zoom` и нажать **Deploy Now**.
3. Проверить, что развернут tip release-ветки, указанный в итоговом handoff.
4. Node.js → **NPM install** (`npm ci` по committed lockfile).
5. Запустить script **build** (`npm run build`) и дождаться успешного завершения.
   В релизе нет новых миграций, но текущий package script штатно выполняет
   `prisma migrate deploy` перед сборкой.
6. Нажать **Restart App**.

## Smoke-check после рестарта

1. `/api/health` отвечает `200` и `db: ok`.
2. Открыть карточку товара с вертикальной фотографией:
   - линза имеет прежнюю лёгкую прозрачность;
   - увеличенное окно немного больше основного;
   - центры двух окон находятся на одной горизонтальной линии;
   - товар внутри увеличенного окна не смещён влево.
3. Проверить квадратную фотографию: фрагмент под курсором соответствует увеличенному фрагменту.
4. На мобильном устройстве тап по фото открывает lightbox.
5. В browser console и iisnode stderr нет новых ошибок.

## Rollback

1. Выбрать rollback-ветку `release/2026-11-01-plesk-pre-product-image-zoom`, зафиксированную на базе `3afab567`.
2. **Deploy Now** → **NPM install** → script **build** → **Restart App**.
3. Повторить `/api/health` и открытие карточки товара.

Изменений БД и данных в этом релизе нет, поэтому отдельный database rollback не нужен.
