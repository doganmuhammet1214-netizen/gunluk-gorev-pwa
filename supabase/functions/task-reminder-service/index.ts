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
//   3. Bu fonksiyon user_fcm_tokens tablosundan en güncel FCM token'ını çeker.
//   4. Firebase FCM HTTP v1 API ile TEKİL bildirim gönderir.
//   5. Görev is_notified = true olarak işaretlenir.
// ─────────────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface QStashPayload {
  taskId:        string;
  title:         string;
  priority?:     "low" | "medium" | "high";
  reminderTime?: string;
}

// ─── Google OAuth2 Access Token ──────────────────────────────────────────────

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
  const fullTitle = `⏰ ${priorityEmoji} Görev Zamanı Geldi!`;
  const notificationTag = `task-${taskId}`;

  // Çift bildirimi önlemek için:
  // FCM'de webpush.notification altında tag belirtiyoruz.
  // Ayrıca top-level notification yer alıyor.
  const message = {
    message: {
      token: fcmToken,
      notification: {
        title: fullTitle,
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
          tag:          notificationTag,
        },
      },
      webpush: {
        headers: {
          Urgency: "high",
          Topic:   notificationTag, // WebPush topic/tag ekleyerek tekilleştir
        },
        notification: {
          title:              fullTitle,
          body,
          icon:               "/icons/icon-192.png",
          badge:              "/icons/icon-192.png",
          tag:                notificationTag, // Aynı bildirim geldiğinde eskisinin üzerine yazar
          requireInteraction: priority === "high",
        },
        fcm_options: {
          link: "/",
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
  } catch {
    const recovered = cleaned.replace(/\\\\n/g, "\\n");
    try {
      parsed = JSON.parse(recovered);
    } catch (secondErr) {
      return { ok: false, error: `JSON parse hatası: ${(secondErr as Error).message}` };
    }
  }

  const { client_email, private_key } = parsed as Partial<ServiceAccount>;

  if (typeof client_email !== "string" || !client_email.includes("@")) {
    return { ok: false, error: "client_email geçersiz." };
  }

  if (typeof private_key !== "string" || !private_key.includes("BEGIN PRIVATE KEY")) {
    return { ok: false, error: "private_key geçersiz." };
  }

  return { ok: true, value: { client_email, private_key } };
}

// ─── Ana Handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return Response.json({ error: "Sadece POST" }, { status: 405, headers: CORS_HEADERS });
  }

  const supabaseUrl        = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const projectId          = Deno.env.get("FIREBASE_PROJECT_ID");
  const serviceAccountRaw  = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");

  if (!supabaseUrl || !supabaseServiceKey || !projectId || !serviceAccountRaw) {
    return Response.json({ error: "Ortam değişkenleri eksik." }, { status: 500, headers: CORS_HEADERS });
  }

  let payload: QStashPayload;
  try {
    payload = await req.json() as QStashPayload;
  } catch {
    return Response.json({ error: "Geçersiz JSON payload." }, { status: 400, headers: CORS_HEADERS });
  }

  const { taskId, title, priority = "medium" } = payload;

  if (!taskId || !title) {
    return Response.json({ error: "taskId ve title zorunludur." }, { status: 400, headers: CORS_HEADERS });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id, title, completed, is_notified, user_id")
    .eq("id", taskId)
    .single();

  if (taskError || !task) {
    return Response.json({ skipped: true, reason: "Görev bulunamadı." }, { headers: CORS_HEADERS });
  }

  if (task.completed || task.is_notified) {
    return Response.json({ skipped: true, reason: "Görev zaten bildirilmiş veya tamamlanmış." }, { headers: CORS_HEADERS });
  }

  const parseResult = cleanAndParseServiceAccount(serviceAccountRaw);
  if (!parseResult.ok) {
    return Response.json({ error: parseResult.error }, { status: 500, headers: CORS_HEADERS });
  }
  const serviceAccount = parseResult.value;

  let accessToken: string;
  try {
    accessToken = await getGoogleAccessToken(serviceAccount);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: CORS_HEADERS });
  }

  // ── Kullanıcının FCM token'larını çek ──────────────────────────────────
  // ÇİFT BİLDİRİM ÖNLEME:
  // Aynı kullanıcının veritabanında birden fazla token kaydı olabilir.
  // Yalnızca en son güncellenmiş (en güncel/aktif) 1 adet benzersiz FCM token'a gönderiyoruz.
  let tokenQuery = supabase
    .from("user_fcm_tokens")
    .select("id, fcm_token, device_label, updated_at")
    .order("updated_at", { ascending: false });

  if (task.user_id) {
    tokenQuery = tokenQuery.eq("user_id", task.user_id);
  }

  const { data: rawTokens, error: tokenError } = await tokenQuery;

  if (tokenError || !rawTokens || rawTokens.length === 0) {
    return Response.json({ skipped: true, reason: "Token bulunamadı." }, { headers: CORS_HEADERS });
  }

  // Benzersiz token listesi (aynı fcm_token tekrarlarını ve eski cihazları filtrele)
  // En son güncellenen token'lar öncelikli olur.
  const uniqueTokenMap = new Map<string, typeof rawTokens[0]>();
  for (const row of rawTokens) {
    if (!uniqueTokenMap.has(row.fcm_token)) {
      uniqueTokenMap.set(row.fcm_token, row);
    }
  }

  // Bildirim gönderilecek benzersiz token'lar
  // Tek bir cihaza 2 bildirim gitmesini engellemek için aynı fcm_token'a tek istek atılır.
  const tokens = Array.from(uniqueTokenMap.values());

  console.log(`[task-reminder-service] Gönderiliyor: ${tokens.length} benzersiz cihaz.`);

  const results = [];
  for (const tokenRow of tokens) {
    try {
      const result = await sendFCMNotification(
        tokenRow.fcm_token,
        projectId,
        accessToken,
        title,
        title,
        taskId,
        priority
      );
      results.push({ device: tokenRow.device_label ?? "Cihaz", ...result });
    } catch (err) {
      results.push({ device: tokenRow.device_label ?? "Cihaz", ok: false, error: String(err) });
    }
  }

  const successCount = results.filter((r) => r.ok).length;

  if (successCount > 0) {
    await supabase
      .from("tasks")
      .update({ is_notified: true })
      .eq("id", taskId);
  }

  return Response.json({
    taskId,
    title,
    sent: successCount,
    total: tokens.length,
    results,
  }, { headers: CORS_HEADERS });
});
