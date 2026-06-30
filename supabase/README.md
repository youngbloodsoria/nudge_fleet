# Nudge Fleet Supabase Setup

Run `reporting_and_maintenance.sql` in Supabase SQL Editor for the project that contains the `nudge_fleet` schema.

## Dashboard access

The dashboard reads from reporting views in the `nudge_fleet` schema:

- `vehicle_dashboard_vehicles`
- `vehicle_dashboard_recent_logs`
- `vehicle_latest_status`
- `vehicle_usage_daily`
- `vehicle_driver_summary`
- `vehicle_incident_summary`
- `vehicle_maintenance_status`

Because these views include employee names, vehicle usage, mileage, and incidents, do not grant public read access unless you are comfortable with anyone holding the anon key seeing that data.

For an internal-only dashboard, use Supabase Auth or a small Edge Function that validates an admin key before returning these views.

For a quick private test in SQL Editor, you can temporarily grant view access to an authenticated role after you have Auth set up:

```sql
grant usage on schema nudge_fleet to authenticated;
grant select on nudge_fleet.vehicle_dashboard_vehicles to authenticated;
grant select on nudge_fleet.vehicle_dashboard_recent_logs to authenticated;
grant select on nudge_fleet.vehicle_latest_status to authenticated;
grant select on nudge_fleet.vehicle_usage_daily to authenticated;
grant select on nudge_fleet.vehicle_driver_summary to authenticated;
grant select on nudge_fleet.vehicle_incident_summary to authenticated;
grant select on nudge_fleet.vehicle_maintenance_status to authenticated;
```

## Photo purge workflow

The GitHub workflow at `.github/workflows/purge_photos.yml` calls a Supabase Edge Function with two repository secrets:

- `SUPABASE_PURGE_URL`
- `SUPABASE_PURGE_KEY`

The SQL file adds helper RPCs:

- `nudge_fleet.photos_ready_for_purge(retain_days integer)`
- `nudge_fleet.mark_photos_purged(photo_ids uuid[])`

The purge Edge Function should call `photos_ready_for_purge`, delete the returned Storage objects with a service-role client, then call `mark_photos_purged` after successful Storage deletion.
