import { isEmpty } from "./utils.js";

const DAY = 86400;
function calendarSeconds(year, month, day, hour = 0, minute = 0, second = 0) {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  if (
    year < 1 ||
    year > 9999 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw new Error("Date impossible dans le calendrier.");
  }
  return date.getTime() / 1000;
}

/** Excel values are converted once; Grist raw dates are already epoch seconds. */
export function parseDate(
  value,
  { date1904 = false, dateTime = false, timeZone = "UTC" } = {},
) {
  if (isEmpty(value)) return null;
  let seconds;
  let explicitZone = false;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error("Date invalide.");
    seconds = value.getTime() / 1000;
    explicitZone = true;
  } else if (typeof value === "number") {
    const whole = Math.floor(value);
    if (
      !Number.isFinite(value) ||
      value < (date1904 ? 0 : 1) ||
      (!date1904 && whole === 60)
    ) {
      throw new Error(
        "Numéro de date Excel invalide (le 29/02/1900 n’existe pas).",
      );
    }
    seconds =
      (date1904 ? calendarSeconds(1904, 1, 1) : calendarSeconds(1899, 12, 31)) +
      (value - (!date1904 && value >= 61 ? 1 : 0)) * DAY;
    seconds = Math.round(seconds);
  } else if (typeof value === "string") {
    const text = value.trim();
    const match = text.match(
      /^(?:(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4}))(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})?)?$/,
    );
    if (!match)
      throw new Error(
        "Date attendue : JJ/MM/AAAA ou AAAA-MM-JJ (heure facultative).",
      );
    const [, y, m, d, fd, fm, fy, h, min, sec, zone] = match;
    seconds = calendarSeconds(
      +(y || fy),
      +(m || fm),
      +(d || fd),
      +(h || 0),
      +(min || 0),
      +(sec || 0),
    );
    if (zone && dateTime) {
      explicitZone = true;
      if (zone !== "Z") {
        const [zh, zm] = zone.slice(1).split(":").map(Number);
        if (zh > 14 || zm > 59 || (zh === 14 && zm !== 0))
          throw new Error("Fuseau horaire invalide.");
        seconds -= (zone[0] === "+" ? 1 : -1) * (zh * 3600 + zm * 60);
      }
    }
  } else {
    throw new Error("Valeur de date non reconnue.");
  }
  if (
    !Number.isFinite(seconds) ||
    seconds < calendarSeconds(1, 1, 1) ||
    seconds >= calendarSeconds(9999, 12, 31) + DAY
  ) {
    throw new Error("Date hors limites (années 1 à 9999).");
  }
  if (!dateTime) return Math.floor(seconds / DAY) * DAY;
  if (explicitZone || timeZone === "UTC") return seconds;
  // Resolve a wall-clock Excel date in the Grist column timezone. Reject DST gaps/overlaps.
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const localSeconds = (timestamp) => {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(timestamp * 1000))
        .map((p) => [p.type, p.value]),
    );
    return calendarSeconds(
      +parts.year,
      +parts.month,
      +parts.day,
      +parts.hour,
      +parts.minute,
      +parts.second,
    );
  };
  const offsets = new Set(
    [-DAY, 0, DAY].map(
      (delta) => localSeconds(seconds + delta) - (seconds + delta),
    ),
  );
  const matches = [...offsets]
    .map((offset) => seconds - offset)
    .filter((candidate) => localSeconds(candidate) === seconds);
  if (matches.length !== 1)
    throw new Error(
      "Heure ambiguë ou inexistante au changement d’heure : préciser un décalage UTC.",
    );
  return matches[0];
}

export function formatValue(value, type = "") {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (
    (type === "Date" || type.startsWith("DateTime:")) &&
    typeof value === "number"
  ) {
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: type.startsWith("DateTime:") ? type.slice(9) : "UTC",
      dateStyle: "short",
      ...(type.startsWith("DateTime:") ? { timeStyle: "medium" } : {}),
    }).format(new Date(value * 1000));
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.slice(1).join(" · ");
  return String(value);
}
