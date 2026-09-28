import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import cors from "cors";
import express from "express";
import { requireTelegramUser } from "./telegramAuth.js";
import { connectRedis, getUserSnapshot, upsertProfile } from "./userRepo.js";

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
const allowedOrigins = (process.env.MINIAPP_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();

app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : undefined));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "server" });
});

app.get("/api/ping", (_req, res) => {
  res.json({ message: "pong", at: new Date().toISOString() });
});

// Дані поточного користувача mini app. id береться лише з підписаного initData,
// тож чужий профіль підставити не вийде.
app.get("/api/me", requireTelegramUser(BOT_TOKEN), async (req, res) => {
  try {
    await upsertProfile(req.tgUser);
    res.json(await getUserSnapshot(req.tgUser.id));
  } catch (err) {
    console.error("[server] /api/me failed:", err);
    res.status(500).json({ error: "internal" });
  }
});

await connectRedis();

app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}`);
});
