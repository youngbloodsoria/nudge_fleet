-- Vehicle service history module and Toyota Highlander history import.
-- Run after the existing Nudge Fleet setup SQL.

create schema if not exists nudge_fleet;
set search_path = nudge_fleet, public;

alter table nudge_fleet.vehicles add column if not exists year integer;
alter table nudge_fleet.vehicles add column if not exists make text;
alter table nudge_fleet.vehicles add column if not exists model text;
alter table nudge_fleet.vehicles add column if not exists vin text;
alter table nudge_fleet.vehicles add column if not exists current_mileage integer;

create unique index if not exists vehicles_vin_unique_idx
  on nudge_fleet.vehicles (vin)
  where vin is not null;

create table if not exists nudge_fleet.vehicle_service_records (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references nudge_fleet.vehicles(id) on delete cascade,
  service_date date not null,
  mileage integer,
  vendor text,
  dealer_code text,
  ro_number text,
  ro_total numeric(12,2),
  customer_paid numeric(12,2),
  dealer_internal_paid numeric(12,2),
  warranty_paid numeric(12,2),
  goodwill_paid numeric(12,2),
  category text not null,
  service_title text not null,
  service_description text,
  parts_summary text,
  technician text,
  service_advisor text,
  pay_type text,
  source_document text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists nudge_fleet.vehicle_service_documents (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references nudge_fleet.vehicles(id) on delete cascade,
  service_record_id uuid references nudge_fleet.vehicle_service_records(id) on delete set null,
  storage_path text not null,
  document_type text default 'service_history_page',
  page_number integer,
  uploaded_at timestamptz default now()
);

create table if not exists nudge_fleet.vehicle_maintenance_schedule (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references nudge_fleet.vehicles(id) on delete cascade,
  task_name text not null,
  category text,
  interval_miles integer,
  interval_months integer,
  last_completed_mileage integer,
  last_completed_date date,
  next_due_mileage integer,
  next_due_date date,
  status text default 'ok',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists vehicle_service_records_vehicle_date_idx
  on nudge_fleet.vehicle_service_records (vehicle_id, service_date);

create index if not exists vehicle_service_records_vehicle_mileage_idx
  on nudge_fleet.vehicle_service_records (vehicle_id, mileage);

create index if not exists vehicle_service_records_ro_number_idx
  on nudge_fleet.vehicle_service_records (ro_number);

create unique index if not exists vehicle_service_records_vehicle_ro_date_unique_idx
  on nudge_fleet.vehicle_service_records (vehicle_id, ro_number, service_date)
  where ro_number is not null;

create unique index if not exists vehicle_service_records_fallback_unique_idx
  on nudge_fleet.vehicle_service_records (vehicle_id, service_date, coalesce(mileage, -1), service_title)
  where ro_number is null;

create index if not exists vehicle_service_documents_vehicle_idx
  on nudge_fleet.vehicle_service_documents (vehicle_id);

create index if not exists vehicle_maintenance_schedule_vehicle_task_idx
  on nudge_fleet.vehicle_maintenance_schedule (vehicle_id, task_name);

create unique index if not exists vehicle_maintenance_schedule_vehicle_task_unique_idx
  on nudge_fleet.vehicle_maintenance_schedule (vehicle_id, task_name);

create or replace function nudge_fleet.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_vehicle_service_records_updated_at on nudge_fleet.vehicle_service_records;
create trigger set_vehicle_service_records_updated_at
before update on nudge_fleet.vehicle_service_records
for each row execute function nudge_fleet.set_updated_at();

drop trigger if exists set_vehicle_maintenance_schedule_updated_at on nudge_fleet.vehicle_maintenance_schedule;
create trigger set_vehicle_maintenance_schedule_updated_at
before update on nudge_fleet.vehicle_maintenance_schedule
for each row execute function nudge_fleet.set_updated_at();

alter table nudge_fleet.vehicle_service_records enable row level security;
alter table nudge_fleet.vehicle_service_documents enable row level security;
alter table nudge_fleet.vehicle_maintenance_schedule enable row level security;

revoke all on nudge_fleet.vehicle_service_records from anon, authenticated;
revoke all on nudge_fleet.vehicle_service_documents from anon, authenticated;
revoke all on nudge_fleet.vehicle_maintenance_schedule from anon, authenticated;
grant all on nudge_fleet.vehicle_service_records to service_role;
grant all on nudge_fleet.vehicle_service_documents to service_role;
grant all on nudge_fleet.vehicle_maintenance_schedule to service_role;

insert into nudge_fleet.vehicles (name, plate, year, make, model, vin, current_mileage)
select
  '2016 White Toyota Highlander',
  '8AMP246',
  2016,
  'Toyota',
  'Highlander Hybrid Limited Platinum AWD',
  '5TDDCRFH1GS019965',
  103293
where not exists (
  select 1
  from nudge_fleet.vehicles
  where vin = '5TDDCRFH1GS019965'
     or plate = '8AMP246'
     or lower(name) like '%highlander%'
);

update nudge_fleet.vehicles
set name = coalesce(nullif(name, ''), '2016 White Toyota Highlander'),
    plate = coalesce(nullif(plate, ''), '8AMP246'),
    year = coalesce(year, 2016),
    make = coalesce(make, 'Toyota'),
    model = coalesce(model, 'Highlander Hybrid Limited Platinum AWD'),
    vin = coalesce(vin, '5TDDCRFH1GS019965'),
    current_mileage = greatest(coalesce(current_mileage, 0), 103293)
where vin = '5TDDCRFH1GS019965'
   or plate = '8AMP246'
   or lower(name) like '%highlander%';

with highlander as (
  select id
  from nudge_fleet.vehicles
  where vin = '5TDDCRFH1GS019965'
     or plate = '8AMP246'
     or lower(name) like '%highlander%'
  order by created_at
  limit 1
),
records(service_date, mileage, vendor, dealer_code, ro_number, ro_total, customer_paid, dealer_internal_paid, warranty_paid, category, service_title, service_description, parts_summary, pay_type, source_document, notes) as (
  values
    ('2016-09-22'::date, 2, 'Toyota', '04106', '0242916', 0, 0, null, 0, 'Inspection', 'Pre-delivery inspection', 'Performed Toyota pre-delivery inspection. Check engine light noted. Code P1422 small EVAP leak at gas cap. Gas cap tightened, test run, vehicle passed monitor.', null, 'Warranty / Dealer', 'Toyota service history pages', null),
    ('2017-02-27'::date, 2869, 'Toyota', null, '0256437', 0, 0, null, null, 'Inspection', 'Tire pressure check', 'Checked and adjusted tire pressure.', null, null, 'Toyota service history pages', null),
    ('2017-04-19'::date, 4889, 'Toyota', null, '0261025', 0, 0, 0, null, 'Maintenance', '5,000 mile service', '5,000 mile service. No oil change. Front and rear brakes inspected, tire rotation, adjusted pressure, inspected vehicle, reset maintenance lamp, car wash.', null, 'Internal dealer pay', 'Toyota service history pages', null),
    ('2017-07-10'::date, 6288, 'Toyota', null, '0264357', 0, 0, 0, null, 'Body / Repair', 'Body/cosmetic repair', 'Exterior/body-related parts replaced including wheel cladding, fender plate, rear door moldings, mudguard, weatherstrip, tape, rivets, and related trim components.', 'Wheel cladding, fender plate, rear door moldings, mudguard, weatherstrip, tape, rivets, trim components.', 'Internal dealer pay', 'Toyota service history pages', 'Appears to be warranty/internal body or cosmetic repair. Preserve as body/repair, not routine maintenance.'),
    ('2017-11-24'::date, 6299, 'Toyota', null, '0277781', 0, 0, 0, null, 'Accessory', 'All-weather floor mats installed', 'Installed Toyota all-weather mats / Highlander tub mats.', 'Toyota all-weather mats / Highlander tub mats.', 'Internal dealer pay', 'Toyota service history pages', null),
    ('2017-12-14'::date, 7437, 'Toyota', null, '0280543', 0, 0, null, 0, 'Repair', 'Driver memory seat repair', 'Customer stated memory buttons on driver door did not work. Found loose connecting pin wire at body ECU coming from #1. Refitted pin into connector and feature operated as designed.', null, 'Warranty', 'Toyota service history pages', null),
    ('2018-03-27'::date, 9989, 'Toyota', null, '0288622', 0, 0, null, null, 'Maintenance', '10,000 mile Toyota Care service', 'Engine oil and filter change, tire rotation, complete multi-point inspection under Toyota Care.', null, 'Toyota Care', 'Toyota service history pages', null),
    ('2018-10-25'::date, 14722, 'Toyota', null, '0304907', 0, 0, null, null, 'Maintenance', '15,000 mile Toyota Care service', 'Tire rotation, multi-point inspection, cabin air filter cleaning, brake measurements.', null, 'Toyota Care', 'Toyota service history pages', null),
    ('2019-03-25'::date, 19883, 'Toyota', null, '0316357', 0, 0, null, null, 'Maintenance', '20,000 mile Toyota Care service', 'Engine oil and filter change, tire rotation, complete multi-point inspection.', null, 'Toyota Care', 'Toyota service history pages', null),
    ('2019-10-19'::date, 25310, 'Toyota', null, '0331886', 0, 0, null, null, 'Maintenance', '25,000 mile Toyota Care service', 'Tire rotation and multi-point inspection under Toyota Care.', null, 'Toyota Care', 'Toyota service history pages', null),
    ('2020-10-22'::date, 35684, 'Toyota', null, '071021C', 300.00, 300.00, 52.73, null, 'Maintenance', '30,000 mile service', 'Synthetic oil and filter change, tire rotation, multi-point inspection, cabin air filter replacement, engine air filter replacement.', 'Cabin air filter and engine air filter replacement.', 'Customer paid', 'Toyota service history pages', 'Related RO 071021 may show $52.73 internal/dealer paid oil service detail. Do not double count customer total if both RO records exist.'),
    ('2021-04-13'::date, 42922, 'Toyota', null, '0082099', 180.00, 180.00, null, null, 'Maintenance', '40,000 mile service', 'Synthetic oil and filter change, tire rotation, brake inspection, multi-point inspection, key fob battery replacement, floor mat check, tire pressure set.', 'Key fob battery.', 'Customer paid', 'Toyota service history pages', null),
    ('2021-08-20'::date, 50564, 'Toyota', null, '0091716', 280.00, 280.00, null, null, 'Maintenance', '50,000 mile service', 'Oil and filter change, tire rotation, brake inspection, engine air filter replacement, cabin air filter replacement, brake fluid exchange.', 'Engine air filter, cabin air filter, brake fluid exchange.', 'Customer paid', 'Toyota service history pages', 'Customer paid appears as about 259.08 to 280.00 across pages. RO total used as primary to avoid double counting duplicate condition totals.'),
    ('2022-04-21'::date, 58187, 'Toyota', null, '0108738', 42.26, 42.26, 260.08, null, 'Maintenance', 'Oil service and radio update', 'Oil change / lifetime oil change with service at no charge. Radio update. Tire pressure inspection.', null, 'Customer paid / internal routing', 'Toyota service history pages', 'Related RO 108738C total 260.08 appears to be moved-line/internal dealer routing. Preserved in dealer/internal amount but customer total remains 42.26 to avoid duplicate inflated cost.'),
    ('2023-01-21'::date, 63915, 'Toyota', null, '0406619', 133.02, 133.02, null, null, 'Maintenance', '65,000 mile service', 'Multi-point inspection, tire pressure check, tire rotation, brake inspection, battery check, oil change/service.', null, 'Customer paid', 'Toyota service history pages', null),
    ('2026-01-12'::date, 99998, 'Toyota', null, '0487679', 970.82, 970.82, null, null, 'Major Service', '100,000 mile major service', 'Basic synthetic oil and filter change, engine coolant exchange, hybrid inverter coolant replacement/check, hybrid transmission fluid exchange, multi-point inspection.', 'Oil and filter change $70.97; engine cooling system fluid exchange $299.95; hybrid inverter coolant service $299.95; hybrid transmission fluid exchange $299.95.', 'Customer paid', 'Toyota service history pages', null)
)
insert into nudge_fleet.vehicle_service_records (
  vehicle_id,
  service_date,
  mileage,
  vendor,
  dealer_code,
  ro_number,
  ro_total,
  customer_paid,
  dealer_internal_paid,
  warranty_paid,
  category,
  service_title,
  service_description,
  parts_summary,
  pay_type,
  source_document,
  notes
)
select
  highlander.id,
  records.service_date,
  records.mileage,
  records.vendor,
  records.dealer_code,
  records.ro_number,
  records.ro_total,
  records.customer_paid,
  records.dealer_internal_paid,
  records.warranty_paid,
  records.category,
  records.service_title,
  records.service_description,
  records.parts_summary,
  records.pay_type,
  records.source_document,
  records.notes
from highlander
cross join records
where not exists (
  select 1
  from nudge_fleet.vehicle_service_records existing
  where existing.vehicle_id = highlander.id
    and existing.ro_number = records.ro_number
    and existing.service_date = records.service_date
);

with highlander as (
  select id
  from nudge_fleet.vehicles
  where vin = '5TDDCRFH1GS019965'
     or plate = '8AMP246'
     or lower(name) like '%highlander%'
  order by created_at
  limit 1
),
schedule(task_name, category, interval_miles, interval_months, last_completed_mileage, last_completed_date, notes) as (
  values
    ('Engine oil and filter', 'Maintenance', 5000, 6, 99998, '2026-01-12'::date, 'Oil/filter completed during 100,000 mile Toyota service.'),
    ('Tire rotation', 'Maintenance', 5000, 6, 63915, '2023-01-21'::date, 'Last explicit tire rotation found in Toyota history.'),
    ('Brake inspection', 'Inspection', 10000, 12, 63915, '2023-01-21'::date, 'Last explicit brake inspection found in Toyota history.'),
    ('Brake fluid', 'Maintenance', 30000, 36, 50564, '2021-08-20'::date, 'Brake fluid exchange completed at 50,000 mile service.'),
    ('Engine coolant', 'Maintenance', 50000, 60, 99998, '2026-01-12'::date, 'Engine cooling system fluid exchange completed at 100,000 mile service.'),
    ('Hybrid inverter coolant', 'Maintenance', 50000, 60, 99998, '2026-01-12'::date, 'Hybrid inverter coolant service completed at 100,000 mile service.'),
    ('Hybrid transmission fluid', 'Maintenance', 50000, 60, 99998, '2026-01-12'::date, 'Hybrid transmission fluid exchange completed at 100,000 mile service.'),
    ('Engine air filter', 'Maintenance', 30000, null, 50564, '2021-08-20'::date, 'Last known engine air filter replacement.'),
    ('Cabin air filter', 'Maintenance', 15000, 12, 50564, '2021-08-20'::date, 'Last known cabin air filter replacement.'),
    ('Spark plugs', 'Maintenance', null, null, null, null, 'Due around 120,000 miles. Not found completed in Toyota history.'),
    ('PCV valve', 'Maintenance', null, null, null, null, 'Due around 120,000 miles. Not found completed in Toyota history.'),
    ('12V battery', 'Inspection', null, 12, 63915, '2023-01-21'::date, 'Inspect annually; replace as needed.'),
    ('Tires', 'Inspection', null, null, null, null, 'Inspect every use; replace based on tread.'),
    ('Alignment', 'Inspection', null, null, null, null, 'As needed.'),
    ('Registration renewal', 'Administrative', null, 12, null, null, 'Annual manual date.'),
    ('Insurance renewal', 'Administrative', null, 12, null, null, 'Annual manual date.')
)
insert into nudge_fleet.vehicle_maintenance_schedule (
  vehicle_id,
  task_name,
  category,
  interval_miles,
  interval_months,
  last_completed_mileage,
  last_completed_date,
  next_due_mileage,
  next_due_date,
  status,
  notes
)
select
  highlander.id,
  schedule.task_name,
  schedule.category,
  schedule.interval_miles,
  schedule.interval_months,
  schedule.last_completed_mileage,
  schedule.last_completed_date,
  case
    when schedule.task_name in ('Spark plugs', 'PCV valve') then 120000
    when schedule.interval_miles is not null and schedule.last_completed_mileage is not null then schedule.last_completed_mileage + schedule.interval_miles
    else null
  end,
  case
    when schedule.interval_months is not null and schedule.last_completed_date is not null then (schedule.last_completed_date + make_interval(months => schedule.interval_months))::date
    else null
  end,
  case
    when schedule.task_name in ('Tires', 'Alignment', 'Registration renewal', 'Insurance renewal') then 'needs_setup'
    when schedule.task_name in ('Spark plugs', 'PCV valve') then 'ok'
    when schedule.interval_miles is not null
      and schedule.last_completed_mileage is not null
      and 103293 >= schedule.last_completed_mileage + schedule.interval_miles then 'overdue'
    when schedule.interval_months is not null
      and schedule.last_completed_date is not null
      and current_date >= (schedule.last_completed_date + make_interval(months => schedule.interval_months))::date then 'overdue'
    when schedule.interval_miles is not null
      and schedule.last_completed_mileage is not null
      and 103293 >= schedule.last_completed_mileage + schedule.interval_miles - 500 then 'due_soon'
    when schedule.interval_months is not null
      and schedule.last_completed_date is not null
      and current_date >= ((schedule.last_completed_date + make_interval(months => schedule.interval_months))::date - 30) then 'due_soon'
    else 'ok'
  end,
  schedule.notes
from highlander
cross join schedule
on conflict (vehicle_id, task_name) do update
set category = excluded.category,
    interval_miles = excluded.interval_miles,
    interval_months = excluded.interval_months,
    last_completed_mileage = excluded.last_completed_mileage,
    last_completed_date = excluded.last_completed_date,
    next_due_mileage = excluded.next_due_mileage,
    next_due_date = excluded.next_due_date,
    status = excluded.status,
    notes = excluded.notes;
