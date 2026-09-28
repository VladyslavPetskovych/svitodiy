import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import cors from "cors";
import express from "express";
import { connectRedis } from "./bot.js";
import { buildApiRouter } from "./routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error("Missing TELEGRAM_BOT_TOKEN in .env (потрібен для перевірки initData)");
  process.exit(1);
}

// Список дозволених origin для mini app (Netlify-домен). Порожньо — дозволено всім (локальна розробка).
// Через проксі Netlify (/api/* на тому ж домені) CORS взагалі не задіяний.
const allowedOrigins = (process.env.MINIAPP_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();

app.disable("x-powered-by");
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : undefined));
app.use(express.json({ limit: "16kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "server" });
});

app.get("/api/ping", (_req, res) => {
  res.json({ message: "pong", at: new Date().toISOString() });
});

app.use("/api", buildApiRouter(BOT_TOKEN));

await connectRedis();

app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}`);
});
