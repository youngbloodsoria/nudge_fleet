-- Owner dashboard access for the Vercel app.
-- Run after reporting_and_maintenance.sql.

create schema if not exists nudge_fleet;

set search_path = nudge_fleet, public;

create table if not exists nudge_fleet.owner_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists owner_users_email_lower_idx
  on nudge_fleet.owner_users (lower(email));

alter table nudge_fleet.owner_users enable row level security;

create or replace function nudge_fleet.current_user_is_owner()
returns boolean
language sql
stable
security definer
set search_path = nudge_fleet, public
as $$
  select exists (
    select 1
    from nudge_fleet.owner_users owner
    where owner.is_active = true
      and lower(owner.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function nudge_fleet.fleet_dashboard_summary(range_days integer default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path = nudge_fleet, public
as $$
declare
  payload jsonb;
begin
  if not nudge_fleet.current_user_is_owner() then
    raise exception 'Not authorized for fleet dashboard';
  end if;

  select jsonb_build_object(
    'vehicles', (
      select coalesce(jsonb_agg(to_jsonb(v) order by v.name), '[]'::jsonb)
      from nudge_fleet.vehicle_dashboard_vehicles v
    ),
    'latest', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.name), '[]'::jsonb)
      from nudge_fleet.vehicle_latest_status s
    ),
    'logs', (
      select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at desc), '[]'::jsonb)
      from (
        select *
        from nudge_fleet.vehicle_dashboard_recent_logs
        where range_days is null
          or created_at >= now() - make_interval(days => range_days)
        order by created_at desc
        limit 500
      ) l
    ),
    'daily', (
      select coalesce(jsonb_agg(to_jsonb(d) order by d.usage_date), '[]'::jsonb)
      from nudge_fleet.vehicle_usage_daily d
      where range_days is null
        or d.usage_date >= current_date - range_days
    ),
    'drivers', (
      select coalesce(jsonb_agg(to_jsonb(driver) order by driver.last_log_at desc), '[]'::jsonb)
      from nudge_fleet.vehicle_driver_summary driver
    ),
    'maintenance', (
      select coalesce(jsonb_agg(to_jsonb(m) order by m.status desc, m.service_name), '[]'::jsonb)
      from nudge_fleet.vehicle_maintenance_status m
    ),
    'incidents', (
      select coalesce(jsonb_agg(to_jsonb(i) order by i.last_incident_at desc), '[]'::jsonb)
      from nudge_fleet.vehicle_incident_summary i
    )
  ) into payload;

  return payload;
end;
$$;

revoke all on function nudge_fleet.current_user_is_owner() from public;
revoke all on function nudge_fleet.fleet_dashboard_summary(integer) from public;
grant usage on schema nudge_fleet to authenticated;
grant execute on function nudge_fleet.current_user_is_owner() to authenticated;
grant execute on function nudge_fleet.fleet_dashboard_summary(integer) to authenticated;

-- After creating a Supabase Auth user for yourself, add that email here:
-- insert into nudge_fleet.owner_users (email, display_name)
-- values ('you@example.com', 'Your Name')
-- on conflict ((lower(email))) do update set is_active = true;
