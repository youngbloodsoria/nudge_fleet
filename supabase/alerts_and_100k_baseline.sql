-- Alert support and temporary 100k-mile maintenance baseline.
-- Run after reporting_and_maintenance.sql and owner_access.sql.

create schema if not exists nudge_fleet;

set search_path = nudge_fleet, public;

create table if not exists nudge_fleet.alert_events (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null,
  vehicle_id uuid references nudge_fleet.vehicles(id) on delete set null,
  log_id uuid references nudge_fleet.vehicle_logs(id) on delete set null,
  subject text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  error text,
  constraint alert_events_type_check
    check (alert_type in ('vehicle_log', 'maintenance')),
  constraint alert_events_status_check
    check (status in ('pending', 'reviewed', 'sent', 'skipped', 'failed'))
);

alter table nudge_fleet.alert_events
  drop constraint if exists alert_events_status_check;

alter table nudge_fleet.alert_events
  add constraint alert_events_status_check
  check (status in ('pending', 'reviewed', 'sent', 'skipped', 'failed'));

create index if not exists alert_events_status_created_idx
  on nudge_fleet.alert_events (status, created_at desc);

create or replace function nudge_fleet.queue_vehicle_log_alert()
returns trigger
language plpgsql
security definer
set search_path = nudge_fleet, public
as $$
declare
  vehicle_label text;
  action_label text;
begin
  select concat_ws(' - ', name, plate)
  into vehicle_label
  from nudge_fleet.vehicles
  where id = new.vehicle_id;

  action_label := case
    when new.log_type = 'return' then 'checked back in'
    else 'checked out'
  end;

  insert into nudge_fleet.alert_events (
    alert_type,
    vehicle_id,
    log_id,
    subject,
    payload
  )
  values (
    'vehicle_log',
    new.vehicle_id,
    new.id,
    concat('Nudge Fleet: ', coalesce(new.employee_name, 'Driver'), ' ', action_label),
    jsonb_build_object(
      'vehicle_id', new.vehicle_id,
      'vehicle', coalesce(nullif(vehicle_label, ''), new.vehicle_id::text),
      'log_type', new.log_type,
      'employee_name', new.employee_name,
      'mileage', new.mileage,
      'notes', new.notes,
      'created_at', new.created_at
    )
  );

  return new;
end;
$$;

drop trigger if exists queue_vehicle_log_alert_trigger on nudge_fleet.vehicle_logs;
create trigger queue_vehicle_log_alert_trigger
after insert on nudge_fleet.vehicle_logs
for each row execute function nudge_fleet.queue_vehicle_log_alert();

create or replace view nudge_fleet.fleet_maintenance_alert_items as
select *
from nudge_fleet.vehicle_maintenance_status
where status in ('due', 'soon', 'no_history')
order by
  case status
    when 'due' then 1
    when 'soon' then 2
    when 'no_history' then 3
    else 4
  end,
  vehicle_name,
  service_name;

create or replace function nudge_fleet.fleet_maintenance_email_summary()
returns jsonb
language sql
stable
security definer
set search_path = nudge_fleet, public
as $$
  select jsonb_build_object(
    'due', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.vehicle_name, item.service_name)
      from nudge_fleet.fleet_maintenance_alert_items item
      where item.status = 'due'
    ), '[]'::jsonb),
    'soon', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.vehicle_name, item.service_name)
      from nudge_fleet.fleet_maintenance_alert_items item
      where item.status = 'soon'
    ), '[]'::jsonb),
    'no_history', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.vehicle_name, item.service_name)
      from nudge_fleet.fleet_maintenance_alert_items item
      where item.status = 'no_history'
    ), '[]'::jsonb)
  );
$$;

create or replace function nudge_fleet.mark_alert_reviewed(alert_id uuid)
returns boolean
language plpgsql
security definer
set search_path = nudge_fleet, public
as $$
begin
  if not nudge_fleet.current_user_is_owner() then
    raise exception 'Not authorized for fleet dashboard';
  end if;

  update nudge_fleet.alert_events
  set status = 'reviewed',
      sent_at = now(),
      error = null
  where id = alert_id
    and status = 'pending';

  return found;
end;
$$;

