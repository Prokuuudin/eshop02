# Уведомление о запуске Hairshop Pro

Плашка подключена после Header через общий языковой layout. Использует существующие переводы RU/LV/EN, стили темы и `COMPANY.email` (`info@hairshop.lv`). Не показывается на `/admin`, `/auth`, `/checkout`, `/payment`, `/order`, `/account` и их вложенных маршрутах.

Единый ключ `hairshoppro.launch-notice.dismissed`: значение `1` в sessionStorage при обычном закрытии, в localStorage — при закрытии с отмеченным чекбоксом. Чекбокс изначально выключен. Само переключение чекбокса ничего не сохраняет. Сервер и первый рендер гидратации возвращают null; затем useSyncExternalStore читает браузерное хранилище. При недоступном storage плашку можно закрыть в текущем экземпляре компонента.

## Локальная проверка

Выполнены TypeScript (`tsc --noEmit`), ESLint изменённых файлов, проверка кодировки и `git diff --check`.

Изолированный браузерный сценарий: `node --preserve-symlinks --preserve-symlinks-main scripts/check-store-launch-notice.mjs`. Использует уже установленные инструменты esbuild, PostCSS/Tailwind и Playwright, а также установленный Google Chrome. Новых зависимостей нет. Сценарий не загружает env-файлы, приложение или общий E2E setup и не подключается к БД. Подменяются только адаптеры маршрута и локализации; компонент, словари и CSS настоящие. Скриншоты создаются в `output/launch-notice-check/`.

Пройдены RU/LV/EN на ширинах 320, 375 и 1440 px, проверка mailto, отсутствие горизонтального переполнения и наложения на соседние блоки, закрытие Enter, переключение чекбокса Space, скрытие после перезагрузки и смены языка, новый tab без sessionStorage, постоянное скрытие в новом tab, исключённые маршруты и отказ браузерного storage. Ошибок браузера и гидратации нет. Мобильный скриншот просмотрен.

## Vercel Preview

Ветка `preview/hairshop-launch-notice` содержит Preview-only `vercel.json`: установка с `npm ci --ignore-scripts`, сборка через `scripts/build-launch-notice-preview.mjs`. Скрипт допускает только VERCEL_ENV=preview, endpoint `ep-square-sun-aqnyfzkh` ветки `preview-hotfix-20261022` (`br-winter-boat-aq0bxnax`) и SMTP_HOST=smtp.invalid. Любой другой заданный DATABASE_URL/DIRECT_URL/POSTGRES_* URL прерывает сборку. Команды сборки: Prisma generate и Next build; миграции не вызываются. Настройки проекта Vercel для production/staging не изменяются. Эту Preview-only конфигурацию не переносить в production-ветку.

В Preview повторить проверки на настоящих страницах магазина: положение под шапкой, светлая/тёмная темы, мобильная навигация, смена языка и оба режима закрытия. Для сброса удалить указанный ключ из обоих браузерных хранилищ. Проверка полного приложения и сборка остаются для изолированного Preview.

Production-деплой на Plesk и изменения production Neon не выполнялись. Посторонние локальные изменения в репозитории не включать в эту задачу.
