# Nudge Fleet Supabase Setup

Run `reporting_and_maintenance.sql` in Supabase SQL Editor for the project that contains the `nudge_fleet` schema.

Then run `owner_access.sql` to add the owner allowlist and protected dashboard RPC.

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
