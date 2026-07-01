# Nudge Fleet Supabase Setup

Run `reporting_and_maintenance.sql` in Supabase SQL Editor for the project that contains the `nudge_fleet` schema.

Then run `owner_access.sql` to add the owner allowlist and protected dashboard RPC.

Then run `alerts_and_100k_baseline.sql` to add alert summary support and seed a temporary 100k-mile Highlander maintenance baseline.

## Vercel environment variables

Set these in the Vercel project, then redeploy:

```text
SUPABASE_URL=https://zdspapaigdywpbfwwzfb.supabase.co
SUPABASE_ANON_KEY=your Supabase anon public key
```

Do not put the Supabase service-role key in Vercel public config.

## Owner login setup

1. In Supabase Auth, create or invite your owner user.
2. Run this SQL with your email:

```sql
insert into nudge_fleet.owner_users (email, display_name)
values ('you@example.com', 'Your Name')
on conflict ((lower(email))) do update
set is_active = true,
    display_name = excluded.display_name;
```

3. Open `/dashboard.html` and sign in.

## Alerts

The dashboard now has the SQL shape needed for alerts:

- `alert_events` stores future alert activity.
- `queue_vehicle_log_alert_trigger` creates a pending alert event whenever a vehicle log is inserted.
- `fleet_dashboard_summary(range_days)` returns alert events for the owner dashboard.
- `mark_alert_reviewed(alert_id)` lets an owner mark a dashboard alert reviewed.
- `log_vehicle_maintenance_service(...)` lets an owner add maintenance history from the dashboard.
- `fleet_maintenance_alert_items` lists due, soon, and missing-history services.
- `fleet_maintenance_email_summary()` returns maintenance alert data as JSON.

The current recommendation is dashboard-first:

- Normal check-out/check-in: dashboard alert only.
- Incident/damage: review immediately in the dashboard; email can be added later if needed.
- Maintenance due/soon or not driven recently: visible in the dashboard; add weekly email only if the dashboard is not enough.

Actual email sending should be server-side only. Do not add a service-role key or email API key to client-side code.

Recommended Vercel-only server env vars once an email provider is selected:

```text
ALERT_TO_EMAIL=owner@example.com
ALERT_FROM_EMAIL=Nudge Fleet <alerts@yourdomain.com>
SENDGRID_API_KEY=your SendGrid API key
WEEKLY_REPORT_TO_EMAIL=alex.soria@skyrun.com
WEEKLY_REPORT_FROM_EMAIL=Nudge Fleet <verified-sender@yourdomain.com>
CRON_SECRET=a long random string for Vercel Cron
APP_BASE_URL=https://your-vercel-domain.vercel.app
```

The weekly email intentionally sends a secure dashboard link rather than private driver, mileage, incident, or maintenance details. The report details stay behind owner login. Signed-in owners can send it from the dashboard with **Send Report**, and Vercel Cron can call `/api/weekly-report` weekly when `CRON_SECRET` is configured.

No Supabase service-role key is required for this weekly link email. If you add future server jobs that do need a service-role key, keep it in Vercel server-only environment variables and never in browser JavaScript.

## 100k-mile maintenance baseline

`alerts_and_100k_baseline.sql` calls:

```sql
select nudge_fleet.seed_highlander_100k_baseline(current_date);
```

That creates maintenance history at 100,000 miles for Highlander maintenance rules that do not already have a service event. It is intentionally marked as a temporary owner-provided baseline so it can be replaced with exact Toyota invoice details later.

## Dashboard access

The dashboard reads through `nudge_fleet.fleet_dashboard_summary(range_days)`, which checks the signed-in user's email against `nudge_fleet.owner_users` before returning data. It uses these reporting views internally:

- `vehicle_dashboard_vehicles`
- `vehicle_dashboard_recent_logs`
- `vehicle_latest_status`
- `vehicle_usage_daily`
- `vehicle_driver_summary`
- `vehicle_incident_summary`
- `vehicle_maintenance_status`

Because these views include employee names, vehicle usage, mileage, and incidents, do not grant public anonymous read access to them.

## Photo purge workflow

The GitHub workflow at `.github/workflows/purge_photos.yml` calls a Supabase Edge Function with two repository secrets:

- `SUPABASE_PURGE_URL`
- `SUPABASE_PURGE_KEY`

The SQL file adds helper RPCs:

- `nudge_fleet.photos_ready_for_purge(retain_days integer)`
- `nudge_fleet.mark_photos_purged(photo_ids uuid[])`

The purge Edge Function should call `photos_ready_for_purge`, delete the returned Storage objects with a service-role client, then call `mark_photos_purged` after successful Storage deletion.
