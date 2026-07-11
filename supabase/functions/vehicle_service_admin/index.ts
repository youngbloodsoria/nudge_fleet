const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ADMIN_PORTAL_KEY = Deno.env.get("ADMIN_PORTAL_KEY") ?? "";
const SCHEMA = "nudge_fleet";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-admin-key, content-type",
  "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
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

async function currentUserIsOwner(authorization: string) {
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/current_user_is_owner`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization,
      "accept-profile": SCHEMA,
      "content-profile": SCHEMA,
      "content-type": "application/json",
    },
    body: "{}",
  });
  if (!response.ok) return false;
  return await response.json().catch(() => false) === true;
}

async function requireReadAccess(request: Request) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return "Supabase service credentials are not configured.";
  if (ADMIN_PORTAL_KEY && request.headers.get("x-admin-key") === ADMIN_PORTAL_KEY) return null;

  const authorization = request.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return "Sign in to view service history.";
  if (!await currentUserIsOwner(authorization)) return "Not authorized for fleet dashboard.";
  return null;
}

function restHeaders(extra: HeadersInit = {}) {
  return {
    apikey: SERVICE_ROLE_KEY,
    authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    "accept-profile": SCHEMA,
    "content-profile": SCHEMA,
    "content-type": "application/json",
    ...extra,
  };
}

async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`, {
    ...init,
    headers: restHeaders(init.headers),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Supabase REST failed (${response.status})`);
  }
  return data;
}

async function getVehicleId(url: URL) {
  const requested = url.searchParams.get("vehicle_id");
  if (requested) return requested;
  const vehicles = await rest(
    "vehicles?select=id&or=(vin.eq.5TDDCRFH1GS019965,plate.eq.8AMP246,name.ilike.*Highlander*)&limit=1",
  );
  return vehicles?.[0]?.id ?? "";
}

async function readServiceModule(request: Request) {
  const url = new URL(request.url);
  const vehicleId = await getVehicleId(url);
  if (!vehicleId) return { vehicle: null, records: [], schedule: [], documents: [], incidents: [], totals: {} };

  const [
    vehicles,
    records,
    schedule,
    documents,
    logs,
  ] = await Promise.all([
    rest(`vehicles?select=*&id=eq.${vehicleId}&limit=1`),
    rest(`vehicle_service_records?select=*&vehicle_id=eq.${vehicleId}&order=service_date.desc,mileage.desc`),
    rest(`vehicle_maintenance_schedule?select=*&vehicle_id=eq.${vehicleId}&order=status.desc,next_due_mileage.asc,task_name.asc`),
    rest(`vehicle_service_documents?select=*&vehicle_id=eq.${vehicleId}&order=uploaded_at.desc`),
    rest(`vehicle_logs?select=id,vehicle_id,log_type,employee_name,mileage,notes,created_at&vehicle_id=eq.${vehicleId}&order=created_at.desc&limit=200`),
  ]);
  const logIds = logs.map((log: Record<string, string>) => log.id).filter(Boolean);
  const incidents = logIds.length
    ? await rest(`vehicle_incidents?select=*&log_id=in.(${logIds.join(",")})&order=created_at.desc`)
    : [];
  const logsById = new Map(logs.map((log: Record<string, unknown>) => [log.id, log]));
  const incidentDetails = incidents.map((incident: Record<string, unknown>) => ({
    ...incident,
    log: logsById.get(incident.log_id),
  }));

  const totals = records.reduce((acc: Record<string, number>, record: Record<string, number | null>) => {
    acc.customer_paid += Number(record.customer_paid || 0);
    acc.dealer_internal_paid += Number(record.dealer_internal_paid || 0);
    acc.warranty_paid += Number(record.warranty_paid || 0);
    acc.goodwill_paid += Number(record.goodwill_paid || 0);
    acc.ro_total += Number(record.ro_total || 0);
    return acc;
  }, {
    customer_paid: 0,
    dealer_internal_paid: 0,
    warranty_paid: 0,
    goodwill_paid: 0,
    ro_total: 0,
  });

  return {
    vehicle: vehicles?.[0] ?? null,
    records,
    schedule,
    documents,
    incidents: incidentDetails,
    totals,
  };
}

function cleanRecord(payload: Record<string, unknown>) {
  const allowed = [
    "vehicle_id",
    "service_date",
    "mileage",
    "vendor",
    "dealer_code",
    "ro_number",
    "ro_total",
    "customer_paid",
    "dealer_internal_paid",
    "warranty_paid",
    "goodwill_paid",
    "category",
    "service_title",
    "service_description",
    "parts_summary",
    "technician",
    "service_advisor",
    "pay_type",
    "source_document",
    "notes",
  ];
  return Object.fromEntries(
    allowed
      .filter((key) => payload[key] !== undefined)
      .map((key) => [key, payload[key]]),
  );
}

async function createRecord(request: Request) {
  const body = await request.json();
  const vehicleId = body.vehicle_id || await getVehicleId(new URL(request.url));
  if (!vehicleId) throw new Error("Vehicle is required.");
  if (!body.service_date) throw new Error("Service date is required.");
  if (!body.category) throw new Error("Category is required.");
  if (!body.service_title) throw new Error("Service title is required.");

  const payload = cleanRecord({ ...body, vehicle_id: vehicleId });
  const created = await rest("vehicle_service_records", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  return created?.[0] ?? created;
}

async function updateRecord(request: Request) {
  const body = await request.json();
  const id = body.id;
  if (!id) throw new Error("Record id is required.");

  const payload = cleanRecord(body);
  delete (payload as Record<string, unknown>).vehicle_id;
  const updated = await rest(`vehicle_service_records?id=eq.${id}`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  return updated?.[0] ?? updated;
}

async function markMaintenanceComplete(request: Request) {
  const body = await request.json();
  if (!body.id) throw new Error("Schedule id is required.");

  const lastCompletedMileage = body.last_completed_mileage === "" ? null : Number(body.last_completed_mileage);
  const lastCompletedDate = body.last_completed_date || new Date().toISOString().slice(0, 10);
  const currentMileage = optionalNumber(body.current_mileage);
  const nextDueMileage = body.interval_miles && lastCompletedMileage
    ? lastCompletedMileage + Number(body.interval_miles)
    : null;
  const nextDueDate = body.interval_months
    ? new Date(new Date(`${lastCompletedDate}T00:00:00Z`).setMonth(new Date(`${lastCompletedDate}T00:00:00Z`).getMonth() + Number(body.interval_months))).toISOString().slice(0, 10)
    : null;

  const updated = await rest(`vehicle_maintenance_schedule?id=eq.${body.id}`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      last_completed_mileage: lastCompletedMileage,
      last_completed_date: lastCompletedDate,
      next_due_mileage: nextDueMileage,
      next_due_date: nextDueDate,
      status: scheduleStatus(nextDueMileage, nextDueDate, currentMileage),
      notes: body.notes,
    }),
  });
  return updated?.[0] ?? updated;
}

function addMonths(dateValue: string, months: number) {
  const date = new Date(`${dateValue}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function scheduleStatus(nextDueMileage: number | null, nextDueDate: string | null, currentMileage: number | null) {
  const today = new Date();
  const dueDate = nextDueDate ? new Date(`${nextDueDate}T00:00:00Z`) : null;
  const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - today.getTime()) / 86400000) : null;
  const milesUntilDue = nextDueMileage !== null && currentMileage !== null ? nextDueMileage - currentMileage : null;

  if ((daysUntilDue !== null && daysUntilDue < 0) || (milesUntilDue !== null && milesUntilDue < 0)) return "overdue";
  if ((daysUntilDue !== null && daysUntilDue <= 14) || (milesUntilDue !== null && milesUntilDue <= 500)) return "due_soon";
  if (!nextDueMileage && !nextDueDate) return "needs_setup";
  return "ok";
}

function optionalNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

async function updateMaintenanceSchedule(request: Request) {
  const body = await request.json();
  if (!body.id) throw new Error("Schedule id is required.");

  const intervalMiles = optionalNumber(body.interval_miles);
  const intervalMonths = optionalNumber(body.interval_months);
  const lastCompletedMileage = optionalNumber(body.last_completed_mileage);
  const lastCompletedDate = body.last_completed_date || null;
  const currentMileage = optionalNumber(body.current_mileage);
  const nextDueMileage = intervalMiles && lastCompletedMileage ? lastCompletedMileage + intervalMiles : null;
  const nextDueDate = intervalMonths && lastCompletedDate ? addMonths(lastCompletedDate, intervalMonths) : null;

  const updated = await rest(`vehicle_maintenance_schedule?id=eq.${body.id}`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      interval_miles: intervalMiles,
      interval_months: intervalMonths,
      last_completed_mileage: lastCompletedMileage,
      last_completed_date: lastCompletedDate,
      next_due_mileage: nextDueMileage,
      next_due_date: nextDueDate,
      status: scheduleStatus(nextDueMileage, nextDueDate, currentMileage),
      notes: body.notes,
    }),
  });
  return updated?.[0] ?? updated;
}

async function resetMaintenanceSchedule(request: Request) {
  const body = await request.json();
  if (!body.id) throw new Error("Schedule id is required.");

  const updated = await rest(`vehicle_maintenance_schedule?id=eq.${body.id}`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      last_completed_mileage: null,
      last_completed_date: null,
      next_due_mileage: null,
      next_due_date: null,
      status: "needs_setup",
    }),
  });
  return updated?.[0] ?? updated;
}

async function resolveIncident(request: Request) {
  const body = await request.json();
  if (!body.id) throw new Error("Incident id is required.");

  const isResolved = body.is_resolved !== false;
  const updated = await rest(`vehicle_incidents?id=eq.${body.id}`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      is_resolved: isResolved,
      resolution_notes: body.resolution_notes || null,
      resolved_by: isResolved ? body.resolved_by || null : null,
      resolved_at: isResolved ? new Date().toISOString() : null,
    }),
  });
  return updated?.[0] ?? updated;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (request.method === "GET") {
      const readError = await requireReadAccess(request);
      if (readError) return json(401, { ok: false, error: readError });
      return json(200, { ok: true, data: await readServiceModule(request) });
    }
    const authError = requireAdmin(request);
    if (authError) return json(401, { ok: false, error: authError });

    if (request.method === "POST") {
      return json(200, { ok: true, data: await createRecord(request) });
    }
    if (request.method === "PATCH") {
      const url = new URL(request.url);
      if (url.searchParams.get("action") === "mark_complete") {
        return json(200, { ok: true, data: await markMaintenanceComplete(request) });
      }
      if (url.searchParams.get("action") === "update_schedule") {
        return json(200, { ok: true, data: await updateMaintenanceSchedule(request) });
      }
      if (url.searchParams.get("action") === "reset_schedule") {
        return json(200, { ok: true, data: await resetMaintenanceSchedule(request) });
      }
      if (url.searchParams.get("action") === "resolve_incident") {
        return json(200, { ok: true, data: await resolveIncident(request) });
      }
      return json(200, { ok: true, data: await updateRecord(request) });
    }
    return json(405, { ok: false, error: "Method not allowed." });
  } catch (error) {
    return json(400, { ok: false, error: error instanceof Error ? error.message : "Request failed." });
  }
});
