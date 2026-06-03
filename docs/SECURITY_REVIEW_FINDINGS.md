# Security Review Findings

Date: 2026-06-03

Scope reviewed:

- `istrata-claims`
- `management-app`
- `claims-app` local checkout

This was a read-only review. No source changes were made as part of the review.

## High Priority

### Hardcoded Live Credentials

Repo: `management-app`

Files:

- `scripts/glp1-initial-import.js`
- `scripts/sftp-explore.js`

Concern:

These scripts contain hardcoded database and SFTP credentials. Even if these scripts are not deployed, committed credentials should be treated as compromised.

Recommended fix:

- Rotate the affected database and SFTP credentials.
- Move all secrets to environment variables or a managed secret store.
- Remove committed secret values from the repository and consider history cleanup if appropriate.

### Provider Data Scope Gaps

Repo: `istrata-claims`

Files:

- `app/api/patients/route.ts`
- `app/api/locations/[id]/providers/route.ts`
- `app/api/locations/[id]/claims/route.ts`

Concern:

Several provider-facing APIs verify that a user is authenticated, but do not consistently verify that the user has access to the requested location or patient data before returning or creating records.

Recommended fix:

- Add a shared location-access guard for provider routes.
- Ensure every patient/provider/claim lookup is constrained by the authenticated user's allowed locations or affiliate.
- Return `403` before performing data queries when access is not confirmed.

### Management Write APIs Only Require Any Valid Token

Repo: `management-app`

Files:

- `netlify/functions/nbm-orders.js`
- Other CRUD functions under `netlify/functions/`

Concern:

Management write endpoints generally use `verifyToken(event)` but do not distinguish admin users from regular users. Any valid management JWT can potentially perform updates/deletes exposed by those functions.

Recommended fix:

- Decode and return JWT claims from auth verification.
- Add role/permission checks per operation.
- Require elevated permissions for status changes, deletes, imports, and configuration changes.

## Medium Priority

### Weak JWT/CORS Defaults In Management App

Repo: `management-app`

Files:

- `netlify/functions/_auth.js`
- `netlify/functions/auth.js`

Concern:

`_auth.js` falls back to a default JWT secret and uses wildcard CORS. `auth.js` includes a local test-login path that can activate if environment variables are missing or local/dev flags are enabled.

Recommended fix:

- Fail startup/auth if `JWT_SECRET` is missing outside local development.
- Restrict CORS origins for deployed environments.
- Make test-login support impossible in production builds/deploy contexts.
- Avoid returning raw server error details to clients.

### Provider Test Login And Dev Data Must Stay Local

Repo: `istrata-claims`

Files:

- `lib/auth.ts`
- `lib/dev-data.ts`

Concern:

The provider app has development fallback login and development data. This is useful locally, but dangerous if enabled in production.

Recommended fix:

- Ensure `ALLOW_TEST_LOGIN` is never set in production.
- Consider hard-failing if `ALLOW_TEST_LOGIN=1` and `NODE_ENV=production`.
- Consider moving test credentials to environment variables or a local-only seed flow.

### Unauthenticated Scheduled Sync Behavior

Repo: `management-app`

Files:

- `netlify/functions/glp1-sync.js`
- `netlify/functions/teams-calls-sync.js`

Concern:

These functions treat unauthenticated `POST` requests as scheduled runs. That may be intended for Netlify schedules, but public unauthenticated POSTs can trigger external SFTP/Graph work and database writes.

Recommended fix:

- Verify Netlify scheduled-function context if available.
- Otherwise require a separate schedule secret header/token.
- Rate limit or reject public unauthenticated POSTs.

## Dependency Findings

### `istrata-claims`

`npm audit --omit=dev` reported:

- 1 high vulnerability affecting the current Next.js version.
- 5 moderate vulnerabilities including Next.js/PostCSS/Prisma-related advisories.

Recommended fix:

- Upgrade Next.js to a patched 15.5.x version or newer compatible release.
- Re-run `npm audit --omit=dev` after upgrade.

### `management-app`

`npm audit --omit=dev` reported no production vulnerabilities.

## Other Notes

- SQL query usage generally appears parameterized in the reviewed server functions.
- `lib/nbm-sql.ts` in `istrata-claims` correctly prevents writes to any database other than `NBM`.
- `claims-app` appears to be only a placeholder README locally, with no meaningful application surface to review.
