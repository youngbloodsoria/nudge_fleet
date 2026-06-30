import { configIsReady, loadAppConfig } from "./config.js";

const SCHEMA = "nudge_fleet";

const els = {
  configWarning: document.getElementById("configWarning"),
  authPanel: document.getElementById("authPanel"),
  appPanel: document.getElementById("appPanel"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  authStatus: document.getElementById("authStatus"),
  dashboardStatus: document.getElementById("dashboardStatus"),
  signInBtn: document.getElementById("signInBtn"),
  magicLinkBtn: document.getElementById("magicLinkBtn"),
  signOutBtn: document.getElementById("signOutBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  vehicleSelect: document.getElementById("vehicleSelect"),
  rangeSelect: document.getElementById("rangeSelect"),
  currentMileage: document.getElementById("currentMileage"),
  logCount: document.getElementById("logCount"),
  rangeMiles: document.getElementById("rangeMiles"),
  attentionCount: document.getElementById("attentionCount"),
  averageUseMiles: document.getElementById("averageUseMiles"),
  recentUseMiles: document.getElementById("recentUseMiles"),
  incidentCount: document.getElementById("incidentCount"),
  checkoutCount: document.getElementById("checkoutCount"),
  latestStatus: document.getElementById("latestStatus"),
  mileageChart: document.getElementById("mileageChart"),
  driverRows: document.getElementById("driverRows"),
  maintenanceRows: document.getElementById("maintenanceRows"),
  alertRows: document.getElementById("alertRows"),
  maintenanceAlertRows: document.getElementById("maintenanceAlertRows"),
  incidentRows: document.getElementById("incidentRows"),
  recentRows: document.getElementById("recentRows"),
};

const state = {
  supabase: null,
  session: null,
  summary: null,
};

function setStatus(element, message, isBad = false) {
  element.textContent = message;
  element.className = "status" + (isBad ? " bad" : "");
}

function fmtNumber(value) {
  if (value === null || value === undefined || value === "") return "-";
  return Number(value).toLocaleString();
}

function fmtDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function rangeDays() {
  const value = els.rangeSelect.value;
  return value === "all" ? null : Number(value);
}

function selectedVehicleId() {
  return els.vehicleSelect.value || state.summary?.vehicles?.[0]?.id || "";
}

function rowsOrEmpty(rows, columns) {
  return rows || `<tr><td colspan="${columns}" class="empty">No data yet.</td></tr>`;
}

function cardsOrEmpty(cards) {
  return cards || '<div class="empty">Nothing needs attention.</div>';
}

function mileageDeltas(logs) {
  return [...logs]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map((row, index, sorted) => {
      if (index === 0) return null;
      const previous = Number(sorted[index - 1].mileage || 0);
      const current = Number(row.mileage || 0);
      const delta = current - previous;
      return delta > 0 ? { ...row, delta } : null;
    })
    .filter(Boolean);
}

async function initialize() {
  const config = await loadAppConfig();
  if (!configIsReady(config)) {
    els.configWarning.hidden = false;
    setStatus(els.authStatus, "Vercel needs SUPABASE_ANON_KEY before owner login can work.", true);
    return;
  }

  state.supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    db: { schema: SCHEMA },
    auth: { persistSession: true, autoRefreshToken: true },
  });

  const { data } = await state.supabase.auth.getSession();
  state.session = data.session;
  renderAuthState();

  state.supabase.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    renderAuthState();
    if (session) loadDashboard().catch((error) => setStatus(els.dashboardStatus, error.message, true));
  });

  if (state.session) {
    await loadDashboard();
  }
}

function renderAuthState() {
  const signedIn = Boolean(state.session);
  els.authPanel.hidden = signedIn;
  els.appPanel.hidden = !signedIn;
  els.signOutBtn.hidden = !signedIn;
  els.refreshBtn.hidden = !signedIn;
}

async function signInWithPassword() {
  setStatus(els.authStatus, "Signing in...");
  const email = els.email.value.trim();
  const password = els.password.value;
  const { error } = await state.supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

async function sendMagicLink() {
  setStatus(els.authStatus, "Sending magic link...");
  const email = els.email.value.trim();
  const { error } = await state.supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: new URL("dashboard.html", location.href).toString() },
  });
  if (error) throw error;
  setStatus(els.authStatus, "Magic link sent. Check your email.");
}

async function loadDashboard() {
  if (!state.session) return;
  setStatus(els.dashboardStatus, "Loading dashboard...");

  const { data, error } = await state.supabase.rpc("fleet_dashboard_summary", {
    range_days: rangeDays(),
  });
  if (error) throw error;

  state.summary = data || {};
  renderVehicleOptions();
  renderDashboard();
  setStatus(els.dashboardStatus, "Dashboard updated.");
}

