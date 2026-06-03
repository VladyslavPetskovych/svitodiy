// Завантажує зображення за прямими URL у папку stock відповідної арки.
// Використання:
//   node scripts/addArcImages.js [--arc redemption] [urls.txt]
//   node scripts/addArcImages.js --arc grinding --url https://... --url https://...
//
// Формат файлу urls.txt: один URL на рядок; порожні рядки та рядки з "#" ігноруються.
// ВАЖЛИВО: потрібні ПРЯМІ посилання на зображення (закінчуються .jpg/.png/...),
// а не сторінки пінів. На Pinterest: відкрий пін → ПКМ по фото → «Копіювати адресу зображення».
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// arcId -> папка, куди писати (де вже лежать наявні зображення).
const ARC_DIRS = {
  redemption: path.join(__dirname, "../assets/stockForRedemption"),
  grinding: path.join(__dirname, "../assets/stockForGrindidng"),
  resilience: path.join(__dirname, "../assets/stockForResilience"),
};

const MAX_BYTES = 8 * 1024 * 1024; // запас під ліміт Telegram (~10 МБ)
const EXT_BY_TYPE = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

function parseArgs(argv) {
  let arc = "redemption";
  const urls = [];
  let file = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--arc") arc = argv[++i];
    else if (a === "--url") urls.push(argv[++i]);
    else if (!a.startsWith("--")) file = a;
  }
  return { arc, urls, file };
}

async function readUrlsFromFile(file) {
  const raw = await fs.readFile(file, "utf8");
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

/** Хеші вже наявних файлів — щоб не зберігати дублікати. */
async function existingHashes(dir) {
  const set = new Set();
  let names;
  try {
    names = await fs.readdir(dir);
  } catch {
    return set;
  }
  for (const n of names) {
    if (!/\.(png|jpe?g|webp)$/i.test(n)) continue;
    try {
      const buf = await fs.readFile(path.join(dir, n));
      set.add(crypto.createHash("sha1").update(buf).digest("hex"));
    } catch {
      /* ignore */
    }
  }
  return set;
}

/** Наступний індекс у схемі pN.ext. */
async function nextIndex(dir) {
  let names = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    /* dir may not exist yet */
  }
  let max = 0;
  for (const n of names) {
    const m = /^p(\d+)\.(png|jpe?g|webp)$/i.exec(n);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

async function main() {
  const { arc, urls: cliUrls, file } = parseArgs(process.argv.slice(2));
  const dir = ARC_DIRS[arc];
  if (!dir) {
    console.error(`Unknown arc "${arc}". Use one of: ${Object.keys(ARC_DIRS).join(", ")}`);
    process.exit(1);
  }

  let urls = [...cliUrls];
  if (file) urls.push(...(await readUrlsFromFile(file)));
  if (urls.length === 0) {
    console.error(
      "No URLs. Pass a file (node scripts/addArcImages.js urls.txt) or --url <link>."
    );
    process.exit(1);
  }
  // прибрати дублі-рядки
  urls = [...new Set(urls)];

  await fs.mkdir(dir, { recursive: true });
  const seen = await existingHashes(dir);
  let idx = await nextIndex(dir);

  let saved = 0;
  let skipped = 0;
  const failed = [];

  for (const url of urls) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) {
        failed.push(`${url} — HTTP ${res.status}`);
        continue;
      }
      const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      const ext = EXT_BY_TYPE[type];
      if (!ext) {
        failed.push(`${url} — not a direct image (content-type: ${type || "unknown"})`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) {
        failed.push(`${url} — empty body`);
        continue;
      }
      if (buf.length > MAX_BYTES) {
        failed.push(`${url} — too big (${(buf.length / 1048576).toFixed(1)} MB > 8 MB)`);
        continue;
      }
      const hash = crypto.createHash("sha1").update(buf).digest("hex");
      if (seen.has(hash)) {
        skipped++;
        console.log(`= dup, skip: ${url}`);
        continue;
      }
      const name = `p${idx++}${ext}`;
      await fs.writeFile(path.join(dir, name), buf);
      seen.add(hash);
      saved++;
      console.log(`+ ${name}  <-  ${url}`);
    } catch (err) {
      failed.push(`${url} — ${err.message}`);
    }
  }

  console.log(
    `\nDone (${arc}): saved ${saved}, skipped ${skipped} dup, failed ${failed.length}.`
  );
  if (failed.length) {
    console.log("Failed:");
    for (const f of failed) console.log("  - " + f);
  }
  console.log(`\nFolder: ${dir}`);
  console.log("Rebuild the bot to pick them up: docker compose -p svitodiy up -d --build");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
