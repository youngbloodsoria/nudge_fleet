import { configIsReady, loadAppConfig } from "./config.js";

const SCHEMA = "nudge_fleet";
const VISIBLE_LIMIT = {
  maintenance: 6,
  logs: 5,
  services: 3,
};

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
  openServiceBtn: document.getElementById("openServiceBtn"),
  closeServiceBtn: document.getElementById("closeServiceBtn"),
  serviceModal: document.getElementById("serviceModal"),
  vehicleSelect: document.getElementById("vehicleSelect"),
  rangeSelect: document.getElementById("rangeSelect"),
  currentVehicleLabel: document.getElementById("currentVehicleLabel"),
  currentStatusBadge: document.getElementById("currentStatusBadge"),
  currentStatusDriver: document.getElementById("currentStatusDriver"),
  currentStatusAction: document.getElementById("currentStatusAction"),
  currentStatusDate: document.getElementById("currentStatusDate"),
  currentStatusMileage: document.getElementById("currentStatusMileage"),
  glanceRows: document.getElementById("glanceRows"),
  maintenanceCards: document.getElementById("maintenanceCards"),
  metricTiles: document.getElementById("metricTiles"),
  mileageChart: document.getElementById("mileageChart"),
  chartSummary: document.getElementById("chartSummary"),
  dailyMileageChart: document.getElementById("dailyMileageChart"),
  dailyChartSummary: document.getElementById("dailyChartSummary"),
  serviceName: document.getElementById("serviceName"),
  serviceMileage: document.getElementById("serviceMileage"),
  serviceDate: document.getElementById("serviceDate"),
  servicePerformedBy: document.getElementById("servicePerformedBy"),
  serviceCost: document.getElementById("serviceCost"),
  serviceNotes: document.getElementById("serviceNotes"),
  saveServiceBtn: document.getElementById("saveServiceBtn"),
  serviceStatus: document.getElementById("serviceStatus"),
  serviceHistoryRows: document.getElementById("serviceHistoryRows"),
  serviceAdminKey: document.getElementById("serviceAdminKey"),
  saveServiceAdminKeyBtn: document.getElementById("saveServiceAdminKeyBtn"),
  refreshServiceHistoryBtn: document.getElementById("refreshServiceHistoryBtn"),
  serviceHistoryStatus: document.getElementById("serviceHistoryStatus"),
  historyCurrentMileage: document.getElementById("historyCurrentMileage"),
  historyCustomerPaid: document.getElementById("historyCustomerPaid"),
  historyDealerPaid: document.getElementById("historyDealerPaid"),
  historyRecordCount: document.getElementById("historyRecordCount"),
  historyDateFrom: document.getElementById("historyDateFrom"),
  historyDateTo: document.getElementById("historyDateTo"),
  historyMileageMin: document.getElementById("historyMileageMin"),
  historyMileageMax: document.getElementById("historyMileageMax"),
  historyCategory: document.getElementById("historyCategory"),
  historyVendor: document.getElementById("historyVendor"),
  historyRo: document.getElementById("historyRo"),
  clearHistoryFiltersBtn: document.getElementById("clearHistoryFiltersBtn"),
  serviceTimelineRows: document.getElementById("serviceTimelineRows"),
  historyScheduleRows: document.getElementById("historyScheduleRows"),
  serviceRecordForm: document.getElementById("serviceRecordForm"),
  serviceRecordFormTitle: document.getElementById("serviceRecordFormTitle"),
  serviceRecordId: document.getElementById("serviceRecordId"),
  recordServiceDate: document.getElementById("recordServiceDate"),
  recordMileage: document.getElementById("recordMileage"),
  recordRoNumber: document.getElementById("recordRoNumber"),
  recordCategory: document.getElementById("recordCategory"),
  recordServiceTitle: document.getElementById("recordServiceTitle"),
  recordVendor: document.getElementById("recordVendor"),
  recordCustomerPaid: document.getElementById("recordCustomerPaid"),
  recordNotes: document.getElementById("recordNotes"),
  saveServiceRecordBtn: document.getElementById("saveServiceRecordBtn"),
  resetServiceRecordBtn: document.getElementById("resetServiceRecordBtn"),
  serviceDocumentFile: document.getElementById("serviceDocumentFile"),
  uploadServiceDocumentBtn: document.getElementById("uploadServiceDocumentBtn"),
  incidentSummary: document.getElementById("incidentSummary"),
  recentRows: document.getElementById("recentRows"),
  toggleMaintenanceBtn: document.getElementById("toggleMaintenanceBtn"),
  toggleLogsBtn: document.getElementById("toggleLogsBtn"),
  toggleServicesBtn: document.getElementById("toggleServicesBtn"),
  toggleIncidentsBtn: document.getElementById("toggleIncidentsBtn"),
};

