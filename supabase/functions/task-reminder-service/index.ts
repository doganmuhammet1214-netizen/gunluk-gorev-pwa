// @ts-nocheck — Deno Edge Runtime global'leri için
import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// task-reminder-service — Supabase Edge Function
//
// Tetikleyici: Upstash QStash (Delayed Job)
// Akış:
//   1. Kullanıcı görev ekler → Frontend QStash'e "Upstash-Delay" ile POST atar.
//   2. Gecikme süresi dolunca QStash bu endpoint'i çağırır.
//   3. Bu fonksiyon push_subscriptions'tan abonelikleri çeker ve
//      Web Push (VAPID, aes128gcm şifreli) bildirim gönderir.
//   4. Görev is_notified = true olarak işaretlenir.
//
// Ortam değişkenleri (Supabase Dashboard > Edge Functions > Secrets):
//   SUPABASE_URL              - otomatik
//   SUPABASE_SERVICE_ROLE_KEY - otomatik
//   VAPID_PUBLIC_KEY          - web-push generate-vapid-keys çıktısı
//   VAPID_PRIVATE_KEY         - web-push generate-vapid-keys çıktısı
//   VAPID_SUBJECT             - mailto:admin@ornek.com
// ─────────────────────────────────────────────────────────────────────────────

// ─── Tipler ──────────────────────────────────────────────────────────────────

interface QStashPayload {
  taskId:       string;
  title:        string;
  priority?:    "low" | "medium" | "high";
  reminderTime?: string;
}

interface PushSubscriptionRow {
  id:           string;
  user_id:      string | null;
  device_label: string;
  endpoint:     string;
  p256dh:       string;
  auth:         string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Web Push Şifreleme Yardımcıları
// RFC 8291 (Message Encryption) + RFC 8292 (VAPID) — harici kütüphane yok
// ─────────────────────────────────────────────────────────────────────────────

function base64UrlToUint8Array(base64url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64  = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from([...atob(base64)].map((c) => c.charCodeAt(0)));
}

function uint8ArrayToBase64Url(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * VAPID JWT Authorization başlığı üretir.
 * RFC 8292 uyumlu ES256 imzası.
 */
async function buildVapidAuthHeader(
  endpoint: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  subject: string
): Promise<string> {
  const { protocol, host } = new URL(endpoint);
  const audience = `${protocol}//${host}`;

  const now     = Math.floor(Date.now() / 1000);
  const header  = { alg: "ES256", typ: "JWT" };
  const payload = { aud: audience, exp: now + 43200, sub: subject }; // 12 saat

  const encHeader  = uint8ArrayToBase64Url(new TextEncoder().encode(JSON.stringify(header)));
  const encPayload = uint8ArrayToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sigInput   = `${encHeader}.${encPayload}`;

  // VAPID private key — raw EC format (32 byte) → pkcs8'e çevir
  const rawPrivate   = base64UrlToUint8Array(vapidPrivateKey);
  const rawPublic    = base64UrlToUint8Array(vapidPublicKey);

  // pkcs8 wrapper: EC private key için sabit ASN.1 prefix
  const pkcs8Prefix = new Uint8Array([
    0x30, 0x81, 0x87, 0x02, 0x01, 0x00, 0x30, 0x13,
    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02,
    0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d,
    0x03, 0x01, 0x07, 0x04, 0x6d, 0x30, 0x6b, 0x02,
    0x01, 0x01, 0x04, 0x20,
  ]);
  const pkcs8Suffix = new Uint8Array([
    0xa1, 0x44, 0x03, 0x42, 0x00,
    ...rawPublic,
  ]);
  const pkcs8 = new Uint8Array([...pkcs8Prefix, ...rawPrivate, ...pkcs8Suffix]);

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privateKey,
      new TextEncoder().encode(sigInput)
    )
  );

  const jwt = `${sigInput}.${uint8ArrayToBase64Url(signature)}`;
  return `vapid t=${jwt}, k=${vapidPublicKey}`;
}

/**
 * Tek bir push aboneliğine şifreli Web Push mesajı gönderir.
 * RFC 8291 aes128gcm şifreleme.
 */
