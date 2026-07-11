-- Incident resolution workflow for owner dashboard.

alter table nudge_fleet.vehicle_incidents
  add column if not exists is_resolved boolean not null default false,
  add column if not exists resolution_notes text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by text;

create index if not exists vehicle_incidents_unresolved_idx
  on nudge_fleet.vehicle_incidents (is_resolved, created_at desc);
