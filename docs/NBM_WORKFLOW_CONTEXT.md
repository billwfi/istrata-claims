# NBM Workflow Context

Date: 2026-06-03

This repo is the provider-facing entry point for the NBM RX workflow. The current branch adds the local/provider path for selecting eligibility patients, selecting NBM product-master products, and submitting RX orders into the `NBM` SQL database.

## Local Test Access

- Claims app: `http://127.0.0.1:3000`
- Login: `http://127.0.0.1:3000/login`
- RX test page: `http://127.0.0.1:3000/locations/seed-location-1/rx/new`
- Local test user: `admin@istrata.com`

The test password is intentionally not documented here. Use the local project handoff notes or environment owner for credentials.

## Eligibility Lookup

The RX form now calls `/api/patients?includeNbmEligibility=1` so it can search `NBM.dbo.nbm_full_eligibility` in addition to local patient data. NBM eligibility rows are returned with ids in this format:

```text
nbm-eligibility-{id}
```

When an NBM eligibility patient is selected, the RX form autofills:

- patient email
- patient phone
- shipping address
- city/state/ZIP

The patient search route only includes NBM eligibility rows when `includeNbmEligibility=1`, so the legacy claims form can continue using the local patient list without automatically mixing in NBM eligibility data.

## RX Submission

`app/api/locations/[id]/rx-orders/route.ts` now detects `nbm-eligibility-*` patient ids and resolves the patient from `NBM.dbo.nbm_full_eligibility` before inserting the order into NBM tables.

NBM RX orders store these eligibility-related fields when available:

- `eligibility_object_id`
- `patient_employee_id`
- `patient_member_id`
- `group_id`
- `group_name`

The order insert continues to create:

- `dbo.nbm_rx_orders`
- `dbo.nbm_rx_order_items`
- `dbo.nbm_rx_status_history`
- `dbo.nbm_workflow_events`
- `dbo.nbm_email_queue`

## Product Lookup

The RX form product combobox searches the NBM product master through `/api/products`. Selecting a product autofills SKU, therapy type, product form, copay, and retail cost where available.

## Email Notification Status

The current implementation queues email notifications in `dbo.nbm_email_queue`; it does not send real email yet.

Current seeded rules include:

- `initial_refill_email`
- `three_day_refill_followup`
- `six_month_initial`

A future email sender should process due `pending` rows, send through an approved SMTP/API provider, then mark rows `sent` or `failed` and write workflow events.

## Test Row

A manual NBM eligibility test row exists in the shared NBM database for local testing. Search by the test email provided in the project handoff notes. The row is marked with `source_view = 'manual_test'` and `TEST-*` identifiers.

Do not put real patient data, SSNs, or database credentials into this document.
