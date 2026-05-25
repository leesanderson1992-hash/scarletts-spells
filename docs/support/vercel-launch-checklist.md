# Vercel Launch Checklist

## Purpose

This file is the operational checklist for launching Scarlett's Spells through GitHub -> Vercel production.

Use it when:
- connecting the GitHub repo to Vercel
- configuring production environment variables
- confirming Supabase-backed parent login works on both localhost and
  production

## Repo requirements

- `.env.local` stays local only and is not committed
- `.env.example` documents the required public environment variables
- `.tmp/` output is ignored and not part of the release boundary
- `main` is the production branch

## Required Vercel environment variables

Set these in Vercel Production:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Set the same values in Preview if preview logins are required.

## Required Supabase URL configuration

Add these URLs in Supabase Auth settings before launch.

### Local

- `http://localhost:3000`
- `http://localhost:3000/auth/callback`

### Production

- `https://<your-vercel-production-domain>`
- `https://<your-vercel-production-domain>/auth/callback`

### Preview

If you want Vercel preview deployments to support login, add the preview domain pattern or each preview callback URL according to the current Supabase auth rules in your project.

## GitHub -> Vercel production flow

1. Connect the GitHub repository to Vercel.
2. Set the production branch to `main`.
3. Add the environment variables in Vercel.
4. Confirm a production deploy builds successfully.
5. Confirm parent login succeeds on the production URL.
6. Confirm the release slice being pushed is intentional, reviewed, and
   isolated from unrelated local work.

## Supabase migration safety

- Hosted production schema is currently behaviour-correct for recent Writing
  Engine work, but the Supabase migration ledger is not aligned with the local
  historical migration directory.
- `supabase_migrations.schema_migrations` currently contains only
  `20260421/add_false_positive_to_misspelling_instances`.
- Historical local migrations use duplicate date-only versions and must not be
  replayed with `supabase db push`.
- Do not run blind migration repair for duplicate versions.
- Do not casually rename historical migration files.
- Treat hosted production as a manually reconciled baseline for existing
  historical migrations.
- Future DB migrations must use unique timestamp versions:
  `YYYYMMDDHHMMSS_description.sql`.
- Every DB-changing release slice must declare one deployment method:
  `code-only`, `unique forward migration`, `manual SQL patch`, or
  `baseline/reconciliation`.
- Production DB deployment requires an explicit migration-ledger check before
  applying any migration.

## Current release-readiness caution

- `main` is the production branch and `git push origin main` is the live
  release path.
- The repo may still be in a dirty local state when this checklist is read.
- Do not blindly push the whole current worktree just because it builds
  locally.
- Before a production push:
  - isolate the intended release slice
  - review the diff intentionally
  - confirm no unrelated experiments, stale docs, test artifacts, or support
    files are being shipped accidentally

## Launch validation

### Build checks

- `npx tsc --noEmit`
- `npm run build`

### Auth checks

- sign in through `/login` with the intended production parent credentials
- confirm the session reaches `/dashboard`
- confirm the session persists after redirect
- protected routes redirect unauthenticated users back to `/login`
- if a Supabase callback flow is used by the deployment, confirm
  `/auth/callback` still returns to an authenticated dashboard session

### Product checks

- child mode shows only `This Week`, `My Learning`, `My Progress`
- child access to `/practice`, `/review`, and `/assignments` redirects away
- parent navigation groups still render correctly
- Add Writing Sample remains intake only and hands off to Review Work
- Review Work queue/detail/verification/archive flows remain coherent
- dashboard and insights language remains advisory where evidence is still
  immature
- if the release includes `4E.3`, confirm it is either code-only against
  already-present hosted tables/RPCs or uses a new unique timestamp migration
  with an approved deployment process

## Live release command

Once Vercel is connected and configured, the live release path is:

```bash
git push origin main
```

That push updates GitHub, and Vercel deploys production automatically.