async function sendWebPush(
  sub: PushSubscriptionRow,
  notifPayload: Record<string, unknown>,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    // 1. Salt + ephemeral ECDH anahtar çifti
    const salt    = crypto.getRandomValues(new Uint8Array(16));
    const authKey = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"]
    );

    // 2. Ephemeral public key (raw)
    const serverPublicRaw = new Uint8Array(
      await crypto.subtle.exportKey("raw", authKey.publicKey)
    );

    // 3. Cihaz public key'ini import et
    const clientPublicKeyBytes = base64UrlToUint8Array(sub.p256dh);
    const clientPublicKey = await crypto.subtle.importKey(
      "raw",
      clientPublicKeyBytes,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      []
    );

    // 4. ECDH shared secret
    const sharedSecret = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: "ECDH", public: clientPublicKey },
        authKey.privateKey,
        256
      )
    );

    // 5. Auth secret
    const authSecret = base64UrlToUint8Array(sub.auth);

    // 6. HKDF PRK
    const hkdfKey = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveBits"]);
    const prkInfo = new Uint8Array([
      ...new TextEncoder().encode("WebPush: info\x00"),
      ...clientPublicKeyBytes,
      ...serverPublicRaw,
    ]);
    const prk = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: "HKDF", hash: "SHA-256", salt: authSecret, info: prkInfo },
        hkdfKey,
        256
      )
    );

    // 7. CEK + Nonce
    const prkKey = await crypto.subtle.importKey("raw", prk, "HKDF", false, ["deriveBits"]);
    const cek = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "HKDF", hash: "SHA-256", salt,
          info: new TextEncoder().encode("Content-Encoding: aes128gcm\x00"),
        },
        prkKey,
        128
      )
    );
    const nonce = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "HKDF", hash: "SHA-256", salt,
          info: new TextEncoder().encode("Content-Encoding: nonce\x00"),
        },
        prkKey,
        96
      )
    );

    // 8. Payload şifrele (AES-128-GCM)
    const plaintext = new Uint8Array([
      ...new TextEncoder().encode(JSON.stringify(notifPayload)),
      0x02, // padding delimiter
    ]);
    const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, plaintext)
    );

    // 9. aes128gcm body
    const rs = new Uint8Array(4);
    new DataView(rs.buffer).setUint32(0, 4096, false);
    const keyidLen = new Uint8Array([serverPublicRaw.length]);
    const body = new Uint8Array([...salt, ...rs, ...keyidLen, ...serverPublicRaw, ...ciphertext]);

    // 10. VAPID Authorization
    const authorization = await buildVapidAuthHeader(
      sub.endpoint,
      vapidPublicKey,
      vapidPrivateKey,
      vapidSubject
    );

    // 11. HTTP POST to push endpoint
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        "Content-Type":     "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        Authorization:      authorization,
        TTL:                "86400",
      },
      body,
    });

    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ana Handler
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  // ── CORS — QStash doğrudan POST atar, preflight gerekmez ──────────────────
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  // ── Ortam değişkenleri ────────────────────────────────────────────────────
  const supabaseUrl        = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const vapidPublicKey     = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey    = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject       = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

  if (!supabaseUrl || !supabaseServiceKey) {
    return Response.json({ error: "Supabase ortam değişkenleri eksik." }, { status: 500 });
  }
  if (!vapidPublicKey || !vapidPrivateKey) {
    return Response.json({ error: "VAPID anahtarları eksik." }, { status: 500 });
  }

  // ── QStash Payload'ını ayrıştır ───────────────────────────────────────────
  let payload: QStashPayload;
  try {
    payload = await req.json() as QStashPayload;
  } catch {
    return Response.json({ error: "Geçersiz JSON payload." }, { status: 400 });
  }

  const { taskId, title, priority = "medium" } = payload;

  if (!taskId || !title) {
    return Response.json({ error: "taskId ve title zorunludur." }, { status: 400 });
  }

  // ── Supabase admin istemcisi ──────────────────────────────────────────────
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  // ── Görevi al (iptal / tamamlandı kontrolü) ───────────────────────────────
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id, title, completed, is_notified, user_id")
    .eq("id", taskId)
    .single();

  if (taskError || !task) {
    console.warn(`[task-reminder-service] Görev bulunamadı: ${taskId}`);
    return Response.json({ skipped: true, reason: "Görev bulunamadı." });
  }

  // Görev tamamlandıysa ya da daha önce bildirilmişse atla
  if (task.completed || task.is_notified) {
    return Response.json({
      skipped: true,
      reason: task.completed ? "Görev zaten tamamlandı." : "Bildirim zaten gönderildi.",
    });
  }

  // ── İlgili push aboneliklerini çek ───────────────────────────────────────
  let subsQuery = supabase
    .from("push_subscriptions")
    .select("id, user_id, device_label, endpoint, p256dh, auth");

  if (task.user_id) {
    subsQuery = subsQuery.eq("user_id", task.user_id);
  }

  const { data: subs, error: subsError } = await subsQuery;

  if (subsError) {
    console.error("[task-reminder-service] Abonelik sorgulama hatası:", subsError);
    return Response.json({ error: subsError.message }, { status: 500 });
  }

  const subscriptions = (subs ?? []) as PushSubscriptionRow[];

  if (subscriptions.length === 0) {
    console.warn("[task-reminder-service] Kayıtlı abonelik yok.");
    return Response.json({ sent: 0, reason: "Abonelik bulunamadı." });
  }

  // ── Bildirim payload'ı ────────────────────────────────────────────────────
  const priorityEmoji = priority === "high" ? "🔴" : priority === "medium" ? "🟡" : "🟢";
  const notifPayload  = {
    title: `⏰ ${priorityEmoji} Görev Zamanı Geldi!`,
    body:  title,
    icon:  "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag:   `task-${taskId}`,
    data:  { url: "/", taskId, priority },
  };

  // ── Her aboneliğe push gönder ─────────────────────────────────────────────
  const results: Array<{ device: string; ok: boolean; status?: number; error?: string }> = [];

  for (const sub of subscriptions) {
    const result = await sendWebPush(
      sub,
      notifPayload,
      vapidPublicKey,
      vapidPrivateKey,
      vapidSubject
    );
    results.push({ device: sub.device_label, ...result });

    if (result.ok) {
      console.log(`[task-reminder-service] ✓ Bildirim gönderildi → ${sub.device_label}`);
    } else {
      console.warn(`[task-reminder-service] ✗ Gönderilemedi → ${sub.device_label}:`, result.error ?? `HTTP ${result.status}`);
    }
  }

  // ── Görevi is_notified = true olarak işaretle ─────────────────────────────
  const successCount = results.filter((r) => r.ok).length;

  if (successCount > 0) {
    const { error: updateError } = await supabase
      .from("tasks")
      .update({ is_notified: true })
      .eq("id", taskId);

    if (updateError) {
      console.error("[task-reminder-service] is_notified güncellenemedi:", updateError);
    }
  }

  return Response.json({
    taskId,
    title,
    sent:    successCount,
    total:   subscriptions.length,
    results,
  });
});
