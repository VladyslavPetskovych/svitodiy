/**
 * Розбір рядка завдання: «текст» або «текст | DD.MM.YYYY HH:mm» (рік 4 цифри).
 * Час інтерпретується в локальній часовій зоні процесу Node (на VPS задай TZ=Europe/Kyiv у Docker).
 * @returns {{ title: string, remindAt: number | null, error?: string }}
 */
export function parseTaskInput(raw) {
  const text = String(raw ?? "").trim();
  if (!text) {
    return { title: "", remindAt: null, error: "Порожній текст." };
  }

  const pipe = text.indexOf("|");
  if (pipe === -1) {
    return { title: text, remindAt: null };
  }

  const title = text.slice(0, pipe).trim();
  const datePart = text.slice(pipe + 1).trim();

  if (!title) {
    return { title: "", remindAt: null, error: "Додай текст завдання перед символом |" };
  }

  const remindAt = parseDateTimeUa(datePart);
  if (remindAt == null) {
    return {
      title,
      remindAt: null,
      error:
        "Не вдалося розпізнати дату. Формат: DD.MM.YYYY або DD.MM.YYYY HH:mm (наприклад 15.04.2026 18:30).",
    };
  }

  return { title, remindAt };
}

/**
 * @param {string} str
 * @returns {number | null} ms timestamp
 */
function parseDateTimeUa(str) {
  const s = str.trim();
  const m = s.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/
  );
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = Number(m[3]);
    const h = m[4] != null ? Number(m[4]) : 9;
    const min = m[5] != null ? Number(m[5]) : 0;
    if (
      mo < 1 ||
      mo > 12 ||
      d < 1 ||
      d > 31 ||
      h < 0 ||
      h > 23 ||
      min < 0 ||
      min > 59
    ) {
      return null;
    }
    const t = new Date(y, mo - 1, d, h, min, 0, 0).getTime();
    return Number.isNaN(t) ? null : t;
  }

  const iso = Date.parse(s.replace(/(\d{2})\.(\d{2})\.(\d{4})/, "$3-$2-$1"));
  if (!Number.isNaN(iso)) return iso;

  const t2 = Date.parse(s);
  return Number.isNaN(t2) ? null : t2;
}