const state = {
  supabase: null,
  session: null,
  config: null,
  summary: null,
  serviceModule: null,
  loadingServiceHistory: false,
  expanded: {
    maintenance: false,
    logs: false,
    services: false,
    incidents: false,
  },
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(element, message, isBad = false) {
  element.textContent = message;
  element.className = "status" + (isBad ? " bad" : "");
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "-";
  return Number(value).toLocaleString();
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === "") return "-";
  return Number(value).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatMileage(value) {
  if (value === null || value === undefined || value === "") return "-";
  return `${formatNumber(value)} mi`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatShortDate(value) {
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

function selectedVehicleLatest() {
  return (state.summary?.latest || []).find((row) => row.vehicle_id === selectedVehicleId()) || {};
}

function selectedVehicleMileage() {
  return state.serviceModule?.vehicle?.current_mileage || selectedVehicleLatest().last_mileage || "";
}

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function cardsOrEmpty(cards, message = "No data yet.") {
  return cards || `<div class="empty">${message}</div>`;
}

function getMaintenanceStatusClass(status) {
  const normalized = String(status || "ok");
  if (normalized === "due") return "due";
  if (normalized === "soon") return "soon";
  if (normalized === "no_history") return "setup";
  return "ok";
}

function maintenanceStatusLabel(status) {
  const labels = {
    due: "overdue",
    soon: "due soon",
    no_history: "needs setup",
    ok: "ok",
  };
  return labels[status] || "ok";
}

function normalizeScheduleStatus(status) {
  const normalized = String(status || "ok");
  if (normalized === "overdue") return "due";
  if (normalized === "due_soon") return "soon";
  if (normalized === "needs_setup") return "no_history";
  return normalized;
}

function normalizeMaintenanceItem(item) {
  return {
    ...item,
    service_name: item.service_name || item.task_name || "Service",
    due_mileage: item.due_mileage ?? item.next_due_mileage ?? null,
    due_date: item.due_date ?? item.next_due_date ?? null,
    status: normalizeScheduleStatus(item.status),
  };
}

function activeMaintenanceItems(fallbackMaintenance) {
  const serviceSchedule = state.serviceModule?.schedule || [];
  const source = serviceSchedule.length ? serviceSchedule : fallbackMaintenance;
  return source.map(normalizeMaintenanceItem);
}

function sortMaintenanceByUrgency(items) {
  const order = { due: 1, soon: 2, no_history: 3, ok: 4 };
  return [...items].sort((a, b) => {
    const statusDelta = (order[a.status] || 5) - (order[b.status] || 5);
    if (statusDelta) return statusDelta;
    const aDate = a.due_date ? new Date(`${a.due_date}T00:00:00`).getTime() : Number.POSITIVE_INFINITY;
    const bDate = b.due_date ? new Date(`${b.due_date}T00:00:00`).getTime() : Number.POSITIVE_INFINITY;
    const aMiles = a.miles_remaining ?? Number.POSITIVE_INFINITY;
    const bMiles = b.miles_remaining ?? Number.POSITIVE_INFINITY;
    return Math.min(aDate, aMiles) - Math.min(bDate, bMiles);
  });
}

function summarizeCurrentStatus(latest) {
  const action = String(latest.last_log_type || "").toLowerCase();
  const checkedOut = action === "checkout";
  return {
    label: checkedOut ? "Checked Out" : "Returned",
    className: checkedOut ? "soon" : "ok",
    actionLabel: action ? action.replace("-", " ") : "-",
  };
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

function dailyMileage(logs) {
  const byDate = new Map();
  mileageDeltas(logs).forEach((row) => {
    const key = row.created_at.slice(0, 10);
    byDate.set(key, (byDate.get(key) || 0) + row.delta);
  });
  return [...byDate.entries()]
    .map(([date, miles]) => ({ date, miles, at: new Date(`${date}T00:00:00`) }))
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
    predictions.push({ date, days, label: `${formatDate(date)} by mileage` });
  }
  if (item.due_date) {
    const date = new Date(`${item.due_date}T00:00:00`);
    const days = Math.max((date - new Date()) / 86400000, 0);
    predictions.push({ date, days, label: `${formatDate(date)} by date` });
  }
  if (!predictions.length) return { label: "Add service history", date: null, days: null };

  predictions.sort((a, b) => a.date - b.date);
  const next = predictions[0];
  const roundedDays = Math.round(next.days);
  const when = roundedDays <= 0 ? "now" : `in ${roundedDays} days`;
  return { ...next, label: `${next.label} (${when})` };
}

function milesRemaining(item, latestMileage) {
  if (!item.due_mileage || !latestMileage) return null;
  return Number(item.due_mileage) - Number(latestMileage);
}

function daysRemaining(item) {
  if (!item.due_date) return null;
  return Math.ceil((new Date(`${item.due_date}T00:00:00`) - new Date()) / 86400000);
}

async function initialize() {
  const config = await loadAppConfig();
  state.config = config;
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
  els.serviceAdminKey.value = localStorage.getItem("nudgeFleet.adminKey") || "";
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
  els.openServiceBtn.hidden = !signedIn;
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
  setStatus(els.dashboardStatus, `Dashboard updated: ${formatDateTime(new Date())}`);
}

function renderVehicleOptions() {
  const current = selectedVehicleId();
  els.vehicleSelect.innerHTML = (state.summary.vehicles || []).map((vehicle) => {
    const label = [vehicle.name, vehicle.plate].filter(Boolean).join(" - ") || vehicle.id;
    return `<option value="${escapeHtml(vehicle.id)}">${escapeHtml(label)}</option>`;
  }).join("");
  if (current) els.vehicleSelect.value = current;
}

function renderDashboard() {
  const vehicleId = selectedVehicleId();
  const logs = (state.summary.logs || []).filter((row) => row.vehicle_id === vehicleId);
  const latest = (state.summary.latest || []).find((row) => row.vehicle_id === vehicleId) || {};
  const maintenance = (state.summary.maintenance || []).filter((row) => row.vehicle_id === vehicleId);
  const incidents = (state.summary.incidents || []).filter((row) => row.vehicle_id === vehicleId);
  const rate = usageRate(logs);
  const deltas = mileageDeltas(logs);
  const daily = dailyMileage(logs);
  const estimatedMiles = deltas.reduce((total, row) => total + row.delta, 0);
  const checkoutCount = logs.filter((row) => row.log_type === "checkout").length;
  const returnCount = logs.filter((row) => row.log_type === "return").length;
  const incidentCount = incidents.reduce((total, row) => total + Number(row.incident_count || 0), 0);
  const maxDailyMiles = daily.length ? Math.max(...daily.map((row) => row.miles)) : 0;
  const serviceModuleMatches = state.serviceModule?.vehicle?.id === vehicleId;
  const serviceRecords = serviceModuleMatches ? state.serviceModule?.records || [] : [];
  const activeMaintenance = serviceModuleMatches ? activeMaintenanceItems(maintenance) : maintenance.map(normalizeMaintenanceItem);

  renderCurrentStatus(latest);
  renderAtGlance(activeMaintenance, incidents, rate);
  renderMetrics({ estimatedMiles, logs, checkoutCount, returnCount, incidentCount, rate, maxDailyMiles });
  renderMaintenanceCards(activeMaintenance, latest, rate);
  renderDailyMileageChart(daily, rate);
  renderMaintenanceRunway(logs, activeMaintenance, rate);
  renderServiceForm(vehicleId, latest, activeMaintenance);
  renderServiceHistory(
    serviceRecords,
    serviceModuleMatches ? "No service records returned from Supabase." : "Loading service records...",
  );
  renderIncidentSummary(incidents);
  renderRecent(logs);
  if (!serviceModuleMatches && !state.loadingServiceHistory) {
    loadServiceHistory().catch((error) => setStatus(els.serviceHistoryStatus, error.message, true));
  }
}

function renderCurrentStatus(latest) {
  const status = summarizeCurrentStatus(latest);
  const vehicleLabel = [latest.name, latest.plate].filter(Boolean).join(" - ") || "Selected vehicle";
  els.currentVehicleLabel.textContent = vehicleLabel;
  els.currentStatusBadge.className = `pill ${status.className}`;
  els.currentStatusBadge.textContent = status.label;
  els.currentStatusDriver.textContent = latest.last_employee_name || "-";
  els.currentStatusAction.textContent = status.actionLabel === "-" ? "-" : status.actionLabel;
  els.currentStatusDate.textContent = formatDateTime(latest.last_seen_at);
  els.currentStatusMileage.textContent = formatMileage(latest.last_mileage);
}

function renderAtGlance(maintenance, incidents, rate) {
  const incidentCount = incidents.reduce((total, row) => total + Number(row.incident_count || 0), 0);
  const urgentMaintenance = sortMaintenanceByUrgency(maintenance)
    .filter((item) => ["due", "soon", "no_history"].includes(item.status));
  const nextService = sortMaintenanceByUrgency(maintenance)[0];
  const nextPrediction = nextService ? predictionForMaintenance(nextService, rate) : null;
  const rows = [
    {
      tone: incidentCount ? "bad" : "ok",
      title: incidentCount ? `${formatNumber(incidentCount)} open incident${incidentCount === 1 ? "" : "s"}` : "No open incidents",
      detail: incidentCount ? "Review incident summary" : "All clear",
    },
    {
      tone: urgentMaintenance.length ? "soon" : "ok",
      title: urgentMaintenance.length ? `${urgentMaintenance.length} maintenance item${urgentMaintenance.length === 1 ? "" : "s"} need attention` : "No urgent maintenance",
      detail: urgentMaintenance.length ? maintenanceStatusLabel(urgentMaintenance[0].status) : "Nothing due soon",
    },
    {
      tone: "info",
      title: nextService ? "Next service due" : "Maintenance schedule",
      detail: nextService ? `${nextService.service_name}: ${nextPrediction.label}` : "Add maintenance records to begin forecasting",
    },
    {
      tone: "info",
      title: "Data current",
      detail: formatDateTime(new Date()),
    },
  ];

  els.glanceRows.innerHTML = rows.map((row) => `
    <article class="glance-item">
      <span class="glance-icon ${row.tone}"></span>
      <div>
        <strong>${escapeHtml(row.title)}</strong>
        <span>${escapeHtml(row.detail)}</span>
      </div>
    </article>
  `).join("");
}

function renderMetrics({ estimatedMiles, logs, checkoutCount, returnCount, incidentCount, rate, maxDailyMiles }) {
  const metrics = [
    ["Miles Driven", formatNumber(Math.max(estimatedMiles, 0)), "MI"],
    ["Logs", formatNumber(logs.length), "LOG"],
    ["Check-outs", formatNumber(checkoutCount), "OUT"],
    ["Returns", formatNumber(returnCount), "IN"],
    ["Incidents", formatNumber(incidentCount), "INC"],
    ["Avg Miles / Day", rate ? formatNumber(Math.round(rate.milesPerDay)) : "-", "AVG"],
    ["Most Miles in a Day", formatNumber(maxDailyMiles), "MAX"],
  ];

  els.metricTiles.innerHTML = metrics.map(([label, value, icon]) => `
    <article class="metric-tile">
      <span class="metric-icon">${icon}</span>
      <div>
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    </article>
  `).join("");
}

function renderMaintenanceCards(maintenance, latest, rate) {
  const sorted = sortMaintenanceByUrgency(maintenance);
  const visible = state.expanded.maintenance ? sorted : sorted.slice(0, VISIBLE_LIMIT.maintenance);
  els.toggleMaintenanceBtn.hidden = sorted.length <= VISIBLE_LIMIT.maintenance;
  els.toggleMaintenanceBtn.textContent = state.expanded.maintenance ? "Show Less" : "View All Maintenance";
  els.maintenanceCards.innerHTML = cardsOrEmpty(visible.map((item) => {
    const statusClass = getMaintenanceStatusClass(item.status);
    const miles = milesRemaining(item, latest.last_mileage);
    const days = daysRemaining(item);
    const interval = [
      item.interval_miles ? `${formatNumber(item.interval_miles)} mi` : "",
      item.interval_months ? `${formatNumber(item.interval_months)} mo` : "",
    ].filter(Boolean).join(" / ") || "Needs setup";
    const prediction = predictionForMaintenance(item, rate);
    return `
      <article class="maintenance-card ${statusClass}">
        <span class="maintenance-status-dot"></span>
        <div>
          <strong>${escapeHtml(item.service_name || "Service")}</strong>
          <span>${escapeHtml(interval)}</span>
          <small>Forecast: ${escapeHtml(prediction.label)}</small>
        </div>
        <div>
          <strong>${miles === null ? "-" : formatMileage(miles)}</strong>
          <span>remaining</span>
        </div>
        <div>
          <strong>${days === null ? "-" : `${formatNumber(Math.max(days, 0))} days`}</strong>
          <span>remaining</span>
        </div>
        <span class="pill ${statusClass}">${maintenanceStatusLabel(item.status)}</span>
      </article>
    `;
  }).join(""), "No maintenance schedule yet.");
}

function renderDailyMileageChart(days, rate) {
  if (!days.length) {
    els.dailyChartSummary.innerHTML = "";
    els.dailyMileageChart.innerHTML = '<div class="empty">No daily mileage data in this range.</div>';
    return;
  }

  const width = 760;
  const height = 250;
  const margin = { top: 18, right: 18, bottom: 36, left: 58 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxMiles = Math.max(...days.map((day) => day.miles), 1);
  const minTime = days[0].at.getTime();
  const maxTime = days[days.length - 1].at.getTime();
  const span = Math.max(maxTime - minTime, 1);
  const x = (time) => margin.left + ((time - minTime) / span) * plotWidth;
  const y = (miles) => margin.top + (1 - miles / maxMiles) * plotHeight;
  const barWidth = Math.max(Math.min(plotWidth / Math.max(days.length, 1) - 3, 16), 4);
  const ticks = Array.from({ length: 5 }, (_, index) => (maxMiles / 4) * index);
  const dateTicks = [days[0], days[Math.floor(days.length / 2)], days[days.length - 1]];

  els.dailyChartSummary.innerHTML = `
    <span>${formatNumber(days.length)} driving days</span>
    <span>${rate ? `${formatNumber(Math.round(rate.milesPerDay))} miles/day pace` : "Need more data"}</span>
  `;

  els.dailyMileageChart.innerHTML = `
    <svg class="mileage-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily miles driven">
      ${ticks.map((tick) => `
        <g>
          <line class="chart-grid" x1="${margin.left}" y1="${y(tick).toFixed(1)}" x2="${width - margin.right}" y2="${y(tick).toFixed(1)}"></line>
          <text class="chart-axis-label" x="${margin.left - 10}" y="${(y(tick) + 4).toFixed(1)}" text-anchor="end">${formatNumber(Math.round(tick))}</text>
        </g>
      `).join("")}
      ${dateTicks.map((day) => `
        <text class="chart-axis-label" x="${x(day.at.getTime()).toFixed(1)}" y="${height - 10}" text-anchor="middle">${formatShortDate(day.at)}</text>
      `).join("")}
      ${days.map((day) => {
        const barHeight = Math.max(plotHeight - (y(day.miles) - margin.top), 3);
        const barX = x(day.at.getTime()) - barWidth / 2;
        const barY = margin.top + plotHeight - barHeight;
        return `
          <rect class="daily-bar" x="${barX.toFixed(1)}" y="${barY.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="3">
            <title>${formatDate(day.at)} - ${formatNumber(day.miles)} miles</title>
          </rect>
        `;
      }).join("")}
      <text class="chart-axis-title" x="14" y="${margin.top}" transform="rotate(-90 14 ${margin.top})">Miles</text>
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
  const forecastItems = sortMaintenanceByUrgency(maintenance)
    .map((item) => ({ item, prediction: predictionForMaintenance(item, rate) }))
    .filter((entry) => entry.prediction.date && entry.prediction.date <= runwayEnd)
    .slice(0, 4);
  const values = [rate.latestMileage, projectedEndMileage, ...forecastItems.map((entry) => Number(entry.item.due_mileage || rate.latestMileage))];
  const minMileage = Math.min(...values);
  const maxMileage = Math.max(...values);
  const padding = Math.max(Math.round((maxMileage - minMileage) * 0.1), 250);
  const yMin = Math.max(0, minMileage - padding);
  const yMax = maxMileage + padding;
  const minTime = rate.latestDate.getTime();
  const maxTime = runwayEnd.getTime();
  const width = 760;
  const height = 250;
  const margin = { top: 18, right: 24, bottom: 38, left: 64 };
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
    <span>${formatNumber(Math.round(rate.milesPerDay * 365))} projected miles/year</span>
    <span>${forecastItems.length ? `${forecastItems.length} service markers` : "No service projected"}</span>
  `;

  els.mileageChart.innerHTML = `
    <svg class="mileage-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Projected mileage and maintenance over next 12 months">
      ${ticks.map((tick) => `
        <g>
          <line class="chart-grid" x1="${margin.left}" y1="${y(tick).toFixed(1)}" x2="${width - margin.right}" y2="${y(tick).toFixed(1)}"></line>
          <text class="chart-axis-label" x="${margin.left - 10}" y="${(y(tick) + 4).toFixed(1)}" text-anchor="end">${formatNumber(Math.round(tick))}</text>
        </g>
      `).join("")}
      ${dateTicks.map((row) => `
        <text class="chart-axis-label" x="${x(row.at.getTime()).toFixed(1)}" y="${height - 10}" text-anchor="middle">${formatShortDate(row.at)}</text>
      `).join("")}
      <polyline class="runway-line" points="${projectionPoints}"></polyline>
      <circle class="current-mileage-point" cx="${x(rate.latestDate.getTime()).toFixed(1)}" cy="${y(rate.latestMileage).toFixed(1)}" r="6">
        <title>Current mileage - ${formatMileage(rate.latestMileage)}</title>
      </circle>
      ${forecastItems.map(({ item, prediction }, index) => {
        const markerX = x(prediction.date.getTime());
        const markerY = y(Number(item.due_mileage || rate.latestMileage));
        const labelY = index % 2 === 0 ? markerY - 12 : markerY + 18;
        return `
          <g>
            <line class="service-marker-line" x1="${markerX.toFixed(1)}" y1="${margin.top}" x2="${markerX.toFixed(1)}" y2="${height - margin.bottom}"></line>
            <circle class="service-marker ${getMaintenanceStatusClass(item.status)}" cx="${markerX.toFixed(1)}" cy="${markerY.toFixed(1)}" r="5">
              <title>${escapeHtml(item.service_name)} - ${escapeHtml(prediction.label)}</title>
            </circle>
            <text class="service-marker-label" x="${markerX.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle">${escapeHtml(item.service_name.split(" ")[0])}</text>
          </g>
        `;
      }).join("")}
      <text class="chart-axis-title" x="14" y="${margin.top}" transform="rotate(-90 14 ${margin.top})">Mileage</text>
    </svg>
  `;
}

function renderServiceForm(vehicleId, latest, maintenance) {
  const current = els.serviceName.value;
  const serviceNames = [...new Set(maintenance.map((item) => item.service_name).filter(Boolean))].sort();
  els.serviceName.innerHTML = serviceNames.map((serviceName) => (
    `<option value="${escapeHtml(serviceName)}">${escapeHtml(serviceName)}</option>`
  )).join("");
  if (serviceNames.includes(current)) els.serviceName.value = current;

  if (!els.serviceDate.value) els.serviceDate.value = todayValue();
  if (!els.serviceMileage.value && latest.last_mileage) {
    els.serviceMileage.value = latest.last_mileage;
  }

  els.saveServiceBtn.disabled = !vehicleId || !serviceNames.length;
}

function renderServiceHistory(history, emptyMessage = "No service records returned from Supabase.") {
  const sorted = [...history].sort((a, b) => new Date(b.service_date) - new Date(a.service_date));
  const visible = state.expanded.services ? sorted : sorted.slice(0, VISIBLE_LIMIT.services);
  els.toggleServicesBtn.hidden = sorted.length <= VISIBLE_LIMIT.services;
  els.toggleServicesBtn.textContent = state.expanded.services ? "Show Less" : "View All Services";
  els.serviceHistoryRows.innerHTML = cardsOrEmpty(visible.map((event) => `
    <article class="forecast-item">
      <div>
        <div class="alert-title">${escapeHtml(event.service_title || event.service_name || "Service record")}</div>
        <div class="subtle">${formatDate(event.service_date)} - ${formatMileage(event.mileage)}</div>
        <div class="subtle">
          ${escapeHtml([event.category, event.ro_number ? `RO ${event.ro_number}` : "", event.customer_paid !== null && event.customer_paid !== undefined ? formatCurrency(event.customer_paid) : ""].filter(Boolean).join(" - "))}
        </div>
        ${event.service_description ? `<div class="alert-note">${escapeHtml(event.service_description)}</div>` : ""}
      </div>
    </article>
  `).join(""), emptyMessage);
}

function adminKey() {
  return els.serviceAdminKey.value.trim();
}

function serviceFunctionUrl(name) {
  return `${state.config.supabaseUrl.replace(/\/$/, "")}/functions/v1/${name}`;
}

async function serviceFetch(name, options = {}) {
  const requireAdmin = options.requireAdmin !== false;
  if (requireAdmin && !adminKey()) throw new Error("Enter and save the admin key first.");
  const { requireAdmin: _requireAdmin, ...fetchOptions } = options;
  const headers = { ...(fetchOptions.headers || {}) };
  const { data: sessionData } = await state.supabase.auth.getSession();
  if (sessionData?.session?.access_token) {
    headers.authorization = `Bearer ${sessionData.session.access_token}`;
  }
  if (adminKey()) headers["x-admin-key"] = adminKey();

  const response = await fetch(serviceFunctionUrl(name), {
    ...fetchOptions,
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Service admin request failed (${response.status})`);
  }
  return payload.data;
}

async function loadServiceHistory({ force = false } = {}) {
  if (!state.config?.supabaseUrl) return;
  if (state.loadingServiceHistory && !force) return;

  state.loadingServiceHistory = true;
  setStatus(els.serviceHistoryStatus, "Loading maintenance history...");
  try {
    const vehicleId = selectedVehicleId();
    const data = await serviceFetch(`vehicle_service_admin?vehicle_id=${encodeURIComponent(vehicleId)}&_=${Date.now()}`, { requireAdmin: false });
    state.serviceModule = data;
    populateHistoryCategoryFilter(data.records || []);
    renderServiceModule();
    renderDashboard();
    setStatus(els.serviceHistoryStatus, "Maintenance history loaded.");
  } finally {
    state.loadingServiceHistory = false;
  }
}

function applyScheduleUpdate(updatedItem) {
  if (!updatedItem || !state.serviceModule?.schedule) return;
  state.serviceModule.schedule = state.serviceModule.schedule.map((item) => (
    item.id === updatedItem.id ? { ...item, ...updatedItem } : item
  ));
  renderServiceModule();
  renderDashboard();
}

function populateHistoryCategoryFilter(records) {
  const current = els.historyCategory.value;
  const categories = [...new Set(records.map((record) => record.category).filter(Boolean))].sort();
  els.historyCategory.innerHTML = '<option value="">All categories</option>' + categories.map((category) => (
    `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`
  )).join("");
  if (categories.includes(current)) els.historyCategory.value = current;
}

function filteredServiceRecords() {
  const records = state.serviceModule?.records || [];
  const dateFrom = els.historyDateFrom.value;
  const dateTo = els.historyDateTo.value;
  const mileageMin = els.historyMileageMin.value === "" ? null : Number(els.historyMileageMin.value);
  const mileageMax = els.historyMileageMax.value === "" ? null : Number(els.historyMileageMax.value);
  const category = els.historyCategory.value;
  const vendor = els.historyVendor.value.trim().toLowerCase();
  const ro = els.historyRo.value.trim().toLowerCase();

  return records.filter((record) => {
    if (dateFrom && record.service_date < dateFrom) return false;
    if (dateTo && record.service_date > dateTo) return false;
    if (mileageMin !== null && Number(record.mileage || 0) < mileageMin) return false;
    if (mileageMax !== null && Number(record.mileage || 0) > mileageMax) return false;
    if (category && record.category !== category) return false;
    if (vendor && !String(record.vendor || "").toLowerCase().includes(vendor)) return false;
    if (ro && !String(record.ro_number || "").toLowerCase().includes(ro)) return false;
    return true;
  });
}

function renderServiceModule() {
  const data = state.serviceModule || {};
  const vehicle = data.vehicle || {};
  const totals = data.totals || {};
  const dealerPaid = Number(totals.dealer_internal_paid || 0) + Number(totals.warranty_paid || 0) + Number(totals.goodwill_paid || 0);

  els.historyCurrentMileage.textContent = formatMileage(vehicle.current_mileage || state.summary?.latest?.[0]?.last_mileage);
  els.historyCustomerPaid.textContent = formatCurrency(totals.customer_paid || 0);
  els.historyDealerPaid.textContent = formatCurrency(dealerPaid);
  els.historyRecordCount.textContent = formatNumber((data.records || []).length);
  renderServiceHistory(data.records || []);
  renderServiceTimeline();
  renderHistorySchedule(data.schedule || []);
}

function renderServiceTimeline() {
  const rows = filteredServiceRecords();
  els.serviceTimelineRows.innerHTML = cardsOrEmpty(rows.map((record) => `
    <article class="timeline-row">
      <div class="timeline-date">
        <strong>${formatDate(record.service_date)}</strong>
        <span>${formatMileage(record.mileage)}</span>
      </div>
      <div>
        <div class="timeline-title">
          <strong>${escapeHtml(record.service_title)}</strong>
          <span class="pill ${serviceCategoryClass(record.category)}">${escapeHtml(record.category)}</span>
        </div>
        <p>${escapeHtml(record.service_description || "")}</p>
        <div class="timeline-meta">
          <span>RO ${escapeHtml(record.ro_number || "-")}</span>
          <span>${escapeHtml(record.vendor || "-")}</span>
          <span>Customer ${formatCurrency(record.customer_paid || 0)}</span>
          ${record.dealer_internal_paid ? `<span>Dealer/internal ${formatCurrency(record.dealer_internal_paid)}</span>` : ""}
        </div>
        ${record.notes ? `<div class="alert-note">${escapeHtml(record.notes)}</div>` : ""}
      </div>
      <button class="secondary compact" data-edit-service-record="${record.id}" type="button">Edit</button>
    </article>
  `).join(""), "No service records match these filters.");
}

function serviceCategoryClass(category) {
  return String(category || "").toLowerCase().replace(/[^a-z0-9]+/g, "-") || "info";
}

function scheduleStatusClass(status) {
  if (status === "overdue") return "due";
  if (status === "due_soon") return "soon";
  if (status === "needs_setup") return "setup";
  return "ok";
}

function renderHistorySchedule(schedule) {
  const order = { overdue: 1, due_soon: 2, needs_setup: 3, ok: 4 };
  const sorted = [...schedule].sort((a, b) => (order[a.status] || 5) - (order[b.status] || 5));
  els.historyScheduleRows.innerHTML = cardsOrEmpty(sorted.map((item) => {
    const statusClass = scheduleStatusClass(item.status);
    const hasCompletion = item.last_completed_date || item.last_completed_mileage;
    return `
      <article class="schedule-row ${statusClass}">
        <div>
          <strong>${escapeHtml(item.task_name)}</strong>
          <span>${[item.next_due_mileage ? `${formatNumber(item.next_due_mileage)} mi` : "", item.next_due_date ? formatDate(item.next_due_date) : ""].filter(Boolean).join(" / ") || "Manual"}</span>
          ${hasCompletion ? `<small>Last completed ${[item.last_completed_date ? formatDate(item.last_completed_date) : "", item.last_completed_mileage ? formatMileage(item.last_completed_mileage) : ""].filter(Boolean).join(" at ")}</small>` : ""}
          <small>${escapeHtml(item.notes || "")}</small>
        </div>
        <span class="pill ${statusClass}">${escapeHtml(String(item.status || "ok").replace("_", " "))}</span>
        <div class="schedule-actions">
          <button class="secondary compact" data-edit-schedule="${item.id}" type="button">${item.status === "needs_setup" ? "Set Up" : "Edit Schedule"}</button>
          <button class="secondary compact" data-mark-complete="${item.id}" type="button">${hasCompletion ? "Update Done" : "Mark Complete"}</button>
          ${hasCompletion ? `<button class="secondary compact" data-reset-schedule="${item.id}" type="button">Undo</button>` : ""}
        </div>
      </article>
    `;
  }).join(""), "No maintenance schedule yet.");
}

function fillServiceRecordForm(record) {
  els.serviceRecordId.value = record?.id || "";
  els.serviceRecordFormTitle.textContent = record?.id ? "Edit Service Record" : "Add Service Record";
  els.recordServiceDate.value = record?.service_date || todayValue();
  els.recordMileage.value = record?.mileage ?? "";
  els.recordRoNumber.value = record?.ro_number || "";
  els.recordCategory.value = record?.category || "Maintenance";
  els.recordServiceTitle.value = record?.service_title || "";
  els.recordVendor.value = record?.vendor || "Toyota";
  els.recordCustomerPaid.value = record?.customer_paid ?? "";
  els.recordNotes.value = record?.notes || "";
}

function serviceRecordPayload() {
  return {
    id: els.serviceRecordId.value || undefined,
    vehicle_id: selectedVehicleId(),
    service_date: els.recordServiceDate.value,
    mileage: els.recordMileage.value === "" ? null : Number(els.recordMileage.value),
    ro_number: els.recordRoNumber.value.trim() || null,
    category: els.recordCategory.value,
    service_title: els.recordServiceTitle.value.trim(),
    vendor: els.recordVendor.value.trim() || null,
    customer_paid: els.recordCustomerPaid.value === "" ? null : Number(els.recordCustomerPaid.value),
    notes: els.recordNotes.value.trim() || null,
  };
}

async function saveServiceRecord(event) {
  event.preventDefault();
  const payload = serviceRecordPayload();
  if (!payload.service_date) throw new Error("Service date is required.");
  if (!payload.service_title) throw new Error("Service title is required.");
  const editing = Boolean(payload.id);
  setStatus(els.serviceHistoryStatus, editing ? "Updating service record..." : "Adding service record...");
  await serviceFetch("vehicle_service_admin", {
    method: editing ? "PATCH" : "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  fillServiceRecordForm(null);
  await loadServiceHistory();
}

async function uploadServiceDocument() {
  const file = els.serviceDocumentFile.files?.[0];
  if (!file) throw new Error("Choose a document or photo first.");
  const form = new FormData();
  form.append("file", file);
  form.append("vehicle_id", selectedVehicleId());
  if (els.serviceRecordId.value) form.append("service_record_id", els.serviceRecordId.value);

  setStatus(els.serviceHistoryStatus, "Uploading service document...");
  await serviceFetch("vehicle_service_document_upload", {
    method: "POST",
    body: form,
  });
  els.serviceDocumentFile.value = "";
  await loadServiceHistory();
}

async function markScheduleComplete(id) {
  const item = (state.serviceModule?.schedule || []).find((row) => row.id === id);
  if (!item) return;
  const completion = promptScheduleCompletion(item);
  if (!completion) return;

  setStatus(els.serviceHistoryStatus, "Marking maintenance complete...");
  const updatedItem = await serviceFetch("vehicle_service_admin?action=mark_complete", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id,
      interval_miles: item.interval_miles,
      interval_months: item.interval_months,
      last_completed_mileage: completion.mileage,
      last_completed_date: completion.date,
      notes: item.notes,
    }),
  });
  applyScheduleUpdate(updatedItem);
  setStatus(els.serviceHistoryStatus, "Maintenance item updated.");
  await loadServiceHistory({ force: true });
}

function promptNumber(message, defaultValue, { required = false } = {}) {
  const value = window.prompt(message, defaultValue ?? "");
  if (value === null) return { cancelled: true, value: null };
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) throw new Error("This field is required.");
    return { cancelled: false, value: null };
  }
  const numberValue = Number(trimmed);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new Error("Use a positive number.");
  }
  return { cancelled: false, value: numberValue };
}

function promptDate(message, defaultValue, { required = false } = {}) {
  const value = window.prompt(message, defaultValue ?? "");
  if (value === null) return { cancelled: true, value: null };
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) throw new Error("This field is required.");
    return { cancelled: false, value: null };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("Use a date like 2026-01-12.");
  }
  const parsedDate = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== trimmed) {
    throw new Error("Use a valid date.");
  }
  return { cancelled: false, value: trimmed };
}

function promptScheduleCompletion(item) {
  const defaultDate = item.last_completed_date || todayValue();
  const defaultMileage = item.last_completed_mileage || selectedVehicleMileage() || "";
  const date = promptDate(`Completion date for ${item.task_name} (YYYY-MM-DD)`, defaultDate, { required: true });
  if (date.cancelled) return null;
  const mileage = promptNumber(`Mileage when ${item.task_name} was completed`, defaultMileage);
  if (mileage.cancelled) return null;

  return {
    date: date.value,
    mileage: mileage.value,
  };
}

function promptScheduleSetup(item) {
  const intervalMiles = promptNumber(`Interval miles for ${item.task_name} (blank if date-only)`, item.interval_miles ?? "");
  if (intervalMiles.cancelled) return null;
  const intervalMonths = promptNumber(`Interval months for ${item.task_name} (blank if mileage-only)`, item.interval_months ?? "");
  if (intervalMonths.cancelled) return null;
  const lastCompletedDate = promptDate(`Last completed date for ${item.task_name} (YYYY-MM-DD, blank if unknown)`, item.last_completed_date || "");
  if (lastCompletedDate.cancelled) return null;
  const lastCompletedMileage = promptNumber(`Last completed mileage for ${item.task_name} (blank if unknown)`, item.last_completed_mileage ?? selectedVehicleMileage() ?? "");
  if (lastCompletedMileage.cancelled) return null;
  const notes = window.prompt(`Notes for ${item.task_name}`, item.notes || "");
  if (notes === null) return null;

  return {
    interval_miles: intervalMiles.value,
    interval_months: intervalMonths.value,
    last_completed_date: lastCompletedDate.value,
    last_completed_mileage: lastCompletedMileage.value,
    current_mileage: selectedVehicleMileage() || null,
    notes: notes.trim() || null,
  };
}

async function editScheduleItem(id) {
  const item = (state.serviceModule?.schedule || []).find((row) => row.id === id);
  if (!item) return;
  const payload = promptScheduleSetup(item);
  if (!payload) return;

  setStatus(els.serviceHistoryStatus, "Updating maintenance setup...");
  const updatedItem = await serviceFetch("vehicle_service_admin?action=update_schedule", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, ...payload }),
  });
  applyScheduleUpdate(updatedItem);
  setStatus(els.serviceHistoryStatus, "Maintenance setup updated.");
  await loadServiceHistory({ force: true });
}

async function resetScheduleCompletion(id) {
  const item = (state.serviceModule?.schedule || []).find((row) => row.id === id);
  if (!item) return;
  const confirmed = window.confirm(`Undo the completion for ${item.task_name}? This clears the last completed date and mileage.`);
  if (!confirmed) return;

  setStatus(els.serviceHistoryStatus, "Undoing maintenance completion...");
  const updatedItem = await serviceFetch("vehicle_service_admin?action=reset_schedule", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
  applyScheduleUpdate(updatedItem);
  setStatus(els.serviceHistoryStatus, "Maintenance completion undone.");
  await loadServiceHistory({ force: true });
}

async function saveService() {
  const vehicleId = selectedVehicleId();
  const serviceName = els.serviceName.value;
  const mileage = els.serviceMileage.value === "" ? null : Number(els.serviceMileage.value);
  const serviceDate = els.serviceDate.value || todayValue();
  const performedBy = els.servicePerformedBy.value.trim() || null;
  const cost = els.serviceCost.value === "" ? null : Number(els.serviceCost.value);
  const notes = els.serviceNotes.value.trim() || null;

  if (!vehicleId) throw new Error("Choose a vehicle first.");
  if (!serviceName) throw new Error("Choose a service type.");
  if (mileage !== null && mileage < 0) throw new Error("Mileage must be positive.");
  if (cost !== null && cost < 0) throw new Error("Cost must be positive.");

  setStatus(els.serviceStatus, "Saving service...");
  await serviceFetch("vehicle_service_admin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      vehicle_id: vehicleId,
      service_date: serviceDate,
      mileage,
      vendor: performedBy,
      category: "Maintenance",
      service_title: serviceName,
      customer_paid: cost,
      notes,
    }),
  });

  els.serviceCost.value = "";
  els.serviceNotes.value = "";
  setStatus(els.serviceStatus, "Service saved.");
  await loadServiceHistory();
  closeServiceModal();
}

function renderIncidentSummary(incidents) {
  const incidentCount = incidents.reduce((total, row) => total + Number(row.incident_count || 0), 0);
  if (!incidentCount) {
    els.toggleIncidentsBtn.hidden = true;
    els.incidentSummary.innerHTML = `
      <div class="empty-state good-empty">
        <span class="empty-check">OK</span>
        <strong>No incidents in this time range</strong>
        <p>Great job keeping the vehicle in good shape.</p>
        <div class="severity-grid">
          <span><strong>0</strong><small>High</small></span>
          <span><strong>0</strong><small>Medium</small></span>
          <span><strong>0</strong><small>Low</small></span>
          <span><strong>0</strong><small>Info</small></span>
        </div>
      </div>
    `;
    return;
  }

  const sorted = [...incidents].sort((a, b) => new Date(b.last_incident_at) - new Date(a.last_incident_at));
  const visible = state.expanded.incidents ? sorted : sorted.slice(0, 4);
  els.toggleIncidentsBtn.hidden = sorted.length <= 4;
  els.toggleIncidentsBtn.textContent = state.expanded.incidents ? "Show Less" : "View All Incidents";
  els.incidentSummary.innerHTML = `
    <div class="incident-counts">
      ${visible.map((row) => `
        <article class="incident-row">
          <strong>${escapeHtml(row.incident_type || "Incident")}</strong>
          <span>${escapeHtml(row.severity || "info")} - ${formatNumber(row.incident_count)}</span>
          <small>Last: ${formatDate(row.last_incident_at)}</small>
        </article>
      `).join("")}
    </div>
  `;
}

function renderRecent(logs) {
  const visible = state.expanded.logs ? logs : logs.slice(0, VISIBLE_LIMIT.logs);
  els.toggleLogsBtn.hidden = logs.length <= VISIBLE_LIMIT.logs;
  els.toggleLogsBtn.textContent = state.expanded.logs ? "Show Less" : "View All Logs";
  els.recentRows.innerHTML = visible.length ? visible.map((row) => {
    const actionClass = row.log_type === "checkout" ? "info" : "ok";
    const incident = row.incident_count || row.incident_type || row.severity ? "Yes" : "-";
    return `
      <tr>
        <td data-label="Date / Time">${formatDateTime(row.created_at)}</td>
        <td data-label="Action"><span class="pill ${actionClass}">${escapeHtml(row.log_type || "-")}</span></td>
        <td data-label="Driver">${escapeHtml(row.employee_name || "-")}</td>
        <td data-label="Mileage">${formatMileage(row.mileage)}</td>
        <td data-label="Incident">${escapeHtml(incident)}</td>
      </tr>
    `;
  }).join("") : '<tr><td colspan="5" class="empty">No logs in this time range.</td></tr>';
}

function openServiceModal() {
  els.serviceModal.hidden = false;
  els.serviceStatus.textContent = "";
  els.serviceName.focus();
}

function closeServiceModal() {
  els.serviceModal.hidden = true;
}

function toggleExpanded(key) {
  state.expanded[key] = !state.expanded[key];
  renderDashboard();
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
  closeServiceModal();
  setStatus(els.authStatus, "Signed out.");
});

els.refreshBtn.addEventListener("click", () => {
  loadDashboard().catch((error) => setStatus(els.dashboardStatus, error.message, true));
});

els.openServiceBtn.addEventListener("click", openServiceModal);
els.closeServiceBtn.addEventListener("click", closeServiceModal);
els.serviceModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-service]")) closeServiceModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !els.serviceModal.hidden) closeServiceModal();
});

els.saveServiceBtn.addEventListener("click", () => {
  saveService().catch((error) => setStatus(els.serviceStatus, error.message, true));
});

els.toggleMaintenanceBtn.addEventListener("click", () => toggleExpanded("maintenance"));
els.toggleLogsBtn.addEventListener("click", () => toggleExpanded("logs"));
els.toggleServicesBtn.addEventListener("click", () => toggleExpanded("services"));
els.toggleIncidentsBtn.addEventListener("click", () => toggleExpanded("incidents"));

els.saveServiceAdminKeyBtn.addEventListener("click", () => {
  localStorage.setItem("nudgeFleet.adminKey", adminKey());
  loadServiceHistory().catch((error) => setStatus(els.serviceHistoryStatus, error.message, true));
});

els.refreshServiceHistoryBtn.addEventListener("click", () => {
  loadServiceHistory().catch((error) => setStatus(els.serviceHistoryStatus, error.message, true));
});

[
  els.historyDateFrom,
  els.historyDateTo,
  els.historyMileageMin,
  els.historyMileageMax,
  els.historyCategory,
  els.historyVendor,
  els.historyRo,
].forEach((input) => {
  input.addEventListener("input", renderServiceTimeline);
  input.addEventListener("change", renderServiceTimeline);
});

els.clearHistoryFiltersBtn.addEventListener("click", () => {
  [
    els.historyDateFrom,
    els.historyDateTo,
    els.historyMileageMin,
    els.historyMileageMax,
    els.historyCategory,
    els.historyVendor,
    els.historyRo,
  ].forEach((input) => {
    input.value = "";
  });
  renderServiceTimeline();
});

els.serviceTimelineRows.addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit-service-record]");
  if (!button) return;
  const record = (state.serviceModule?.records || []).find((row) => row.id === button.dataset.editServiceRecord);
  if (record) fillServiceRecordForm(record);
});

els.historyScheduleRows.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-schedule]");
  if (editButton) {
    editScheduleItem(editButton.dataset.editSchedule)
      .catch((error) => setStatus(els.serviceHistoryStatus, error.message, true));
    return;
  }

  const completeButton = event.target.closest("[data-mark-complete]");
  if (completeButton) {
    markScheduleComplete(completeButton.dataset.markComplete)
      .catch((error) => setStatus(els.serviceHistoryStatus, error.message, true));
    return;
  }

  const resetButton = event.target.closest("[data-reset-schedule]");
  if (resetButton) {
    resetScheduleCompletion(resetButton.dataset.resetSchedule)
      .catch((error) => setStatus(els.serviceHistoryStatus, error.message, true));
  }
});

els.serviceRecordForm.addEventListener("submit", (event) => {
  saveServiceRecord(event).catch((error) => setStatus(els.serviceHistoryStatus, error.message, true));
});

els.resetServiceRecordBtn.addEventListener("click", () => {
  fillServiceRecordForm(null);
});

els.uploadServiceDocumentBtn.addEventListener("click", () => {
  uploadServiceDocument().catch((error) => setStatus(els.serviceHistoryStatus, error.message, true));
});

els.vehicleSelect.addEventListener("change", renderDashboard);
els.rangeSelect.addEventListener("change", () => {
  loadDashboard().catch((error) => setStatus(els.dashboardStatus, error.message, true));
});

fillServiceRecordForm(null);
initialize().catch((error) => setStatus(els.authStatus, error.message, true));
