# Vercel Launch Checklist

## Purpose

This file is the operational checklist for launching Scarlett's Spells through GitHub -> Vercel production.

Use it when:
- connecting the GitHub repo to Vercel
- configuring production environment variables
- confirming Supabase magic-link login works on both localhost and production

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
5. Confirm the magic-link flow succeeds on the production URL.

## Launch validation

### Build checks

- `npx tsc --noEmit`
- `npm run build`

### Auth checks

- request magic link from `/login`
- email link returns to `/auth/callback?next=/dashboard`
- callback redirects to `/dashboard`
- session persists after redirect
- protected routes redirect unauthenticated users back to `/login`

### Product checks

- child mode shows only `This Week`, `My Learning`, `My Progress`
- child access to `/practice`, `/review`, and `/assignments` redirects away
- parent navigation groups still render correctly

## Live release command

Once Vercel is connected and configured, the live release path is:

```bash
git push origin main
```

That push updates GitHub, and Vercel deploys production automatically.
