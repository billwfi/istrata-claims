# NBM Workflow Context

Date: 2026-06-10

This repo is the provider-facing entry point for the NBM RX workflow. The current branch adds the local/provider path for selecting eligibility patients, selecting NBM product-master products, and submitting RX orders into the `NBM` SQL database.

## Local Test Access

- Claims app: `http://127.0.0.1:3000`
- Login: `http://127.0.0.1:3000/login`
- RX test page: `http://127.0.0.1:3000/locations/seed-location-1/rx/new`
- Local test user: `admin@istrata.com`

The test password is intentionally not documented here. Use the local project handoff notes or environment owner for credentials.

## Eligibility Lookup

The RX form now calls `/api/patients?includeNbmEligibility=1` so it can search live NBM eligibility in addition to local patient data. The source priority is:

1. `iStrata.dbo.vw_NBM_Full_Eligibility`
2. `NBM.dbo.nbm_full_eligibility` copied/test fallback rows

Live eligibility rows are returned with ids in this format:

```text
nbm-live-eligibility-{encoded-source-key}
```

As of 2026-06-11, the live `source-key` is a SHA-256 hash of a composite member identity from the live view (`groupid`, `Employee ID`, `Customer Account Number`, `profileid`, `insuranceid`, and `DOB`). Do not use `Customer Account Number` by itself for this key: it is not unique across all active rows and can cause an Initial RX submit to resolve a different eligibility row than the one selected in search.

Copied/test fallback eligibility rows keep the original id format:

```text
nbm-eligibility-{id}
```

When an NBM eligibility patient is selected, the RX form autofills:

- patient email
- patient phone
- shipping address
- city/state/ZIP

The patient search route only includes NBM eligibility rows when `includeNbmEligibility=1`, so the legacy claims form can continue using the local patient list without automatically mixing in NBM eligibility data. The lookup does not select or return SSN values from the live eligibility view.

## RX Submission

`app/api/locations/[id]/rx-orders/route.ts` now detects both `nbm-live-eligibility-*` and `nbm-eligibility-*` patient ids. Live rows resolve from `iStrata.dbo.vw_NBM_Full_Eligibility`; copied/test rows resolve from `NBM.dbo.nbm_full_eligibility` before inserting the order into NBM tables.

The provider-facing claims form now follows the same NBM order shape as the management app:

- NBM category is fixed to `Initial RX`
- delivery method is limited to `Local` or `Mail`
- therapy type is no longer captured in the claims workflow
- bottle count is always stored as `1`
- product-derived fields are read-only in the form
- refill-specific fields and calculated refill dates are hidden from providers
- the API calculates refill dates server-side when the browser does not send them

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

Downstream management-app refill handling now adds:

- `dbo.nbm_refill_tasks`
- `dbo.nbm_payment_requests`
- `dbo.nbm_payment_events`

The claims app should continue submitting provider-facing `Initial RX` orders only. Refill task creation, hosted USIO payment-link generation, automatic refill payment email queueing, SMTP sending, and future USIO API/webhook reconciliation are owned by the management app.

## Program Rule / Contract Benefit Resolution

As of 2026-06-09, provider RX submission prepares for the live management contract-benefit model before it evaluates allocation, copay, and retail pricing.

When `app/api/locations/[id]/rx-orders/route.ts` submits an NBM order, it:

- resolves the selected NBM eligibility patient from live eligibility first or the copied/test eligibility fallback
- syncs active group contract-benefit rows from:
  - `iStrata.dbo.is_group_contracts`
  - `iStrata.dbo.is_contract_benefits`
- upserts those rows into `NBM.dbo.nbm_program_rules`
- resolves the program rule with `iStrata.is_contract_benefits` as the preferred source
- stores the resolved rule in `program_snapshot_json`

Current mapping:

- `is_group_contracts.ContractStartDate` -> rule effective date
- `is_group_contracts.ContractEndDate` -> rule end date
- `is_group_contracts.ContractStatus` -> active/inactive filtering
- `is_group_contracts.BillingCycle` -> billing frequency
- `is_contract_benefits` row where `benefit_type = 'NBM'`
  - `NBMType` -> naming/notes
  - `AnnualMaxAllowance` -> annual allocation
  - `CopayAmount` -> notes for now
- `is_contract_benefits` row where `benefit_type = 'PEPM'`
  - `PEPMRate` -> PEPM rate
  - `NBMFee` and `IStrataAdminFee` -> notes for now

Refill policy note:

- The live contract-benefits model now exposes `is_contract_benefits.RefillsAllowed`.
- The claims API maps that bit into `NBM.dbo.nbm_program_rules.refills_allowed` before provider RX submission is evaluated.
- `RefillsAllowed = 1` allows automatic refill task creation downstream.
- `RefillsAllowed = 0` prevents automatic refill task creation downstream.
- Existing `NULL` values default to allowed until reviewed.
- Program snapshots include `refillPolicySource = "contract_benefit_refills_allowed"` for explicit true/false values and `refillPolicySource = "contract_benefit_null_default_allowed"` for null defaults.

2026-06-10 live sync note:

- `NBM.dbo.nbm_program_rules` now contains 10 active snapshots from `iStrata.is_contract_benefits`.
- Provider-submitted initial orders should pick up explicit no-refill policies for groups where `RefillsAllowed = 0`.
- Groups with `RefillsAllowed = NULL` still default to allowed pending contract review.

## Product Lookup

The RX form product combobox searches the NBM product master through `/api/products`. Selecting a product autofills SKU, product form, copay, and retail cost where available.

## Email Notification Status

The claims app queues initial order notification records in `dbo.nbm_email_queue`; it does not send real email directly.

Current seeded rules include:

- `initial_refill_email`
- `three_day_refill_followup`
- `six_month_initial`

The management app now contains staged SMTP-ready refill payment email automation. Real SMTP sending remains disabled until SMTP environment variables are configured. Refill payment emails currently use the hosted USIO prefill URL; future USIO API/webhook payment confirmation should be reconciled in the management app.

## Test Row

A manual NBM eligibility test row exists in the shared NBM database for local testing. Search by the test email provided in the project handoff notes. The row is marked with `source_view = 'manual_test'` and `TEST-*` identifiers.

Do not put real patient data, SSNs, or database credentials into this document.

## Required SQL Environment

The NBM patient and product searches use `lib/nbm-sql.ts` and require these environment variables at runtime:

```text
MSSQL_SERVER=64.27.41.252
MSSQL_USER=claudeservices
MSSQL_PASSWORD=<get-from-project-owner>
NBM_MSSQL_DATABASE=NBM
```

Set these in `.env.local` for local testing or in the host environment for deployments. Do not commit real database credentials.

If `MSSQL_PASSWORD` is not set, the RX order page prompts the signed-in user for the NBM database password before patient and product lookups run. The entered password is validated server-side and stored in an encrypted HTTP-only browser-session cookie.
