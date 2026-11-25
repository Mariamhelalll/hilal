// Runs every 5 minutes and sends any Hilal reminders that became due.
import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import * as adhan from "adhan";
import { vapidKeys } from "./push.mjs";

const PR = { fajr: ["Fajr", "الفجر"], dhuhr: ["Dhuhr", "الظهر"], asr: ["Asr", "العصر"], maghrib: ["Maghrib", "المغرب"], isha: ["Isha", "العشاء"] };
const MSG = {
  prayer: (p, ar) => (ar ? [`🕌 حان وقت صلاة ${PR[p][1]}`, "قومي اتوضي وصلّي في وقتها 🤍"] : [`🕌 It's time for ${PR[p][0]}`, "Pray on time, you've got this 🤍"]),
  morning: (ar) => (ar ? ["☀️ أذكار الصباح", "دقيقتين يحفظوكي اليوم كله"] : ["☀️ Morning adhkar", "Two minutes that protect your whole day"]),
  evening: (ar) => (ar ? ["🌇 أذكار المسا", "خلّصي يومك بذكر ربنا"] : ["🌇 Evening adhkar", "End your day with the remembrance of Allah"]),
  quran: (ar) => (ar ? ["📖 صفحة قرآن", "ولو صفحة واحدة النهارده"] : ["📖 Your Quran page", "Even one page today counts"]),
  moon: (ar) => (ar ? ["🌙 خطوة النهارده في قمرك", "شوفي خطوات الأسبوع ده وكمّلي"] : ["🌙 Today's step on your moon", "Check this week's steps and keep going"]),
  move: (ar) => (ar ? ["💪 وقت الحركة", "حتى ٢٠ دقيقة بتفرق"] : ["💪 Time to move", "Even 20 minutes makes a difference"]),
  journal: (ar) => (ar ? ["📓 كام دقيقة مع نفسك؟", "اكتبي أو اتكلمي عن يومك"] : ["📓 A few minutes with yourself?", "Write or talk about your day"]),
};
const URLS = { prayer: "./#deen", morning: "./#deen", evening: "./#deen", quran: "./#deen", moon: "./#today", move: "./#health", journal: "./#journal" };

function parts(now, tz) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const o = Object.fromEntries(f.formatToParts(now).map((p) => [p.type, p.value]));
  return { y: +o.year, m: +o.month, d: +o.day, hh: +o.hour, mm: +o.minute, day: `${o.year}-${o.month}-${o.day}` };
}
function localToDate(p, hhmm, tz, now) {
  const [h, m] = hhmm.split(":").map(Number);
  const guess = Date.UTC(p.y, p.m - 1, p.d, h, m);
  const q = parts(new Date(guess), tz);
  const off = Date.UTC(q.y, q.m - 1, q.d, q.hh, q.mm) - guess;
  return new Date(guess - off);
}
export function dueEvents(rec, now = new Date()) {
  let tz = rec.tz || "UTC";
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { tz = "UTC"; }
  const p = parts(now, tz), ev = [], P = rec.prefs || {};
  let times = null;
  if (rec.loc) {
    try {
      const params = (adhan.CalculationMethod[rec.meth] || adhan.CalculationMethod.MuslimWorldLeague)();
      params.madhab = rec.madhab === "hanafi" ? adhan.Madhab.Hanafi : adhan.Madhab.Shafi;
      const c = new adhan.Coordinates(rec.loc.lat, rec.loc.lon);
      if (rec.loc.lat > 48) params.highLatitudeRule = adhan.HighLatitudeRule.recommended(c);
      times = new adhan.PrayerTimes(c, new Date(p.y, p.m - 1, p.d, 12), params);
    } catch { times = null; }
  }
  if (P.prayer && times) for (const k of Object.keys(PR)) ev.push(["prayer-" + k, times[k], "prayer", k]);
  if (P.evening) ev.push(["evening", times ? new Date(times.asr.getTime() + 20 * 60000) : localToDate(p, "17:00", tz), "evening"]);
  for (const k of ["morning", "quran", "moon", "move", "journal"]) if (P[k]) ev.push([k, localToDate(p, P[k], tz), k]);
  const win = 7 * 60000;
  return ev.filter(([key, at]) => at && at <= now && now - at < win && (rec.sent || {})[key] !== p.day).map(([key, at, kind, extra]) => ({ key, at, kind, extra, day: p.day }));
}
export function message(e, rec) {
  const ar = rec.lang !== "en";
  const [title, body] = e.kind === "prayer" ? MSG.prayer(e.extra, ar) : MSG[e.kind](ar);
  return { title, body, url: URLS[e.kind], tag: e.key };
}

export default async () => {
  const store = getStore("hilal-push");
  const k = await vapidKeys(store);
  webpush.setVapidDetails("mailto:hilal.girls@users.noreply.github.com", k.publicKey, k.privateKey);
  const { blobs } = await store.list({ prefix: "sub-" });
  const now = new Date();
  let sent = 0;
  for (const b of blobs) {
    const rec = await store.get(b.key, { type: "json" });
    if (!rec || !rec.sub) continue;
    const due = dueEvents(rec, now);
    if (!due.length) continue;
    let gone = false;
    for (const e of due) {
      try { await webpush.sendNotification(rec.sub, JSON.stringify(message(e, rec)), { TTL: 1800 }); sent++; }
      catch (err) { if (err.statusCode === 404 || err.statusCode === 410) { gone = true; break; } }
      rec.sent = rec.sent || {}; rec.sent[e.key] = e.day;
    }
    if (gone) await store.delete(b.key); else await store.setJSON(b.key, rec);
  }
  return new Response(JSON.stringify({ sent }));
};
export const config = { schedule: "*/5 * * * *" };
