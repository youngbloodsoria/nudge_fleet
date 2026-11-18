-- The deployed submit function uses this default for every checkout/return.
-- AT TIME ZONE 'mst' stripped the zone and stored a clock seven hours behind UTC.
-- Photo/incident timestamps already use now() and must not be shifted.
begin;
lock table nudge_fleet.vehicle_logs in access exclusive mode;

create table if not exists nudge_fleet.vehicle_log_timestamp_backup (
  log_id uuid primary key,
  original_created_at timestamptz not null,
  corrected_created_at timestamptz not null,
  repaired_at timestamptz not null default now()
);
alter table nudge_fleet.vehicle_log_timestamp_backup enable row level security;
revoke all on nudge_fleet.vehicle_log_timestamp_backup from public, anon, authenticated;

do $$
declare current_default text;
begin
  select column_default into current_default
  from information_schema.columns
  where table_schema = 'nudge_fleet' and table_name = 'vehicle_logs' and column_name = 'created_at';
  if current_default = 'now()' then
    return; -- Already repaired; do not shift existing or newly submitted rows again.
  end if;
  if current_default is distinct from '(now() AT TIME ZONE ''mst''::text)' then
    raise exception 'Unexpected vehicle_logs timestamp default: %', current_default;
  end if;
  -- Abort if independent upload timestamps contradict the seven-hour offset.
  if exists (
    select 1 from nudge_fleet.vehicle_logs l
    join lateral (
      select min(created_at) as uploaded_at from nudge_fleet.vehicle_log_photos where log_id = l.id
    ) p on p.uploaded_at is not null
    where p.uploaded_at - l.created_at not between interval '7 hours' and interval '7 hours 10 minutes'
  ) then
    raise exception 'Photo timestamps do not match the expected offset; audit before repairing.';
  end if;
  insert into nudge_fleet.vehicle_log_timestamp_backup (log_id, original_created_at, corrected_created_at)
  select id, created_at, created_at + interval '7 hours' from nudge_fleet.vehicle_logs;
  update nudge_fleet.vehicle_logs l
  set created_at = b.corrected_created_at
  from nudge_fleet.vehicle_log_timestamp_backup b
  where l.id = b.log_id and l.created_at = b.original_created_at;
  alter table nudge_fleet.vehicle_logs alter column created_at set default now();
end;
$$;
commit;
