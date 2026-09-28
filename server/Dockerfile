# Збирається з КОРЕНЯ репозиторію (context: . у docker-compose.yml):
# сервер імпортує ігрові модулі бота (server/src/bot.js), тож потрібні обидві папки.
FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY telegram-bot/package.json telegram-bot/
RUN npm ci --omit=dev -w server -w telegram-bot

COPY telegram-bot/src telegram-bot/src
COPY server/src server/src

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server/src/index.js"]
