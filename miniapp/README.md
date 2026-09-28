# Світодій — Telegram Mini App

React + Vite + Tailwind v4. Показує профіль, баланс, статистику рибалки та інвентар користувача.

## Як це працює

```
Telegram ──initData──▶ Mini App (Netlify) ──Authorization: tma <initData>──▶ server /api/me ──▶ Redis
```

- Telegram передає в апку `initData`: підписаний токеном бота рядок з `user.id`, ім'ям, username, фото.
- `server` перевіряє підпис (`server/src/telegramAuth.js`), тож підставити чужий id не вийде.
- Дані беруться з того ж Redis, що й у бота: `svitodiy:user:<id>` (hash) і `svitodiy:inv:<id>` (hash).
  Під час кожного відкриття апки server оновлює в `svitodiy:user:<id>` поля профілю:
  `firstName`, `lastName`, `username`, `photoUrl`, `languageCode`, `isPremium`, `lastSeenAt` (+ `firstSeenAt`, якщо його ще немає).

## Локальна розробка

```bash
cp .env.example .env.local   # VITE_API_URL=http://localhost:3000
npm install
npm run dev
```

У звичайному браузері `initData` немає, тож апка покаже «Відкрий через бота».
Щоб перевірити в Telegram, потрібен HTTPS: підійде тунель (`cloudflared tunnel --url http://localhost:5173`
або ngrok). Отриманий URL постав у `MINIAPP_URL` і перезапусти бота.

## Деплой на Netlify

1. New site → Import from Git → цей репозиторій.
2. **Base directory**: `miniapp` (build command і publish підтягнуться з `netlify.toml`).
3. Environment variables: `VITE_API_URL` = публічний HTTPS-адрес API.
4. Адреса сайту — https://svitodiy.netlify.app. Вона прописана в `docker-compose.yml`
   (`MINIAPP_URL` для бота, `MINIAPP_ORIGINS` для server), тож після деплою бот сам
   виставить кнопку «Відкрити» в меню чату.
