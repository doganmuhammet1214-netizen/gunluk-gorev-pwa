// @ts-nocheck — Deno Edge Runtime global'leri için
import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// task-reminder-service — Supabase Edge Function
//
// Tetikleyici: Upstash QStash (Not-Before zamanlamalı job)
// Akış:
//   1. Kullanıcı görev ekler → Frontend QStash'e "Upstash-Not-Before" ile POST.
//   2. Belirlenen Unix timestamp'e ulaşınca QStash bu endpoint'i çağırır.
//   3. Bu fonksiyon user_fcm_tokens tablosundan FCM token'larını çeker ve
//      Firebase FCM HTTP v1 API ile bildirim gönderir.
//   4. Görev is_notified = true olarak işaretlenir.
//
// Ortam değişkenleri (Supabase Dashboard > Edge Functions > Secrets):
//   SUPABASE_URL              - otomatik
//   SUPABASE_SERVICE_ROLE_KEY - otomatik
//   FIREBASE_PROJECT_ID       - Firebase project ID (gunluk-gorev)
//   FIREBASE_SERVICE_ACCOUNT  - Firebase service account JSON (minified)
// ─────────────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ─── Tipler ──────────────────────────────────────────────────────────────────

interface QStashPayload {
  taskId:        string;
  title:         string;
  priority?:     "low" | "medium" | "high";
  reminderTime?: string;
}

// ─── Google OAuth2 Access Token ──────────────────────────────────────────────

/**
 * Firebase service account'u kullanarak Google OAuth2 access token üretir.
 * FCM HTTP v1 API için gereklidir.
 */
async function getGoogleAccessToken(serviceAccount: {
  client_email: string;
  private_key:  string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header  = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss:   serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud:   "https://oauth2.googleapis.com/token",
    iat:   now,
    exp:   now + 3600,
  };

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

  const headerB64  = encode(header);
  const payloadB64 = encode(payload);
  const sigInput   = `${headerB64}.${payloadB64}`;

  // PEM private key'i DER formatına çevir
  const pemBody = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\n/g, "")
    .trim();
  const der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(sigInput)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const jwt = `${sigInput}.${sigB64}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwt,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Google OAuth2 token hatası (${tokenRes.status}): ${text}`);
  }

  const { access_token } = await tokenRes.json();
  return access_token as string;
}

// ─── FCM HTTP v1 API ile Bildirim Gönder ──────────────────────────────────────

async function sendFCMNotification(
  fcmToken:    string,
  projectId:   string,
  accessToken: string,
  title:       string,
  body:        string,
  taskId:      string,
  priority:    string
): Promise<{ ok: boolean; status: number; body: string }> {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const priorityEmoji = priority === "high" ? "🔴" : priority === "medium" ? "🟡" : "🟢";

  const message = {
    message: {
      token: fcmToken,
      notification: {
        title: `⏰ ${priorityEmoji} Görev Zamanı Geldi!`,
        body,
      },
      data: {
        type:     "task_reminder",
        taskId,
        priority,
        url:      "/",
        sentAt:   new Date().toISOString(),
      },
      android: {
        priority: "high",
        notification: {
          channel_id:   "flowday-reminders",
          sound:        "default",
          icon:         "ic_notification",
          click_action: "FLUTTER_NOTIFICATION_CLICK",
        },
      },
      webpush: {
        notification: {
          title:              `⏰ ${priorityEmoji} Görev Zamanı Geldi!`,
          body,
          icon:               "/icons/icon-192.png",
          badge:              "/icons/icon-192.png",
          requireInteraction: true,
          tag:                `task-${taskId}`,
        },
        fcm_options: {
          link: "/",
        },
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: `⏰ ${priorityEmoji} Görev Zamanı Geldi!`,
              body,
            },
            sound: "default",
            badge: 1,
          },
        },
      },
    },
  };

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify(message),
  });

  const resBody = await res.text();
  return { ok: res.ok, status: res.status, body: resBody };
}

// ─── Service Account Parse ────────────────────────────────────────────────────

