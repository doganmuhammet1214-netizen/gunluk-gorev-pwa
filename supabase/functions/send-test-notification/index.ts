// @ts-nocheck — Deno Edge Runtime global'leri için
import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// send-test-notification — Supabase Edge Function
// ─────────────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

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

async function sendFCMNotification(
  fcmToken: string,
  projectId: string,
  accessToken: string
): Promise<{ ok: boolean; status: number; body: string }> {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const notificationTag = "test-notification";

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
      android: {
        priority: "high",
        notification: {
          channel_id: "flowday-reminders",
          sound:      "default",
          tag:        notificationTag,
        },
      },
      webpush: {
        headers: {
          Urgency: "high",
          Topic:   notificationTag,
        },
        notification: {
          title:              "🔔 FlowDay Test Bildirimi",
          body:               "Bu bir test bildirimidir. FCM altyapısı çalışıyor! ✅",
          icon:               "/icons/icon-192.png",
          badge:              "/icons/icon-192.png",
          tag:                notificationTag,
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

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return Response.json(
      { error: "Sadece POST destekleniyor." },
      { status: 405, headers: CORS_HEADERS }
    );
  }

  const supabaseUrl        = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const projectId          = Deno.env.get("FIREBASE_PROJECT_ID");
  const serviceAccountRaw  = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");

  if (!projectId || !serviceAccountRaw) {
    return Response.json(
      { error: "Firebase ortam değişkenleri eksik." },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const anonKey    = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { persistSession: false },
  });

  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();

  if (authError || !user) {
    return Response.json(
      { error: "Kimlik doğrulama başarısız." },
      { status: 401, headers: CORS_HEADERS }
    );
  }

  const parseResult = cleanAndParseServiceAccount(serviceAccountRaw);
  if (!parseResult.ok) {
    return Response.json(
      { error: `Service account hatası: ${parseResult.error}` },
      { status: 500, headers: CORS_HEADERS }
    );
  }
  const serviceAccount = parseResult.value;

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  // TEKİL TOKEN KULLANIMI: Çift bildirimi önlemek için benzersiz token'lar çekilir
  const { data: rawTokens, error: tokenError } = await supabaseAdmin
    .from("user_fcm_tokens")
    .select("id, fcm_token, device_label, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (tokenError || !rawTokens || rawTokens.length === 0) {
    return Response.json(
      { error: "Kullanıcıya ait kayıtlı FCM token bulunamadı." },
      { status: 404, headers: CORS_HEADERS }
    );
  }

  // Benzersiz token map (aynı token tekrarlarını engelle)
  const uniqueTokenMap = new Map<string, typeof rawTokens[0]>();
  for (const row of rawTokens) {
    if (!uniqueTokenMap.has(row.fcm_token)) {
      uniqueTokenMap.set(row.fcm_token, row);
    }
  }

  const tokens = Array.from(uniqueTokenMap.values());

  let accessToken: string;
  try {
    accessToken = await getGoogleAccessToken(serviceAccount);
  } catch (err) {
    return Response.json(
      { error: `Google OAuth2 hatası: ${String(err)}` },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  const results = [];
  for (const tokenRow of tokens) {
    try {
      const result = await sendFCMNotification(tokenRow.fcm_token, projectId, accessToken);
      results.push({ device: tokenRow.device_label ?? "Cihaz", ...result });
    } catch (err) {
      results.push({ device: tokenRow.device_label ?? "Cihaz", ok: false, status: 0, body: String(err) });
    }
  }

  const successCount = results.filter((r) => r.ok).length;

  return Response.json(
    {
      success: successCount > 0,
      sent:    successCount,
      failed:  results.length - successCount,
      total:   results.length,
      results,
    },
    { status: successCount > 0 ? 200 : 500, headers: CORS_HEADERS }
  );
});
