import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import cors from "cors";
import express from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "server" });
});

app.get("/api/ping", (_req, res) => {
  res.json({ message: "pong", at: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}`);
});