type ServiceAccount = { client_email: string; private_key: string };
type ParseResult =
  | { ok: true;  value: ServiceAccount }
  | { ok: false; error: string };

function cleanAndParseServiceAccount(raw: string): ParseResult {
  if (!raw || raw.trim().length === 0) {
    return { ok: false, error: "FIREBASE_SERVICE_ACCOUNT boş." };
  }

  let cleaned = raw.trim();

  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1);
  }

  cleaned = cleaned.replace(/\\"/g, '"');

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch (firstErr) {
    const recovered = cleaned.replace(/\\\\n/g, "\\n");
    try {
      parsed = JSON.parse(recovered);
    } catch (secondErr) {
      const snippet = cleaned.slice(0, 80).replace(/\n/g, "\\n");
      return {
        ok: false,
        error:
          `FIREBASE_SERVICE_ACCOUNT geçerli JSON değil. ` +
          `İlk 80 karakter: ${snippet} | ` +
          `Hata: ${(firstErr as Error).message}`,
      };
    }
  }

  const { client_email, private_key } = parsed as Partial<ServiceAccount>;

  if (typeof client_email !== "string" || !client_email.includes("@")) {
    return {
      ok: false,
      error: `client_email geçersiz: ${JSON.stringify(client_email)}`,
    };
  }

  if (typeof private_key !== "string" || !private_key.includes("BEGIN PRIVATE KEY")) {
    return {
      ok: false,
      error: `private_key geçersiz (-----BEGIN PRIVATE KEY----- ile başlamalı).`,
    };
  }

  console.log("[task-reminder-service] ✅ Service account parse edildi:", client_email);
  return { ok: true, value: { client_email, private_key } };
}