function renderVehicleOptions() {
  const current = selectedVehicleId();
  els.vehicleSelect.innerHTML = (state.summary.vehicles || []).map((vehicle) => {
    const label = [vehicle.name, vehicle.plate].filter(Boolean).join(" - ") || vehicle.id;
    return `<option value="${vehicle.id}">${label}</option>`;
  }).join("");
  if (current) els.vehicleSelect.value = current;
}

function renderDashboard() {
  const vehicleId = selectedVehicleId();
  const logs = (state.summary.logs || []).filter((row) => row.vehicle_id === vehicleId);
  const latest = (state.summary.latest || []).find((row) => row.vehicle_id === vehicleId) || {};
  const daily = (state.summary.daily || []).filter((row) => row.vehicle_id === vehicleId);
  const drivers = (state.summary.drivers || []).filter((row) => row.vehicle_id === vehicleId);
  const maintenance = (state.summary.maintenance || []).filter((row) => row.vehicle_id === vehicleId);
  const incidents = (state.summary.incidents || []).filter((row) => row.vehicle_id === vehicleId);

  const deltas = mileageDeltas(logs);
  const estimatedMiles = deltas.reduce((total, row) => total + row.delta, 0);
  const averageUseMiles = deltas.length ? estimatedMiles / deltas.length : 0;
  const recentUseMiles = deltas[deltas.length - 1]?.delta || 0;
  const checkoutCount = logs.filter((row) => row.log_type === "checkout").length;
  const incidentCount = incidents.reduce((total, row) => total + Number(row.incident_count || 0), 0);
  const attention = maintenance.filter((row) => ["due", "soon", "no_history"].includes(row.status)).length + incidents.length;

  els.currentMileage.textContent = fmtNumber(latest.last_mileage);
  els.logCount.textContent = fmtNumber(logs.length);
  els.rangeMiles.textContent = fmtNumber(Math.max(estimatedMiles, 0));
  els.attentionCount.textContent = fmtNumber(attention);
  els.averageUseMiles.textContent = fmtNumber(Math.round(averageUseMiles));
  els.recentUseMiles.textContent = fmtNumber(recentUseMiles);
  els.incidentCount.textContent = fmtNumber(incidentCount);
  els.checkoutCount.textContent = fmtNumber(checkoutCount);

  renderLatest(latest);
  renderChart(daily);
  renderAlerts(vehicleId, maintenance);
  renderDrivers(drivers);
  renderMaintenance(maintenance);
  renderIncidents(incidents);
  renderRecent(logs);
}

async function markAlertReviewed(alertId) {
  const { error } = await state.supabase.rpc("mark_alert_reviewed", { alert_id: alertId });
  if (error) throw error;
  await loadDashboard();
}

function renderAlerts(vehicleId, maintenance) {
  const alerts = (state.summary.alerts || []).filter((row) => !row.vehicle_id || row.vehicle_id === vehicleId);
  const maintenanceAttention = maintenance.filter((row) => ["due", "soon", "no_history"].includes(row.status));

  els.alertRows.innerHTML = cardsOrEmpty(alerts.slice(0, 12).map((alert) => {
    const payload = alert.payload || {};
    const action = payload.log_type === "return" ? "Checked back in" : "Checked out";
    const statusClass = alert.status === "failed" ? "due" : "soon";
    return `
      <article class="alert-item">
        <div>
          <div class="alert-title">${action}: ${payload.employee_name || "Driver"}</div>
          <div class="subtle">${payload.vehicle || ""}</div>
          <div class="subtle">${fmtDateTime(alert.created_at)} · ${fmtNumber(payload.mileage)} mi</div>
          ${payload.notes ? `<div class="alert-note">${payload.notes}</div>` : ""}
        </div>
        <div class="alert-actions">
          <span class="pill ${statusClass}">${alert.status}</span>
          ${alert.status === "pending" ? `<button class="secondary compact" data-alert-id="${alert.id}" type="button">Reviewed</button>` : ""}
        </div>
      </article>
    `;
  }).join(""));

  els.maintenanceAlertRows.innerHTML = cardsOrEmpty(maintenanceAttention.map((item) => {
    const due = [
      item.due_mileage ? `${fmtNumber(item.due_mileage)} mi` : "",
      item.due_date ? fmtDate(item.due_date) : "",
    ].filter(Boolean).join(" / ") || "Add service history";
    return `
      <article class="alert-item">
        <div>
          <div class="alert-title">${item.service_name}</div>
          <div class="subtle">${item.vehicle_name || ""}</div>
          <div class="subtle">Due: ${due}</div>
        </div>
        <span class="pill ${item.status}">${String(item.status || "ok").replace("_", " ")}</span>
      </article>
    `;
  }).join(""));
}

