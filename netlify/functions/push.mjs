// Hilal push subscriptions: GET ?vapid returns the public key, POST saves a subscription, DELETE removes it.
import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import { createHash } from "node:crypto";

export async function vapidKeys(store) {
  let k = await store.get("vapid", { type: "json" });
  if (!k || !k.publicKey) {
    k = webpush.generateVAPIDKeys();
    await store.setJSON("vapid", k);
  }
  return k;
}
const id = (ep) => "sub-" + createHash("sha256").update(ep).digest("hex").slice(0, 40);
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req) => {
  const store = getStore("hilal-push");
  const url = new URL(req.url);
  if (req.method === "GET") {
    const k = await vapidKeys(store);
    return json({ publicKey: k.publicKey });
  }
  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const sub = body && body.sub;
  if (!sub || typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint) || sub.endpoint.length > 1000) return json({ error: "bad subscription" }, 400);
  const key = id(sub.endpoint);
  if (req.method === "DELETE") { await store.delete(key); return json({ ok: true }); }
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const old = (await store.get(key, { type: "json" })) || {};
  const loc = body.loc && typeof body.loc.lat === "number" && typeof body.loc.lon === "number" ? { lat: body.loc.lat, lon: body.loc.lon } : null;
  const P = body.prefs && typeof body.prefs === "object" ? body.prefs : {};
  const t = (v) => (typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : null);
  const rec = {
    sub: { endpoint: sub.endpoint, keys: { p256dh: String(sub.keys?.p256dh || ""), auth: String(sub.keys?.auth || "") } },
    lang: body.lang === "en" ? "en" : "ar",
    tz: typeof body.tz === "string" && body.tz.length < 60 ? body.tz : "UTC",
    loc, meth: typeof body.meth === "string" ? body.meth.slice(0, 30) : "MuslimWorldLeague", madhab: body.madhab === "hanafi" ? "hanafi" : "shafi",
    name: typeof body.name === "string" ? body.name.slice(0, 30) : "",
    prefs: { prayer: !!P.prayer, morning: t(P.morning), evening: !!P.evening, quran: t(P.quran), moon: t(P.moon), move: t(P.move), journal: t(P.journal) },
    sent: old.sent || {},
    updated: Date.now(),
  };
  await store.setJSON(key, rec);
  if (body.test) {
    const k = await vapidKeys(store);
    webpush.setVapidDetails("mailto:hilal.girls@users.noreply.github.com", k.publicKey, k.privateKey);
    try {
      await webpush.sendNotification(rec.sub, JSON.stringify({ title: rec.lang === "ar" ? "هلال 🌙" : "Hilal 🌙", body: rec.lang === "ar" ? "الإشعارات شغالة ✓" : "Notifications are on ✓", url: "./#today" }));
    } catch (e) { return json({ ok: true, test: "failed", code: e.statusCode || 0 }); }
  }
  return json({ ok: true });
};
export const config = { path: "/api/push" };