create or replace function nudge_fleet.log_vehicle_maintenance_service(
  p_vehicle_id uuid,
  p_service_name text,
  p_service_date date,
  p_mileage integer default null,
  p_performed_by text default null,
  p_cost numeric default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = nudge_fleet, public
as $$
declare
  new_event_id uuid;
begin
  if not nudge_fleet.current_user_is_owner() then
    raise exception 'Not authorized for fleet dashboard';
  end if;

  if p_vehicle_id is null then
    raise exception 'Vehicle is required';
  end if;

  if nullif(trim(p_service_name), '') is null then
    raise exception 'Service name is required';
  end if;

  insert into nudge_fleet.vehicle_maintenance_events (
    vehicle_id,
    service_name,
    service_date,
    mileage,
    performed_by,
    cost,
    notes
  )
  values (
    p_vehicle_id,
    trim(p_service_name),
    coalesce(p_service_date, current_date),
    p_mileage,
    nullif(trim(p_performed_by), ''),
    p_cost,
    nullif(trim(p_notes), '')
  )
  returning id into new_event_id;

  return new_event_id;
end;
$$;

create or replace function nudge_fleet.fleet_dashboard_summary(range_days integer default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path = nudge_fleet, public
as $$
declare
  dashboard_payload jsonb;
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
    ),
    'alerts', (
      select coalesce(jsonb_agg(to_jsonb(alert) order by alert.created_at desc), '[]'::jsonb)
      from (
        select alert.id, alert.alert_type, alert.vehicle_id, alert.log_id, alert.subject, alert.payload, alert.status, alert.created_at
        from nudge_fleet.alert_events alert
        where alert.status in ('pending', 'failed')
           or (
             range_days is not null
             and alert.created_at >= now() - make_interval(days => range_days)
           )
        order by
          case alert.status
            when 'pending' then 1
            when 'failed' then 2
            else 3
          end,
          alert.created_at desc
        limit 100
      ) alert
    ),
    'service_history', (
      select coalesce(jsonb_agg(to_jsonb(event) order by event.service_date desc, event.created_at desc), '[]'::jsonb)
      from (
        select id, vehicle_id, service_name, service_date, mileage, performed_by, cost, notes, created_at
        from nudge_fleet.vehicle_maintenance_events
        order by service_date desc, created_at desc
        limit 100
      ) event
    )
  ) into dashboard_payload;

  return dashboard_payload;
end;
$$;

create or replace function nudge_fleet.seed_highlander_100k_baseline(service_date date default current_date)
returns integer
language plpgsql
security definer
set search_path = nudge_fleet, public
as $$
declare
  inserted_count integer;
begin
  insert into nudge_fleet.vehicle_maintenance_events (
    vehicle_id,
    service_name,
    service_date,
    mileage,
    performed_by,
    notes
  )
  select
    rule.vehicle_id,
    rule.service_name,
    service_date,
    100000,
    'Legacy maintenance-event import',
    'Legacy maintenance-event import retained for older dashboards. Use vehicle_service_records for Toyota invoice details.'
  from nudge_fleet.vehicle_maintenance_rules rule
  join nudge_fleet.vehicles vehicle on vehicle.id = rule.vehicle_id
  where lower(coalesce(vehicle.name, '')) like '%highlander%'
    and not exists (
      select 1
      from nudge_fleet.vehicle_maintenance_events event
      where event.vehicle_id = rule.vehicle_id
        and event.service_name = rule.service_name
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

select nudge_fleet.seed_highlander_100k_baseline(current_date);

revoke all on function nudge_fleet.fleet_maintenance_email_summary() from public;
revoke all on function nudge_fleet.seed_highlander_100k_baseline(date) from public;
revoke all on function nudge_fleet.queue_vehicle_log_alert() from public;
revoke all on function nudge_fleet.mark_alert_reviewed(uuid) from public;
revoke all on function nudge_fleet.log_vehicle_maintenance_service(uuid, text, date, integer, text, numeric, text) from public;
revoke all on function nudge_fleet.fleet_dashboard_summary(integer) from public;
grant execute on function nudge_fleet.fleet_maintenance_email_summary() to authenticated;
grant execute on function nudge_fleet.fleet_maintenance_email_summary() to service_role;
grant execute on function nudge_fleet.mark_alert_reviewed(uuid) to authenticated;
grant execute on function nudge_fleet.log_vehicle_maintenance_service(uuid, text, date, integer, text, numeric, text) to authenticated;
grant execute on function nudge_fleet.fleet_dashboard_summary(integer) to authenticated;
