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
  chartSummary: document.getElementById("chartSummary"),
  dailyMileageChart: document.getElementById("dailyMileageChart"),
  dailyChartSummary: document.getElementById("dailyChartSummary"),
  serviceForecastRows: document.getElementById("serviceForecastRows"),
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

function fmtShortDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

function sortedMileageLogs(logs) {
  return [...logs]
    .map((row) => ({
      ...row,
      mileage: Number(row.mileage || 0),
      at: new Date(row.created_at),
    }))
    .filter((row) => row.mileage > 0 && !Number.isNaN(row.at.getTime()))
    .sort((a, b) => a.at - b.at);
}

function usageRate(logs) {
  const sorted = sortedMileageLogs(logs);
  if (sorted.length < 2) return null;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const days = Math.max((last.at - first.at) / 86400000, 1);
  const miles = Math.max(last.mileage - first.mileage, 0);
  if (!miles) return null;
  return {
    milesPerDay: miles / days,
    miles,
    days,
    latestMileage: last.mileage,
    latestDate: last.at,
  };
}

function predictionForMaintenance(item, rate) {
  if (!rate) return { label: "Need more mileage history", date: null, days: null };

  const predictions = [];
  if (item.due_mileage && rate.latestMileage) {
    const milesRemaining = Number(item.due_mileage) - rate.latestMileage;
    const days = Math.max(milesRemaining / rate.milesPerDay, 0);
    const date = new Date(rate.latestDate.getTime() + days * 86400000);
    predictions.push({ date, days, label: `${fmtDate(date)} by mileage` });
  }
  if (item.due_date) {
    const date = new Date(`${item.due_date}T00:00:00`);
    const days = Math.max((date - new Date()) / 86400000, 0);
    predictions.push({ date, days, label: `${fmtDate(date)} by date` });
  }
  if (!predictions.length) return { label: "Add service history", date: null, days: null };

  predictions.sort((a, b) => a.date - b.date);
  const next = predictions[0];
  const roundedDays = Math.round(next.days);
  const when = roundedDays <= 0 ? "now" : `in ${roundedDays} days`;
  return { ...next, label: `${next.label} (${when})` };
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

  const rate = usageRate(logs);
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
  renderDailyMileageChart(logs, rate);
  renderMaintenanceRunway(logs, maintenance, rate);
  renderServiceForecast(maintenance, rate);
  renderAlerts(vehicleId, maintenance);
  renderDrivers(drivers);
  renderMaintenance(maintenance, rate);
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

function dailyMileage(logs) {
  const deltas = mileageDeltas(logs);
  const byDate = new Map();
  deltas.forEach((row) => {
    const key = row.created_at.slice(0, 10);
    byDate.set(key, (byDate.get(key) || 0) + row.delta);
  });
  return [...byDate.entries()]
    .map(([date, miles]) => ({ date, miles, at: new Date(`${date}T00:00:00`) }))
    .sort((a, b) => a.at - b.at);
}

function renderDailyMileageChart(logs, rate) {
  const days = dailyMileage(logs);
  if (!days.length) {
    els.dailyChartSummary.innerHTML = "";
    els.dailyMileageChart.innerHTML = '<div class="empty">No daily mileage data in this range.</div>';
    return;
  }

  const width = 760;
  const height = 250;
  const margin = { top: 18, right: 18, bottom: 36, left: 64 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxMiles = Math.max(...days.map((day) => day.miles), 1);
  const minTime = days[0].at.getTime();
  const maxTime = days[days.length - 1].at.getTime();
  const span = Math.max(maxTime - minTime, 1);
  const x = (time) => margin.left + ((time - minTime) / span) * plotWidth;
  const y = (miles) => margin.top + (1 - miles / maxMiles) * plotHeight;
  const barWidth = Math.max(Math.min(plotWidth / Math.max(days.length, 1) - 3, 18), 5);
  const ticks = Array.from({ length: 5 }, (_, index) => (maxMiles / 4) * index);
  const dateTicks = [days[0], days[Math.floor(days.length / 2)], days[days.length - 1]];

  els.dailyChartSummary.innerHTML = `
    <span>${fmtNumber(days.length)} driving days in range</span>
    <span>${rate ? `${fmtNumber(Math.round(rate.milesPerDay))} miles/day pace` : ""}</span>
  `;

  els.dailyMileageChart.innerHTML = `
    <svg class="mileage-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily miles driven">
      ${ticks.map((tick) => `
        <g>
          <line class="chart-grid" x1="${margin.left}" y1="${y(tick).toFixed(1)}" x2="${width - margin.right}" y2="${y(tick).toFixed(1)}"></line>
          <text class="chart-axis-label" x="${margin.left - 10}" y="${(y(tick) + 4).toFixed(1)}" text-anchor="end">${fmtNumber(Math.round(tick))}</text>
        </g>
      `).join("")}
      ${dateTicks.map((day) => `
        <text class="chart-axis-label" x="${x(day.at.getTime()).toFixed(1)}" y="${height - 10}" text-anchor="middle">${fmtShortDate(day.at)}</text>
      `).join("")}
      ${days.map((day) => {
        const barHeight = Math.max(plotHeight - (y(day.miles) - margin.top), 3);
        const barX = x(day.at.getTime()) - barWidth / 2;
        const barY = margin.top + plotHeight - barHeight;
        return `
          <rect class="daily-bar" x="${barX.toFixed(1)}" y="${barY.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="3">
            <title>${fmtDate(day.at)} · ${fmtNumber(day.miles)} miles</title>
          </rect>
        `;
      }).join("")}
      <text class="chart-axis-title" x="14" y="${margin.top}" transform="rotate(-90 14 ${margin.top})">Miles/day</text>
    </svg>
  `;
}

function renderMaintenanceRunway(logs, maintenance, rate) {
  const mileageLogs = sortedMileageLogs(logs);
  if (mileageLogs.length < 2 || !rate) {
    els.chartSummary.innerHTML = "";
    els.mileageChart.innerHTML = '<div class="empty">Need more mileage history to project the next 12 months.</div>';
    return;
  }

  const runwayDays = 365;
  const runwayEnd = new Date(rate.latestDate.getTime() + runwayDays * 86400000);
  const projectedEndMileage = rate.latestMileage + rate.milesPerDay * runwayDays;
  const forecastItems = maintenance
    .map((item) => ({ item, prediction: predictionForMaintenance(item, rate) }))
    .filter((entry) => entry.prediction.date && entry.prediction.date <= runwayEnd)
    .sort((a, b) => a.prediction.date - b.prediction.date);
  const values = [rate.latestMileage, projectedEndMileage, ...forecastItems.map((entry) => Number(entry.item.due_mileage || rate.latestMileage))];
  const minMileage = Math.min(...values);
  const maxMileage = Math.max(...values);
  const padding = Math.max(Math.round((maxMileage - minMileage) * 0.1), 250);
  const yMin = Math.max(0, minMileage - padding);
  const yMax = maxMileage + padding;
  const minTime = rate.latestDate.getTime();
  const maxTime = runwayEnd.getTime();
  const width = 760;
  const height = 280;
  const margin = { top: 18, right: 24, bottom: 38, left: 72 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const span = Math.max(maxTime - minTime, 1);
  const x = (time) => margin.left + ((time - minTime) / span) * plotWidth;
  const y = (mileage) => margin.top + (1 - ((mileage - yMin) / (yMax - yMin || 1))) * plotHeight;
  const projectionPoints = Array.from({ length: 13 }, (_, index) => {
    const day = (runwayDays / 12) * index;
    const time = rate.latestDate.getTime() + day * 86400000;
    const mileage = rate.latestMileage + rate.milesPerDay * day;
    return `${x(time).toFixed(1)},${y(mileage).toFixed(1)}`;
  }).join(" ");
  const ticks = Array.from({ length: 5 }, (_, index) => yMin + ((yMax - yMin) / 4) * index);
  const dateTicks = [
    { at: rate.latestDate },
    { at: new Date(rate.latestDate.getTime() + 182 * 86400000) },
    { at: runwayEnd },
  ];

  els.chartSummary.innerHTML = `
    <span>12-month runway</span>
    <span>${fmtNumber(Math.round(rate.milesPerDay * 365))} projected miles/year</span>
    <span>${forecastItems.length ? `${forecastItems.length} service markers` : "No service projected in next 12 months"}</span>
  `;

  els.mileageChart.innerHTML = `
    <svg class="mileage-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Projected mileage and maintenance over next 12 months">
      ${ticks.map((tick) => `
        <g>
          <line class="chart-grid" x1="${margin.left}" y1="${y(tick).toFixed(1)}" x2="${width - margin.right}" y2="${y(tick).toFixed(1)}"></line>
          <text class="chart-axis-label" x="${margin.left - 10}" y="${(y(tick) + 4).toFixed(1)}" text-anchor="end">${fmtNumber(Math.round(tick))}</text>
        </g>
      `).join("")}
      ${dateTicks.map((row) => `
        <text class="chart-axis-label" x="${x(row.at.getTime()).toFixed(1)}" y="${height - 10}" text-anchor="middle">${fmtShortDate(row.at)}</text>
      `).join("")}
      <polyline class="runway-line" points="${projectionPoints}"></polyline>
      ${forecastItems.map(({ item, prediction }) => `
        <g>
          <line class="service-marker-line" x1="${x(prediction.date.getTime()).toFixed(1)}" y1="${margin.top}" x2="${x(prediction.date.getTime()).toFixed(1)}" y2="${height - margin.bottom}"></line>
          <circle class="service-marker ${item.status}" cx="${x(prediction.date.getTime()).toFixed(1)}" cy="${y(Number(item.due_mileage || rate.latestMileage)).toFixed(1)}" r="5">
            <title>${item.service_name} · ${prediction.label}</title>
          </circle>
          <text class="service-marker-label" x="${x(prediction.date.getTime()).toFixed(1)}" y="${(y(Number(item.due_mileage || rate.latestMileage)) - 10).toFixed(1)}" text-anchor="middle">${item.service_name.split(" ")[0]}</text>
        </g>
      `).join("")}
      <text class="chart-axis-title" x="14" y="${margin.top}" transform="rotate(-90 14 ${margin.top})">Mileage</text>
    </svg>
  `;
}

function renderServiceForecast(maintenance, rate) {
  const forecast = maintenance
    .map((item) => ({ item, prediction: predictionForMaintenance(item, rate) }))
    .sort((a, b) => {
      if (a.item.status !== b.item.status) {
        const order = { due: 1, soon: 2, no_history: 3, ok: 4 };
        return (order[a.item.status] || 5) - (order[b.item.status] || 5);
      }
      if (a.prediction.date && b.prediction.date) return a.prediction.date - b.prediction.date;
      if (a.prediction.date) return -1;
      if (b.prediction.date) return 1;
      return a.item.service_name.localeCompare(b.item.service_name);
    })
    .slice(0, 8);

  els.serviceForecastRows.innerHTML = cardsOrEmpty(forecast.map(({ item, prediction }) => {
    const due = [
      item.due_mileage ? `${fmtNumber(item.due_mileage)} mi` : "",
      item.due_date ? fmtDate(item.due_date) : "",
    ].filter(Boolean).join(" / ") || "Add service history";
    return `
      <article class="forecast-item">
        <div>
          <div class="alert-title">${item.service_name}</div>
          <div class="subtle">Due: ${due}</div>
          <div class="subtle">Forecast: ${prediction.label}</div>
        </div>
        <span class="pill ${item.status}">${String(item.status || "ok").replace("_", " ")}</span>
      </article>
    `;
  }).join(""));
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

function renderMaintenance(maintenance, rate) {
  els.maintenanceRows.innerHTML = rowsOrEmpty(maintenance.map((row) => {
    const due = [
      row.due_mileage ? `${fmtNumber(row.due_mileage)} mi` : "",
      row.due_date ? fmtDate(row.due_date) : "",
    ].filter(Boolean).join(" / ") || "Add service history";
    const prediction = predictionForMaintenance(row, rate);
    return `
      <tr>
        <td>${row.service_name}</td>
        <td><span class="pill ${row.status}">${String(row.status || "ok").replace("_", " ")}</span></td>
        <td>${due}</td>
        <td>${prediction.label}</td>
      </tr>
    `;
  }).join(""), 4);
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