// ─── Ana Handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return Response.json(
      { error: "Sadece POST destekleniyor." },
      { status: 405, headers: CORS_HEADERS }
    );
  }

  // ── Ortam değişkenleri ───────────────────────────────────────────────────
  const supabaseUrl        = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const projectId          = Deno.env.get("FIREBASE_PROJECT_ID");
  const serviceAccountRaw  = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("[task-reminder-service] Supabase ortam değişkenleri eksik!");
    return Response.json(
      { error: "Supabase ortam değişkenleri eksik." },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  if (!projectId || !serviceAccountRaw) {
    console.error("[task-reminder-service] FIREBASE_PROJECT_ID veya FIREBASE_SERVICE_ACCOUNT eksik!");
    return Response.json(
      { error: "Firebase ortam değişkenleri eksik. Supabase Dashboard > Edge Functions > Secrets kontrol edin." },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  // ── QStash Payload'ını ayrıştır ─────────────────────────────────────────
  let payload: QStashPayload;
  try {
    payload = await req.json() as QStashPayload;
  } catch {
    return Response.json(
      { error: "Geçersiz JSON payload." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { taskId, title, priority = "medium" } = payload;

  console.log(
    `[task-reminder-service] İstek alındı: taskId=${taskId}, title="${title}", priority=${priority}`
  );

  if (!taskId || !title) {
    return Response.json(
      { error: "taskId ve title zorunludur." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // ── Supabase admin istemcisi ────────────────────────────────────────────
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  // ── Görevi al (iptal / tamamlandı kontrolü) ─────────────────────────────
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id, title, completed, is_notified, user_id")
    .eq("id", taskId)
    .single();

  if (taskError || !task) {
    console.warn(`[task-reminder-service] Görev bulunamadı: ${taskId}`);
    return Response.json(
      { skipped: true, reason: "Görev bulunamadı." },
      { headers: CORS_HEADERS }
    );
  }

  // Görev tamamlandıysa ya da daha önce bildirilmişse atla
  if (task.completed || task.is_notified) {
    const reason = task.completed
      ? "Görev zaten tamamlandı."
      : "Bildirim zaten gönderildi.";
    console.log(`[task-reminder-service] Atlandı: ${reason}`);
    return Response.json(
      { skipped: true, reason },
      { headers: CORS_HEADERS }
    );
  }

  // ── Service account parse et ────────────────────────────────────────────
  const parseResult = cleanAndParseServiceAccount(serviceAccountRaw);
  if (!parseResult.ok) {
    console.error("[task-reminder-service] Service account parse hatası:", parseResult.error);
    return Response.json(
      { error: `Firebase yapılandırma hatası: ${parseResult.error}` },
      { status: 500, headers: CORS_HEADERS }
    );
  }
  const serviceAccount = parseResult.value;

  // ── Google Access Token al ──────────────────────────────────────────────
  let accessToken: string;
  try {
    accessToken = await getGoogleAccessToken(serviceAccount);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[task-reminder-service] Google OAuth2 hatası:", msg);
    return Response.json(
      { error: `Firebase auth hatası: ${msg}` },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  // ── Kullanıcının FCM token'larını çek ──────────────────────────────────
  let tokenQuery = supabase
    .from("user_fcm_tokens")
    .select("id, fcm_token, device_label, updated_at")
    .order("updated_at", { ascending: false })
    .limit(10);

  // Kullanıcı ID'si varsa sadece onun tokenlarını al
  if (task.user_id) {
    tokenQuery = tokenQuery.eq("user_id", task.user_id);
  }

  const { data: tokens, error: tokenError } = await tokenQuery;

  if (tokenError) {
    console.error("[task-reminder-service] FCM token sorgu hatası:", tokenError);
    return Response.json(
      { error: `Veritabanı hatası: ${tokenError.message}` },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  if (!tokens || tokens.length === 0) {
    console.warn(
      `[task-reminder-service] user_id=${task.user_id} için FCM token bulunamadı.`
    );
    return Response.json(
      {
        skipped: true,
        reason:  "Kayıtlı FCM token bulunamadı.",
        hint:    "user_fcm_tokens tablosunu kontrol edin.",
      },
      { headers: CORS_HEADERS }
    );
  }

  console.log(
    `[task-reminder-service] ${tokens.length} FCM token bulundu, bildirimler gönderiliyor...`
  );

  // ── Her token'a bildirim gönder ─────────────────────────────────────────
  const results: Array<{
    device:  string;
    ok:      boolean;
    status:  number;
    body:    string;
  }> = [];

  for (const tokenRow of tokens) {
    try {
      const result = await sendFCMNotification(
        tokenRow.fcm_token,
        projectId,
        accessToken,
        title,
        title, // body olarak aynı başlığı kullan
        taskId,
        priority
      );
      results.push({
        device: tokenRow.device_label ?? "Bilinmeyen Cihaz",
        ...result,
      });

      if (result.ok) {
        console.log(
          `[task-reminder-service] ✅ Gönderildi → ${tokenRow.device_label} (HTTP ${result.status})`
        );
      } else {
        console.warn(
          `[task-reminder-service] ❌ Gönderilemedi → ${tokenRow.device_label} (HTTP ${result.status}): ${result.body}`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[task-reminder-service] Hata → ${tokenRow.device_label}:`, msg);
      results.push({
        device: tokenRow.device_label ?? "Bilinmeyen",
        ok:     false,
        status: 0,
        body:   msg,
      });
    }
  }

  // ── Görevi is_notified = true olarak işaretle ───────────────────────────
  const successCount = results.filter((r) => r.ok).length;

  if (successCount > 0) {
    const { error: updateError } = await supabase
      .from("tasks")
      .update({ is_notified: true })
      .eq("id", taskId);

    if (updateError) {
      console.error("[task-reminder-service] is_notified güncellenemedi:", updateError);
    } else {
      console.log(`[task-reminder-service] ✅ is_notified = true → taskId=${taskId}`);
    }
  }

  const failCount = results.length - successCount;
  console.log(
    `[task-reminder-service] Sonuç: ${successCount} başarılı, ${failCount} başarısız.`
  );

  return Response.json(
    {
      taskId,
      title,
      sent:    successCount,
      failed:  failCount,
      total:   results.length,
      results,
    },
    { headers: CORS_HEADERS }
  );
});
