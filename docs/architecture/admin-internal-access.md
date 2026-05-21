# Admin/Internal Access

## Purpose

This document defines the smallest safe admin/internal access model for
Scarlett's Spells before any admin route is implemented.

It is a private-MVP access contract for protected internal read/triage surfaces.
It exists so Slice `4C` catalog-review admin UI can be built without weakening
parent access, parent-scoped RLS, or Writing Engine taxonomy boundaries.

## Current Model

Existing Supabase login remains the only login.

Admin status is not a parent role and is not inferred from being signed in.
The app recognizes an admin only on the server by checking the authenticated
Supabase user against private environment allowlists:

- `ADMIN_USER_IDS`
- `ADMIN_EMAILS`

Prefer `ADMIN_USER_IDS` when the user id is known. `ADMIN_EMAILS` is acceptable
for the private MVP, but it is a convenience fallback rather than the long-term
authority model.

Admin allowlists must never use a `NEXT_PUBLIC_*` prefix and must never be
read by client components. There is no DB admin role table, Supabase custom
claims model, role-management UI, or separate admin login in this version.

## Route And Guard Convention

Admin pages live under `/admin`.

The first expected admin route is:

- `/admin/catalog-review`

`app/admin/layout.tsx` is the mandatory gate for admin pages. It must call a
shared server-only admin helper before rendering any child route.

Future admin APIs must live under `/api/admin/*` and must call the same admin
helper before querying data. API route handlers must not rely on the admin page
layout for authorization.

Proxy/middleware may protect `/admin` from anonymous access by redirecting to
`/login`, but proxy/middleware is not the admin authorization boundary. A
signed-in non-admin parent must still be blocked by the server-side admin
guard.

## Helper Boundaries

The future admin access helper should live at:

- `lib/admin/access.ts`

Expected helper responsibilities:

- read the current Supabase user using the existing server auth path
- return unauthenticated when no user is signed in
- authorize only users whose id or email appears in the private allowlist
- expose a `requireAdminUser()` style helper for layouts, admin route handlers,
  and admin-only server actions
- avoid leaking allowlist values or service-role configuration to the browser

The future service-role Supabase helper should live at:

- `lib/supabase/service-role.ts`

Expected service-role responsibilities:

- use `import "server-only"`
- read a private server-side service-role key, never a `NEXT_PUBLIC_*` key
- be imported only by admin server components, admin route handlers, or
  admin-only server actions after admin authorization has passed
- never be passed to client components

## RLS And Parent Isolation

Do not add admin RLS read policies for v1.

Parent-owned table policies remain scoped to:

`auth.uid() = parent_user_id`

Admin cross-parent reads may happen only through server-only service-role access
after `requireAdminUser()` passes. Normal parent routes, server actions, and
browser clients must continue to use the regular Supabase clients and explicit
`parent_user_id` ownership checks.

Parent data isolation rules:

- normal parents must never be able to list another parent's children, courses,
  submissions, writing samples, spelling cases, candidate mappings, or review
  cases
- admin routes must not expose service-role results through shared parent
  components or parent APIs
- admin queries must select only the fields needed for the internal read/triage
  surface
- parent-scoped RLS must not be weakened to make admin UI easier
- if admin reads ever move to a browser Supabase client, this model is no
  longer sufficient and the app must first adopt DB-backed admin roles or
  Supabase custom claims plus explicit admin RLS policies

## Authorized Scope

This model authorizes read-only internal surfaces only.

For Slice `4C`, it authorizes a protected `/admin/catalog-review` read/triage
surface over open `spelling_catalog_review_cases`. The surface may group,
filter, inspect, and summarize parent-raised catalog-review cases for internal
triage.

This model does not authorize:

- curation decisions
- canonical/global promotion
- micro-skill creation
- catalog mutation
- case closing, merging, superseding, or reopening
- resolver changes
- parent `Review Work` behavior changes
- manual writing sample expansion
- mastery, reward, assignment, scoring, analytics, or template-routing changes
- role-management UI
- a separate admin login
- a broad admin dashboard or CMS

Slice `4D` or another explicit future admin curation slice must define any
write-capable admin authority, mutation helpers, audit behavior, and tests
before those operations are implemented.

## Slice Boundaries

Slice `4C`:

- may implement the admin access foundation
- may add `/admin/catalog-review`
- may add read-only internal triage over open catalog-review cases
- must use the server-only admin guard and service-role boundary
- must not mutate catalog-review case status or canonical catalog truth

Slice `4D`:

- owns admin decisions and canonical promotion if later approved
- may define curation decisions such as linking an existing skill, proposing or
  creating a skill, word-level-only classification, not-a-learning-issue
  classification, merging, superseding, closing, or reopening
- must not inherit write authority from Slice `4C`; it needs its own explicit
  write contract

## QA Expectations

Before any admin route is considered launchable:

- anonymous `/admin/*` requests redirect to `/login`
- signed-in non-admin parents cannot render admin pages
- signed-in non-admin parents cannot call `/api/admin/*`
- allowlisted users can render the admin shell
- service-role client code is server-only and not imported by client
  components
- parent routes still use parent-scoped clients and ownership filters
- existing parent-scoped RLS policies remain unchanged
- normal parents cannot list cross-parent catalog-review cases
- build and lint checks pass or any unrelated pre-existing failures are called
  out explicitly

## Future Migration Path

If private-MVP allowlists stop being enough, migrate in this order:

1. add a DB-backed admin role table or Supabase custom claims model
2. define role-management ownership outside normal parent flows
3. add explicit admin RLS policies only after the identity model is durable
4. move any browser-client admin reads behind those policies
5. preserve service-role usage only for server-only operations that truly need
   RLS bypass

Until that migration is complete, server-side allowlists plus server-only
service-role reads are the only approved admin/internal access model.
