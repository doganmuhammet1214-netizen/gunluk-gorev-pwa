// @ts-nocheck — Deno Edge Runtime global'leri için
import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// Tip tanımları
// ─────────────────────────────────────────────────────────────────────────────

interface TaskRow {
  id: string;
  title: string;
  note: string | null;
  priority: "low" | "medium" | "high";
  completed: boolean;
  due_date: string | null;
  reminder_time: string | null;
  is_notified: boolean;
  user_id: string | null;
}

interface PushSubscriptionRow {
  id: string;
  user_id: string | null;
  device_label: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Web Push yardımcıları (native Crypto API — harici kütüphane yok)
// ─────────────────────────────────────────────────────────────────────────────

/** Base64url → Uint8Array */
function base64UrlToUint8Array(base64url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  return Uint8Array.from([...binary].map((c) => c.charCodeAt(0)));
}

/** Uint8Array → Base64url */
function uint8ArrayToBase64Url(arr: Uint8Array): string {
  const binary = String.fromCharCode(...arr);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * VAPID Authorization başlığı üretir.
 * RFC 8292 / draft-ietf-webpush-vapid uyumlu.
 */
async function buildVapidAuthHeader(
  endpoint: string,
  vapidPublicKeyB64: string,
  vapidPrivateKeyB64: string,
  subject: string = "mailto:admin@example.com"
): Promise<string> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;

  // JWT header + payload
  const header = { alg: "ES256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 3600, // 12 saat geçerli
    sub: subject,
  };

  const encodedHeader = uint8ArrayToBase64Url(
    new TextEncoder().encode(JSON.stringify(header))
  );
  const encodedPayload = uint8ArrayToBase64Url(
    new TextEncoder().encode(JSON.stringify(payload))
  );
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // Private key import (raw EC key)
  const privateKeyBytes = base64UrlToUint8Array(vapidPrivateKeyB64);
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signatureBytes = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      privateKey,
      new TextEncoder().encode(signingInput)
    )
  );

  const jwtToken = `${signingInput}.${uint8ArrayToBase64Url(signatureBytes)}`;
  const vapidParam = `vapid t=${jwtToken}, k=${vapidPublicKeyB64}`;

  return vapidParam;
}

/**
 * Tek bir push aboneliğine şifreli Web Push mesajı gönderir.
 * RFC 8291 (Message Encryption) + RFC 8292 (VAPID) uyumlu.
 */
async function sendWebPush(
  sub: PushSubscriptionRow,
  payload: Record<string, unknown>,
  vapidPublicKey: string,
  vapidPrivateKey: string
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    // ── 1. Salt + ephemeral ECDH anahtar çifti ──────────────────────────────
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const serverKeyPair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"]
    );

    // ── 2. Sunucu public key'ini raw format'a al ─────────────────────────────
    const serverPublicKeyRaw = new Uint8Array(
      await crypto.subtle.exportKey("raw", serverKeyPair.publicKey)
    );

    // ── 3. Alıcı (cihaz) public key'ini import et ────────────────────────────
    const clientPublicKeyBytes = base64UrlToUint8Array(sub.p256dh);
    const clientPublicKey = await crypto.subtle.importKey(
      "raw",
      clientPublicKeyBytes,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      []
    );

    // ── 4. ECDH shared secret ────────────────────────────────────────────────
    const sharedSecret = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: "ECDH", public: clientPublicKey },
        serverKeyPair.privateKey,
        256
      )
    );

    // ── 5. auth secret ───────────────────────────────────────────────────────
    const authSecret = base64UrlToUint8Array(sub.auth);

    // ── 6. HKDF — PRK (pseudorandom key) ────────────────────────────────────
    const hkdfKey = await crypto.subtle.importKey(
      "raw",
      sharedSecret,
      { name: "HKDF" },
      false,
      ["deriveBits"]
    );

    const prkInfo = new Uint8Array([
      ...new TextEncoder().encode("WebPush: info\x00"),
      ...clientPublicKeyBytes,
      ...serverPublicKeyRaw,
    ]);

    const prk = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "HKDF",
          hash: "SHA-256",
          salt: authSecret,
          info: prkInfo,
        },
        hkdfKey,
        256
      )
    );

    // ── 7. AES-GCM content encryption key + nonce ────────────────────────────
    const prkKey = await crypto.subtle.importKey("raw", prk, { name: "HKDF" }, false, [
      "deriveBits",
    ]);

    const cekInfo = new Uint8Array([
      ...new TextEncoder().encode("Content-Encoding: aes128gcm\x00"),
    ]);
    const nonceInfo = new Uint8Array([
      ...new TextEncoder().encode("Content-Encoding: nonce\x00"),
    ]);

    const cek = new Uint8Array(
      await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: cekInfo }, prkKey, 128)
    );
    const nonce = new Uint8Array(
      await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: nonceInfo }, prkKey, 96)
    );

    // ── 8. Payload şifrele (AES-128-GCM) ────────────────────────────────────
    const payloadStr = JSON.stringify(payload);
    // Padding: minimum 1 byte padding (0x02) + content
    const plaintext = new Uint8Array([
      ...new TextEncoder().encode(payloadStr),
      0x02, // delimiter
    ]);

    const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, [
      "encrypt",
    ]);
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, plaintext)
    );

    // ── 9. aes128gcm body: salt + rs (4 bytes BE) + keyid_len + server_pub + ciphertext ──
    const rs = new Uint8Array(4);
    new DataView(rs.buffer).setUint32(0, 4096, false); // record size
    const keyidLen = new Uint8Array([serverPublicKeyRaw.length]);

    const body = new Uint8Array([
      ...salt,
      ...rs,
      ...keyidLen,
      ...serverPublicKeyRaw,
      ...ciphertext,
    ]);

    // ── 10. VAPID Authorization ──────────────────────────────────────────────
    const authorization = await buildVapidAuthHeader(
      sub.endpoint,
      vapidPublicKey,
      vapidPrivateKey
    );

    // ── 11. HTTP POST ────────────────────────────────────────────────────────
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        Authorization: authorization,
        TTL: "86400",
      },
      body: body,
    });

    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ana handler
