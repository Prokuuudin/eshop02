# Deploy: GitHub + Vercel

Этот гайд покрывает полный путь: публикация репозитория в GitHub, подключение к Vercel, настройка домена и переменных окружения.

## 1) Подготовка проекта локально

1. Убедитесь, что проект собирается:

```bash
npm install
npm run build
```

2. Проверьте `.env.example`.

В этом проекте обязательно нужен:

-   `NEXT_PUBLIC_SITE_URL` — публичный URL сайта (с `https://`, без `/` в конце).

Пример:

```dotenv
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

## 2) Публикация в GitHub

### Вариант A: через интерфейс GitHub

1. Создайте новый репозиторий в GitHub.
2. В корне проекта выполните:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

### Вариант B: если репозиторий уже есть

```bash
git add .
git commit -m "Update project"
git push
```

## 3) Импорт проекта в Vercel

1. Зайдите в Vercel → **Add New...** → **Project**.
2. Выберите ваш GitHub-репозиторий.
3. Проверьте настройки сборки:
    - Framework: `Next.js`
    - Build Command: `npm run build`
    - Install Command: `npm install`
    - Output Directory: оставить по умолчанию (`.next`)
4. Нажмите **Deploy**.

## 4) Настройка Environment Variables в Vercel

Откройте проект в Vercel → **Settings** → **Environment Variables** и добавьте:

-   `NEXT_PUBLIC_SITE_URL` = `https://your-domain.com`

Рекомендуется добавить одинаково для окружений:

-   Production
-   Preview
-   Development (по желанию)

После изменения env нажмите **Redeploy**.

## 5) Подключение домена

1. В Vercel: **Settings** → **Domains** → Add Domain.
2. Добавьте ваш домен (`your-domain.com`) и при необходимости `www.your-domain.com`.
3. В DNS-провайдере настройте записи, которые покажет Vercel:
    - обычно `A`/`ALIAS` для apex домена
    - `CNAME` для `www`
4. Дождитесь статуса **Valid Configuration**.

## 6) Чеклист перед запуском (Go-Live)

-   [ ] `npm run build` проходит локально
-   [ ] Репозиторий запушен в GitHub (`main`)
-   [ ] Проект импортирован в Vercel
-   [ ] `NEXT_PUBLIC_SITE_URL` задан в Vercel
-   [ ] Домен подключен и DNS валиден
-   [ ] HTTPS активен (сертификат выдан)
-   [ ] Открывается `/robots.txt`
-   [ ] Открывается `/sitemap.xml`
-   [ ] Canonical/OpenGraph URL указывают на прод-домен

## 7) Быстрая проверка после деплоя

1. Откройте главную и каталог, проверьте ссылки и изображения.
2. Проверьте в DevTools, что нет 404 на статические ресурсы.
3. Убедитесь, что в исходном HTML/метаданных используется корректный домен.

## 8) Частые проблемы

### Неправильные canonical/OG ссылки

Причина: не задан или неверно задан `NEXT_PUBLIC_SITE_URL`.

Решение: исправьте env, затем **Redeploy**.

### Домен не активируется

Причина: DNS ещё не распространился или не совпадают записи.

Решение: сверить DNS с подсказками Vercel и подождать propagation.

### Отличия Preview и Production

Если нужен отдельный URL для preview, задайте соответствующее значение env для Preview окружения.

---

Если хотите, можно добавить следующий шаг: автоматическая проверка качества перед деплоем (например, через GitHub Actions: `npm run build`, `npm run test:unit`).
