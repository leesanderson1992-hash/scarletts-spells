# Browser + Supabase QA

This directory contains focused browser + Supabase checks for implementation
passes that need real parent login, real page navigation, and direct database
verification.

The current stage-specific spec is:
- `tests/e2e/add-writing-sample.spec.mjs`

The reusable support layer lives in:
- `tests/e2e/support/local-supabase.mjs`
- `tests/e2e/support/load-env.mjs`
- `tests/e2e/support/e2e-health.mjs`

## Safety rules

- The app URL must always be local:
  - `http://localhost:3000`
  - `http://127.0.0.1:<port>`
- Supabase defaults to local-only safety.
- Hosted Supabase is blocked unless you explicitly opt in for a non-production
  test project by setting both:
  - `E2E_ALLOW_HOSTED_SUPABASE=1`
  - `E2E_SUPABASE_PROJECT_REF=<expected-project-ref>`
- Production Supabase must not be used for Codex browser + service-role QA.
- Production service role keys must never be committed, pasted into source
  files, or stored in repo-tracked config.

## Environment types

### Local Supabase

Use this when possible.

Characteristics:
- safest default
- easiest to seed freely
- best fit for destructive or repeatable QA setup

Expected config shape:

```bash
E2E_BASE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Hosted staging Supabase

Use this only for a dedicated non-production project.

Characteristics:
- acceptable when local Supabase is unavailable
- requires explicit opt-in
- must be scoped to known QA users and records

Required extra guardrails:

```bash
E2E_ALLOW_HOSTED_SUPABASE=1
E2E_SUPABASE_PROJECT_REF=your-project-ref
```

### Production Supabase

Do not use for this harness.

Reasons:
- browser + service-role tests can seed, update, or delete scoped data
- service-role access is too powerful for production QA automation
- Codex runs should prefer local or staging environments

## Env files

Example template:
- `tests/e2e/.env.e2e.example`

Ignored local env files:
- `tests/e2e/.env.e2e`
- `tests/e2e/.env.e2e.local`
- `.env.test.local`

Load order for the reusable health check:
1. `.env.local`
2. `.env.test.local`
3. `tests/e2e/.env.e2e`
4. `tests/e2e/.env.e2e.local`
5. existing shell environment values override file-loaded values

Recommended practice:
- keep app runtime values in `.env.local` if that is already how the app runs
- keep QA-only credentials and overrides in `tests/e2e/.env.e2e.local`
- never commit real values

## Required variables

- `E2E_BASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `E2E_PARENT_EMAIL`
- `E2E_PARENT_PASSWORD`

Optional safety variables for hosted staging:
- `E2E_ALLOW_HOSTED_SUPABASE`
- `E2E_SUPABASE_PROJECT_REF`

## Reusable health check

Run this before any stage-specific browser + Supabase pass:

```bash
npm run e2e:health
```

What it verifies:
- required E2E env vars are present
- `E2E_BASE_URL` is reachable at `/login`
- Supabase admin access is usable through the provided service-role key
- test parent credentials can sign in with password
- the scoped test child exists or can be created
- Playwright Chromium can launch and reach `/login`

The health check never prints secret values.

## Stage-specific runs

Current example:

```bash
npm run e2e:add-writing-sample
```

The current Stage 7A spec verifies:
- parent login through the real `/login` page
- Add Writing Sample renders as intake-only
- submit redirects or hands off to `/courses/review`
- canonical `writing_samples` row is created
- shared analysis output exists where expected
- forbidden tables do not change

## Codex QA checklist

Use this checklist for future browser + Supabase implementation passes:

1. Run `npm run e2e:health`.
2. Run the stage-specific E2E script.
3. Verify the expected rows for the current pass.
4. Verify forbidden tables did not change.
5. Report the exact commands used.
6. Report which environment was used:
   - local Supabase
   - hosted staging Supabase
7. Confirm no production credentials were committed or printed.

## Example setup

Local app + local Supabase:

```bash
cp tests/e2e/.env.e2e.example tests/e2e/.env.e2e.local
```

Then fill in local non-committed values and run:

```bash
npm run e2e:health
npm run e2e:add-writing-sample
```

Local app + hosted staging Supabase:

```bash
cp tests/e2e/.env.e2e.example tests/e2e/.env.e2e.local
```

Then fill in non-committed staging values, set:
- `E2E_ALLOW_HOSTED_SUPABASE=1`
- `E2E_SUPABASE_PROJECT_REF=<staging-project-ref>`

And run:

```bash
npm run e2e:health
npm run e2e:add-writing-sample
```