// ─────────────────────────────────────────────────────────────────────────────
Deno.serve(async (_req: Request): Promise<Response> => {
  // ── Ortam değişkenleri ───────────────────────────────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    return Response.json(
      { error: "SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY eksik." },
      { status: 500 }
    );
  }
  if (!vapidPublicKey || !vapidPrivateKey) {
    return Response.json(
      { error: "VAPID_PUBLIC_KEY veya VAPID_PRIVATE_KEY eksik." },
      { status: 500 }
    );
  }

  // ── Supabase admin istemcisi (RLS'yi atlar) ──────────────────────────────
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  // ── 1. Bildirim zamanı gelen, henüz bildirilmemiş görevleri bul ──────────
  const now = new Date().toISOString();

  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("id, title, note, priority, completed, due_date, reminder_time, is_notified, user_id")
    .eq("completed", false)
    .eq("is_notified", false)
    .or(
      `reminder_time.lte.${now},due_date.lte.${now}`
    )
    .not("reminder_time", "is", null);

  if (tasksError) {
    console.error("[task-reminder-service] Görev sorgulama hatası:", tasksError);
    return Response.json({ error: tasksError.message }, { status: 500 });
  }

  const pendingTasks = (tasks ?? []) as TaskRow[];

  if (pendingTasks.length === 0) {
    return Response.json({ sent: 0, message: "Bildirim gönderilecek görev yok." });
  }

  console.log(`[task-reminder-service] ${pendingTasks.length} görev için bildirim gönderiliyor...`);

  const results: Array<{
    taskId: string;
    title: string;
    pushResults: Array<{ endpoint: string; ok: boolean; status?: number; error?: string }>;
    marked: boolean;
  }> = [];

  // ── 2. Her görev için ilgili kullanıcının push aboneliklerini çek ─────────
  for (const task of pendingTasks) {
    let subsQuery = supabase
      .from("push_subscriptions")
      .select("id, user_id, device_label, endpoint, p256dh, auth");

    // Eğer görevin bir user_id'si varsa o kullanıcının cihazlarına gönder,
    // yoksa tüm kayıtlı abonelere gönder (geliştirme aşaması için)
    if (task.user_id) {
      subsQuery = subsQuery.eq("user_id", task.user_id);
    }

    const { data: subs, error: subsError } = await subsQuery;

    if (subsError) {
      console.error(`[task-reminder-service] Abonelik sorgulama hatası (görev: ${task.id}):`, subsError);
      results.push({ taskId: task.id, title: task.title, pushResults: [], marked: false });
      continue;
    }

    const subscriptions = (subs ?? []) as PushSubscriptionRow[];

    // ── 3. Her aboneliğe push bildirimi gönder ─────────────────────────────
    const pushResults: Array<{ endpoint: string; ok: boolean; status?: number; error?: string }> = [];

    for (const sub of subscriptions) {
      const notifPayload = {
        title: "⏰ Görev Zamanı Geldi!",
        body: task.title,
        icon: "/icons/icon-192x192.png",
        badge: "/icons/badge-72x72.png",
        tag: `task-${task.id}`,
        data: {
          taskId: task.id,
          priority: task.priority,
          url: "/",
        },
        actions: [
          { action: "complete", title: "✓ Tamamlandı" },
          { action: "dismiss", title: "Kapat" },
        ],
      };

      const result = await sendWebPush(sub, notifPayload, vapidPublicKey, vapidPrivateKey);
      pushResults.push({ endpoint: sub.endpoint.slice(0, 60) + "...", ...result });

      if (result.ok) {
        console.log(`[task-reminder-service] Bildirim gönderildi → ${sub.device_label} (${sub.endpoint.slice(0, 40)}...)`);
      } else {
        console.warn(`[task-reminder-service] Bildirim gönderilemedi → ${sub.device_label}:`, result.error ?? `HTTP ${result.status}`);
      }
    }

    // ── 4. Görevi is_notified = true olarak işaretle ──────────────────────
    const { error: updateError } = await supabase
      .from("tasks")
      .update({ is_notified: true })
      .eq("id", task.id);

    if (updateError) {
      console.error(`[task-reminder-service] is_notified güncellenemedi (görev: ${task.id}):`, updateError);
    }

    results.push({
      taskId: task.id,
      title: task.title,
      pushResults,
      marked: !updateError,
    });
  }

  const totalSent = results.reduce(
    (acc, r) => acc + r.pushResults.filter((p) => p.ok).length,
    0
  );

  return Response.json({
    sent: totalSent,
    tasks: results.length,
    detail: results,
  });
});
