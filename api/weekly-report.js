const DEFAULT_SUPABASE_URL = "https://zdspapaigdywpbfwwzfb.supabase.co";
const SCHEMA = "nudge_fleet";

function env(name, fallback = "") {
  return process.env[name] || fallback;
}

function sendJson(response, status, payload) {
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.status(status).json(payload);
}

function bearerToken(request) {
  const auth = request.headers.authorization || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

function parseEmailAddress(value, defaultName = "") {
  const trimmed = String(value || "").trim();
  const match = trimmed.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) {
    return {
      email: match[2].trim(),
      name: match[1].trim() || defaultName,
    };
  }
  return { email: trimmed, name: defaultName };
}

function supabaseUrl() {
  return env("SUPABASE_URL", DEFAULT_SUPABASE_URL).replace(/\/$/, "");
}

function appBaseUrl(request) {
  const configured = env("APP_BASE_URL").replace(/\/$/, "");
  if (configured) return configured;
  const host = request.headers["x-forwarded-host"] || request.headers.host || "";
  const proto = request.headers["x-forwarded-proto"] || "https";
  return host ? `${proto}://${host}` : "";
}

async function verifyOwnerToken(token) {
  const anonKey = env("SUPABASE_ANON_KEY");
  if (!token || !anonKey) return false;

  const response = await fetch(`${supabaseUrl()}/rest/v1/rpc/current_user_is_owner`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${token}`,
      "content-profile": SCHEMA,
      "accept-profile": SCHEMA,
      "content-type": "application/json",
    },
    body: "{}",
  });

  if (!response.ok) return false;
  return Boolean(await response.json());
}

async function isAuthorized(request) {
  const token = bearerToken(request);
  const reportSecret = env("WEEKLY_REPORT_SECRET", env("CRON_SECRET"));
  if (reportSecret && token === reportSecret) return true;
  return verifyOwnerToken(token);
}

async function sendEmail(request) {
  const apiKey = env("SENDGRID_API_KEY");
  const toEmail = env("WEEKLY_REPORT_TO_EMAIL", env("ALERT_TO_EMAIL", "alex.soria@skyrun.com"));
  const fromEmail = env("WEEKLY_REPORT_FROM_EMAIL", env("ALERT_FROM_EMAIL"));
  if (!apiKey) throw new Error("Missing SENDGRID_API_KEY.");
  if (!fromEmail) throw new Error("Missing WEEKLY_REPORT_FROM_EMAIL.");

  const dashboardUrl = `${appBaseUrl(request)}/dashboard.html`;
  const subject = "Nudge Fleet weekly report is ready";
  const text = [
    "Your Nudge Fleet weekly report is ready.",
    "",
    `Open the owner dashboard: ${dashboardUrl}`,
    "",
    "For privacy, the report details stay behind the dashboard login.",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.45">
      <h1 style="margin:0 0 8px">Nudge Fleet weekly report is ready</h1>
      <p style="margin:0 0 18px;color:#344054">Open the owner dashboard to review mileage, maintenance, services, and incidents.</p>
      <p style="margin:0 0 18px">
        <a href="${dashboardUrl}" style="display:inline-block;background:#126c5a;color:#fff;text-decoration:none;padding:12px 16px;border-radius:8px;font-weight:700">
          Open Owner Dashboard
        </a>
      </p>
      <p style="margin:0;color:#667085;font-size:13px">For privacy, report details stay behind the dashboard login.</p>
    </div>
  `;

  const payload = {
    personalizations: [{ to: [parseEmailAddress(toEmail)] }],
    from: parseEmailAddress(fromEmail, "Nudge Fleet"),
    subject,
    content: [
      { type: "text/plain", value: text },
      { type: "text/html", value: html },
    ],
  };

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`SendGrid failed (${response.status}): ${message}`);
  }
}

module.exports = async function handler(request, response) {
  if (request.method !== "GET" && request.method !== "POST") {
    response.setHeader("allow", "GET, POST");
    return sendJson(response, 405, { ok: false, error: "Method not allowed" });
  }

  if (!(await isAuthorized(request))) {
    return sendJson(response, 401, { ok: false, error: "Not authorized" });
  }

  try {
    const dryRun = request.query?.dry_run === "1";
    if (!dryRun) await sendEmail(request);
    return sendJson(response, 200, { ok: true, sent: !dryRun, dryRun });
  } catch (error) {
    return sendJson(response, 500, { ok: false, error: error.message || "Weekly report email failed" });
  }
};