function renderLatest(latest) {
  els.latestStatus.innerHTML = [
    ["Vehicle", [latest.name, latest.plate].filter(Boolean).join(" - ")],
    ["Last action", latest.last_log_type],
    ["Last driver", latest.last_employee_name],
    ["Last mileage", fmtNumber(latest.last_mileage)],
    ["Last seen", fmtDate(latest.last_seen_at)],
    ["Notes", latest.last_notes || "-"],
  ].map(([label, value]) => `<tr><th>${label}</th><td>${value || "-"}</td></tr>`).join("");
}

function renderChart(daily) {
  if (!daily.length) {
    els.mileageChart.innerHTML = '<div class="empty">No mileage data in this range.</div>';
    return;
  }

  const maxMiles = Math.max(...daily.map((row) => Number(row.estimated_miles || 0)), 1);
  els.mileageChart.innerHTML = daily.slice(-31).map((row) => {
    const miles = Number(row.estimated_miles || 0);
    const height = Math.max((miles / maxMiles) * 190, 3);
    const date = new Date(`${row.usage_date}T00:00:00`);
    const label = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `
      <div class="bar-wrap" title="${label}: ${fmtNumber(miles)} miles">
        <div class="bar" style="height:${height}px"></div>
        <div class="bar-label">${label}</div>
      </div>
    `;
  }).join("");
}

function renderDrivers(drivers) {
  els.driverRows.innerHTML = rowsOrEmpty(drivers.slice(0, 12).map((row) => `
    <tr>
      <td>${row.employee_name || "-"}</td>
      <td>${fmtNumber(row.log_count)}</td>
      <td>${fmtNumber(row.checkout_count)}</td>
      <td>${fmtNumber(row.return_count)}</td>
      <td>${fmtDate(row.last_log_at)}</td>
    </tr>
  `).join(""), 5);
}

function renderMaintenance(maintenance) {
  els.maintenanceRows.innerHTML = rowsOrEmpty(maintenance.map((row) => {
    const due = [
      row.due_mileage ? `${fmtNumber(row.due_mileage)} mi` : "",
      row.due_date ? fmtDate(row.due_date) : "",
    ].filter(Boolean).join(" / ") || "Add service history";
    return `
      <tr>
        <td>${row.service_name}</td>
        <td><span class="pill ${row.status}">${String(row.status || "ok").replace("_", " ")}</span></td>
        <td>${due}</td>
      </tr>
    `;
  }).join(""), 3);
}

function renderIncidents(incidents) {
  els.incidentRows.innerHTML = rowsOrEmpty(incidents.map((row) => `
    <tr>
      <td>${row.incident_type || "-"}</td>
      <td>${row.severity || "-"}</td>
      <td>${fmtNumber(row.incident_count)}</td>
      <td>${fmtDate(row.last_incident_at)}</td>
    </tr>
  `).join(""), 4);
}

function renderRecent(logs) {
  els.recentRows.innerHTML = rowsOrEmpty(logs.slice(0, 30).map((row) => `
    <tr>
      <td>${fmtDate(row.created_at)}</td>
      <td>${row.log_type || "-"}</td>
      <td>${row.employee_name || "-"}</td>
      <td>${fmtNumber(row.mileage)}</td>
      <td>${row.notes || ""}</td>
    </tr>
  `).join(""), 5);
}

els.signInBtn.addEventListener("click", () => {
  signInWithPassword().catch((error) => setStatus(els.authStatus, error.message, true));
});

els.magicLinkBtn.addEventListener("click", () => {
  sendMagicLink().catch((error) => setStatus(els.authStatus, error.message, true));
});

els.signOutBtn.addEventListener("click", async () => {
  await state.supabase.auth.signOut();
  state.summary = null;
  setStatus(els.authStatus, "Signed out.");
});

els.refreshBtn.addEventListener("click", () => {
  loadDashboard().catch((error) => setStatus(els.dashboardStatus, error.message, true));
});

els.alertRows.addEventListener("click", (event) => {
  const button = event.target.closest("[data-alert-id]");
  if (!button) return;
  button.disabled = true;
  markAlertReviewed(button.dataset.alertId).catch((error) => setStatus(els.dashboardStatus, error.message, true));
});

els.vehicleSelect.addEventListener("change", renderDashboard);
els.rangeSelect.addEventListener("change", () => {
  loadDashboard().catch((error) => setStatus(els.dashboardStatus, error.message, true));
});

initialize().catch((error) => setStatus(els.authStatus, error.message, true));
