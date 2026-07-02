const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ADMIN_PORTAL_KEY = Deno.env.get("ADMIN_PORTAL_KEY") ?? "";
const SCHEMA = "nudge_fleet";
const BUCKET = Deno.env.get("SERVICE_DOCUMENT_BUCKET") ?? "service-documents";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-admin-key, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function requireAdmin(request: Request) {
  if (!ADMIN_PORTAL_KEY) return "ADMIN_PORTAL_KEY is not configured.";
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return "Supabase service credentials are not configured.";
  if (request.headers.get("x-admin-key") !== ADMIN_PORTAL_KEY) return "Invalid admin key.";
  return null;
}

function headers(extra: HeadersInit = {}) {
  return {
    apikey: SERVICE_ROLE_KEY,
    authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...headers({
        "accept-profile": SCHEMA,
        "content-profile": SCHEMA,
        "content-type": "application/json",
      }),
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Supabase REST failed (${response.status})`);
  }
  return data;
}

function safeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "document";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { ok: false, error: "Method not allowed." });

  const authError = requireAdmin(request);
  if (authError) return json(401, { ok: false, error: authError });

  try {
    const form = await request.formData();
    const file = form.get("file");
    const vehicleId = String(form.get("vehicle_id") || "");
    const serviceRecordId = String(form.get("service_record_id") || "");
    const pageNumber = form.get("page_number") ? Number(form.get("page_number")) : null;
    const documentType = String(form.get("document_type") || "service_history_page");

    if (!(file instanceof File)) throw new Error("A file field is required.");
    if (!vehicleId) throw new Error("vehicle_id is required.");

    const storagePath = `${vehicleId}/${Date.now()}-${safeName(file.name)}`;
    const uploadResponse = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/${BUCKET}/${storagePath}`, {
      method: "POST",
      headers: headers({
        "content-type": file.type || "application/octet-stream",
        "x-upsert": "true",
      }),
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Storage upload failed (${uploadResponse.status}): ${await uploadResponse.text()}`);
    }

    const rows = await rest("vehicle_service_documents", {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        vehicle_id: vehicleId,
        service_record_id: serviceRecordId || null,
        storage_path: storagePath,
        document_type: documentType,
        page_number: pageNumber,
      }),
    });

    return json(200, { ok: true, data: rows?.[0] ?? rows });
  } catch (error) {
    return json(400, { ok: false, error: error instanceof Error ? error.message : "Upload failed." });
  }
});
