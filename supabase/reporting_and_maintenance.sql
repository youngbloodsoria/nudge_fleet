-- Nudge Fleet reporting and maintenance helpers.
-- Run this in the Supabase SQL Editor for the project that owns schema nudge_fleet.

create schema if not exists nudge_fleet;

set search_path = nudge_fleet, public;

create table if not exists nudge_fleet.vehicle_maintenance_rules (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references nudge_fleet.vehicles(id) on delete cascade,
  service_name text not null,
  interval_miles integer,
  interval_months integer,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint vehicle_maintenance_rules_interval_check
    check (interval_miles is not null or interval_months is not null)
);

create table if not exists nudge_fleet.vehicle_maintenance_events (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references nudge_fleet.vehicles(id) on delete cascade,
  service_name text not null,
  service_date date not null default current_date,
  mileage integer,
  performed_by text,
  cost numeric(10, 2),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists vehicle_logs_vehicle_created_idx
  on nudge_fleet.vehicle_logs (vehicle_id, created_at desc);

create index if not exists vehicle_logs_employee_created_idx
  on nudge_fleet.vehicle_logs (employee_name, created_at desc);

create index if not exists vehicle_maintenance_events_vehicle_service_idx
  on nudge_fleet.vehicle_maintenance_events (vehicle_id, service_name, service_date desc);

create or replace view nudge_fleet.vehicle_dashboard_vehicles as
select
  id,
  name,
  plate
from nudge_fleet.vehicles;

create or replace view nudge_fleet.vehicle_dashboard_recent_logs as
select
  id,
  vehicle_id,
  log_type,
  employee_name,
  mileage,
  notes,
  created_at
from nudge_fleet.vehicle_logs;

create or replace view nudge_fleet.vehicle_latest_status as
select distinct on (v.id)
  v.id as vehicle_id,
  v.name,
  v.plate,
  l.id as last_log_id,
  l.log_type as last_log_type,
  l.employee_name as last_employee_name,
  l.mileage as last_mileage,
  l.notes as last_notes,
  l.created_at as last_seen_at
from nudge_fleet.vehicles v
left join nudge_fleet.vehicle_logs l on l.vehicle_id = v.id
order by v.id, l.created_at desc nulls last;

create or replace view nudge_fleet.vehicle_usage_daily as
with ordered_logs as (
  select
    l.*,
    lag(l.mileage) over (partition by l.vehicle_id order by l.created_at) as previous_mileage
  from nudge_fleet.vehicle_logs l
)
select
  vehicle_id,
  date_trunc('day', created_at)::date as usage_date,
  count(*) as log_count,
  count(*) filter (where log_type = 'checkout') as checkout_count,
  count(*) filter (where log_type = 'return') as return_count,
  count(distinct employee_name) as driver_count,
  min(mileage) as min_mileage,
  max(mileage) as max_mileage,
  sum(greatest(mileage - previous_mileage, 0))::integer as estimated_miles
from ordered_logs
group by vehicle_id, date_trunc('day', created_at)::date;

create or replace view nudge_fleet.vehicle_driver_summary as
select
  vehicle_id,
  employee_name,
  count(*) as log_count,
  count(*) filter (where log_type = 'checkout') as checkout_count,
  count(*) filter (where log_type = 'return') as return_count,
  min(created_at) as first_log_at,
  max(created_at) as last_log_at,
  min(mileage) as first_mileage,
  max(mileage) as last_mileage
from nudge_fleet.vehicle_logs
group by vehicle_id, employee_name;

create or replace view nudge_fleet.vehicle_incident_summary as
select
  l.vehicle_id,
  i.incident_type,
  nullif(i.severity, '') as severity,
  count(*) as incident_count,
  max(coalesce(i.created_at, l.created_at)) as last_incident_at
from nudge_fleet.vehicle_incidents i
join nudge_fleet.vehicle_logs l on l.id = i.log_id
group by l.vehicle_id, i.incident_type, nullif(i.severity, '');

create or replace view nudge_fleet.vehicle_maintenance_status as
with latest_mileage as (
  select distinct on (vehicle_id)
    vehicle_id,
    mileage as current_mileage,
    created_at as mileage_seen_at
  from nudge_fleet.vehicle_logs
  order by vehicle_id, created_at desc
),
latest_service as (
  select distinct on (vehicle_id, service_name)
    vehicle_id,
    service_name,
    service_date as last_service_date,
    mileage as last_service_mileage,
    performed_by,
    notes
  from nudge_fleet.vehicle_maintenance_events
  order by vehicle_id, service_name, service_date desc, created_at desc
)
select
  r.vehicle_id,
  v.name as vehicle_name,
  v.plate,
  r.service_name,
  r.interval_miles,
  r.interval_months,
  r.notes as rule_notes,
  lm.current_mileage,
  ls.last_service_date,
  ls.last_service_mileage,
  case
    when r.interval_miles is null or ls.last_service_mileage is null then null
    else ls.last_service_mileage + r.interval_miles
  end as due_mileage,
  case
    when r.interval_months is null or ls.last_service_date is null then null
    else (ls.last_service_date + make_interval(months => r.interval_months))::date
  end as due_date,
  case
    when r.interval_miles is not null
      and ls.last_service_mileage is not null
      and lm.current_mileage is not null
      then (ls.last_service_mileage + r.interval_miles) - lm.current_mileage
    else null
  end as miles_remaining,
  case
    when ls.last_service_date is null and ls.last_service_mileage is null then 'no_history'
    when r.interval_miles is not null
      and ls.last_service_mileage is not null
      and lm.current_mileage >= ls.last_service_mileage + r.interval_miles then 'due'
    when r.interval_months is not null
      and ls.last_service_date is not null
      and current_date >= (ls.last_service_date + make_interval(months => r.interval_months))::date then 'due'
    when r.interval_miles is not null
      and ls.last_service_mileage is not null
      and lm.current_mileage >= (ls.last_service_mileage + r.interval_miles - 500) then 'soon'
    when r.interval_months is not null
      and ls.last_service_date is not null
      and current_date >= ((ls.last_service_date + make_interval(months => r.interval_months))::date - 30) then 'soon'
    else 'ok'
  end as status
from nudge_fleet.vehicle_maintenance_rules r
join nudge_fleet.vehicles v on v.id = r.vehicle_id
left join latest_mileage lm on lm.vehicle_id = r.vehicle_id
left join latest_service ls on ls.vehicle_id = r.vehicle_id and ls.service_name = r.service_name
where r.is_active = true;

-- Default 2016 Toyota Highlander maintenance cadence. Confirm against the
-- specific Toyota Warranty and Maintenance Guide for the vehicle drivetrain/use.
insert into nudge_fleet.vehicle_maintenance_rules (vehicle_id, service_name, interval_miles, interval_months, notes)
select
  v.id,
  rule.service_name,
  rule.interval_miles,
  rule.interval_months,
  rule.notes
from nudge_fleet.vehicles v
cross join (
  values
    ('Engine oil and filter', 10000, 6, 'Change every 10,000 miles or 6 months, whichever comes first. Use 5,000 miles for severe use.'),
    ('Tire rotation', 5000, 6, 'Rotate tires and inspect tire condition.'),
    ('Brake inspection', 5000, 6, 'Inspect pads, rotors, lines, parking brake, and fluid condition.'),
    ('Fluid level inspection', 5000, 6, 'Inspect coolant, brake fluid, washer fluid, transmission/driveline leaks.'),
    ('Cabin air filter inspection', 15000, 18, 'Inspect and replace as needed.'),
    ('Engine air filter inspection', 30000, 36, 'Inspect and replace as needed; more often in dusty conditions.'),
    ('Transmission fluid inspection', 30000, 36, 'Inspect fluid/leaks; service interval depends on operating conditions.'),
    ('Spark plugs', 120000, 144, 'Typical iridium plug replacement interval.'),
    ('Coolant replacement', 100000, 120, 'Initial coolant replacement; subsequent interval may be shorter.'),
    ('Rear differential / transfer case inspection', 15000, 18, 'Applies if AWD; inspect for leaks/noise and service in severe use.')
) as rule(service_name, interval_miles, interval_months, notes)
where lower(coalesce(v.name, '')) like '%highlander%'
on conflict do nothing;

update nudge_fleet.vehicle_maintenance_rules
set interval_months = 6,
    notes = 'Change every 10,000 miles or 6 months, whichever comes first. Use 5,000 miles for severe use.'
where service_name = 'Engine oil and filter'
  and interval_miles = 10000
  and is_active = true;

-- Optional RPC for an Edge Function or service-role job. It removes old
-- non-incident photo rows and returns the storage paths to delete from Storage.
create or replace function nudge_fleet.photos_ready_for_purge(retain_days integer default 60)
returns table(photo_id uuid, storage_path text)
language sql
security definer
set search_path = nudge_fleet, public
as $$
  select p.id, p.storage_path
  from nudge_fleet.vehicle_log_photos p
  left join nudge_fleet.vehicle_incidents i on i.log_id = p.log_id
  where p.created_at < now() - make_interval(days => retain_days)
    and i.id is null
    and p.storage_path is not null;
$$;

create or replace function nudge_fleet.mark_photos_purged(photo_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = nudge_fleet, public
as $$
declare
  deleted_count integer;
begin
  delete from nudge_fleet.vehicle_log_photos
  where id = any(photo_ids);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
