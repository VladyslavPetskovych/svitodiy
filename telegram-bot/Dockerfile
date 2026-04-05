FROM node:22-alpine
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src
COPY assets ./assets

ENV NODE_ENV=production

CMD ["node", "src/index.js"]
