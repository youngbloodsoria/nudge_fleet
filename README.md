# Nudge Fleet

SkyRun Brian Head company vehicle log, owner dashboard, and maintenance history tool.

## Deploy database updates

Run the SQL files in this order in the Supabase SQL Editor for the project that owns the `nudge_fleet` schema:

1. `supabase/reporting_and_maintenance.sql`
2. `supabase/owner_access.sql`
3. `supabase/alerts_and_100k_baseline.sql`
4. `supabase/migrations/0003_vehicle_service_history.sql`

The `0003` migration creates:

- `vehicle_service_records`
- `vehicle_service_documents`
- `vehicle_maintenance_schedule`

It also imports the known Toyota history for the 2016 White Toyota Highlander and seeds default upcoming maintenance tasks.

## Deploy Edge Functions

Deploy these Supabase Edge Functions:

```bash
supabase functions deploy vehicle_service_admin
supabase functions deploy vehicle_service_document_upload
```

Set these Edge Function secrets:

```bash
supabase secrets set ADMIN_PORTAL_KEY="your-long-admin-key"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
supabase secrets set SERVICE_DOCUMENT_BUCKET="service-documents"
```

Create a private Supabase Storage bucket named `service-documents` for receipts and Toyota service-history images.

## Admin portal

Open `dashboard.html`, sign in as an owner, then enter the `ADMIN_PORTAL_KEY` in the Maintenance History section. The key is stored only in browser local storage so it is not committed to the repo.

The Maintenance History section supports:

- Viewing Toyota service history chronologically
- Filtering by date, mileage, category, vendor, and RO number
- Adding service records
- Editing service records
- Attaching receipt/service photos
- Marking maintenance schedule tasks complete

## Importing maintenance history

The migration imports the current known Toyota service records using RO number and service date checks to prevent duplicates. If future Toyota pages are processed, keep these rules:

- Do not duplicate records by repeated imports.
- Use `vehicle_id + ro_number + service_date` when RO number exists.
- If RO number is missing, use `vehicle_id + service_date + mileage + service_title`.
- Preserve uncertainty in `notes`.
- Toyota service pages may include duplicate RO continuation pages or moved internal lines. Do not blindly sum condition-level totals when an RO total already exists.

## Adding future service records

Use the dashboard Maintenance History form:

1. Choose date, mileage, category, title, vendor, cost, and notes.
2. Save the record.
3. Attach the receipt or service image if available.
4. Mark related maintenance items complete when appropriate.

## QR vehicle log

The driver QR vehicle log remains `index.html`. It posts to the existing Supabase Edge Function and does not require owner login.
