// @ts-nocheck — Deno Edge Runtime global'leri için
import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// send-test-notification — Supabase Edge Function
//
// Frontend'den direkt çağrılır (Authorization: Bearer <anon_key>).
// Akış:
//   1. Gelen JWT'den user_id çıkar (auth.uid()).
//   2. user_fcm_tokens tablosundan kullanıcının son FCM token'ını al.
//   3. Firebase FCM HTTP v1 API üzerinden test bildirimi gönder.
//
// Ortam değişkenleri (Supabase Dashboard > Edge Functions > Secrets):
//   SUPABASE_URL              - otomatik
//   SUPABASE_SERVICE_ROLE_KEY - otomatik
//   FIREBASE_PROJECT_ID       - Firebase project ID (gunluk-gorev)
//   FIREBASE_SERVICE_ACCOUNT  - Firebase service account JSON (tek satır stringify)
// ─────────────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ─── Google OAuth2 Access Token Al ───────────────────────────────────────────

/**
 * Firebase service account'u kullanarak Google OAuth2 access token üretir.
 * FCM HTTP v1 API için gereklidir.
 */
async function getGoogleAccessToken(serviceAccount: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
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

  // Google OAuth2 token endpoint'e JWT ile access token iste
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
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
  fcmToken: string,
  projectId: string,
  accessToken: string
): Promise<{ ok: boolean; status: number; body: string }> {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const message = {
    message: {
      token: fcmToken,
      notification: {
        title: "🔔 FlowDay Test Bildirimi",
        body:  "Bu bir test bildirimidir. FCM altyapısı çalışıyor! ✅",
      },
      data: {
        type:     "test",
        url:      "/",
        sentAt:   new Date().toISOString(),
      },
      // Android-specific
      android: {
        priority: "high",
        notification: {
          channel_id: "flowday-reminders",
          sound:      "default",
          icon:       "ic_notification",
        },
      },
      // Web/PWA-specific (FCM web push)
      webpush: {
        notification: {
          title: "🔔 FlowDay Test Bildirimi",
          body:  "Bu bir test bildirimidir. FCM altyapısı çalışıyor! ✅",
          icon:  "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          requireInteraction: true,
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

  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
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

  // ── Ortam değişkenlerini al ───────────────────────────────────────────────
  const supabaseUrl        = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const projectId          = Deno.env.get("FIREBASE_PROJECT_ID");
  const serviceAccountRaw  = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");

  if (!projectId || !serviceAccountRaw) {
    console.error("[send-test-notification] FIREBASE_PROJECT_ID veya FIREBASE_SERVICE_ACCOUNT eksik!");
    return Response.json(
      { error: "Sunucu yapılandırma hatası: Firebase ortam değişkenleri eksik. Supabase Dashboard > Edge Functions > Secrets bölümünü kontrol edin." },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  // ── Kullanıcıyı JWT'den doğrula ──────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const anonKey    = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  // Kullanıcı kimliğini doğrulamak için user-scoped client kullan
  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { persistSession: false },
  });

  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();

  if (authError || !user) {
    console.error("[send-test-notification] Kimlik doğrulama hatası:", authError?.message);
    return Response.json(
      { error: "Kimlik doğrulama başarısız. Lütfen tekrar giriş yapın." },
      { status: 401, headers: CORS_HEADERS }
    );
  }

  console.log(`[send-test-notification] Test bildirimi isteği: user_id=${user.id}`);

  // ── Service account JSON'u parse et ─────────────────────────────────────
  let serviceAccount: { client_email: string; private_key: string };
  try {
    serviceAccount = JSON.parse(serviceAccountRaw);
  } catch {
    console.error("[send-test-notification] FIREBASE_SERVICE_ACCOUNT geçerli JSON değil!");
    return Response.json(
      { error: "Sunucu yapılandırma hatası: FIREBASE_SERVICE_ACCOUNT geçerli JSON formatında değil." },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  // ── Kullanıcının FCM token'larını çek ───────────────────────────────────
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  const { data: tokens, error: tokenError } = await supabaseAdmin
    .from("user_fcm_tokens")
    .select("id, fcm_token, device_label, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(5);

  if (tokenError) {
    console.error("[send-test-notification] Token sorgu hatası:", tokenError);
    return Response.json(
      { error: `Veritabanı hatası: ${tokenError.message}` },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  if (!tokens || tokens.length === 0) {
    console.warn(`[send-test-notification] user_id=${user.id} için FCM token bulunamadı.`);
    return Response.json(
      {
        error: "Bu kullanıcıya ait kayıtlı FCM token bulunamadı. Uygulamada bildirim iznini etkinleştirdiğinizden emin olun.",
        hint:  "user_fcm_tokens tablosunu kontrol edin.",
      },
      { status: 404, headers: CORS_HEADERS }
    );
  }

  console.log(`[send-test-notification] ${tokens.length} token bulundu, bildirim gönderiliyor...`);

  // ── Google Access Token al ───────────────────────────────────────────────
  let accessToken: string;
  try {
    accessToken = await getGoogleAccessToken(serviceAccount);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[send-test-notification] Google OAuth2 hatası:", msg);
    return Response.json(
      { error: `Firebase kimlik doğrulama hatası: ${msg}` },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  // ── Her token'a bildirim gönder ──────────────────────────────────────────
  const results: Array<{
    device: string;
    ok:     boolean;
    status: number;
    body:   string;
  }> = [];

  for (const tokenRow of tokens) {
    try {
      const result = await sendFCMNotification(tokenRow.fcm_token, projectId, accessToken);
      results.push({ device: tokenRow.device_label ?? "Bilinmeyen Cihaz", ...result });

      if (result.ok) {
        console.log(`[send-test-notification] ✅ Gönderildi → ${tokenRow.device_label} (HTTP ${result.status})`);
      } else {
        console.warn(`[send-test-notification] ❌ Gönderilemedi → ${tokenRow.device_label} (HTTP ${result.status}): ${result.body}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[send-test-notification] Hata → ${tokenRow.device_label}:`, msg);
      results.push({ device: tokenRow.device_label ?? "Bilinmeyen", ok: false, status: 0, body: msg });
    }
  }

  const successCount = results.filter((r) => r.ok).length;
  const failCount    = results.length - successCount;

  console.log(`[send-test-notification] Sonuç: ${successCount} başarılı, ${failCount} başarısız.`);

  return Response.json(
    {
      success:      successCount > 0,
      sent:         successCount,
      failed:       failCount,
      total:        results.length,
      results,
    },
    { status: successCount > 0 ? 200 : 500, headers: CORS_HEADERS }
  );
});
