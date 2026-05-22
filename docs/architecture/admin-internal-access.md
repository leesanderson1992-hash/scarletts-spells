# Admin/Internal Access

## Purpose

This document defines the smallest safe admin/internal access model for
Scarlett's Spells for private-MVP protected internal read/triage surfaces.

It is a private-MVP access contract for protected internal read/triage surfaces.
It exists so Slice `4C` catalog-review admin UI can run without weakening parent
access, parent-scoped RLS, or Writing Engine taxonomy boundaries.

Implementation status: the admin access foundation is implemented. The
`/admin/catalog-review` read-only triage UI is implemented and QA passed.
Admin APIs, admin decisions, canonical promotion, micro-skill creation, catalog
mutation, and case status mutation are not implemented.

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

Implemented foundation:

- `/admin` session protection is registered in `proxy.ts`
- `app/admin/layout.tsx` is the mandatory server-side admin gate
- the layout calls the shared server-only admin helper before rendering child
  admin routes

The first implemented admin review route is:

- `/admin/catalog-review`

Future admin APIs must live under `/api/admin/*` and must call the same admin
helper before querying data. API route handlers must not rely on the admin page
layout for authorization.

Proxy/middleware may protect `/admin` from anonymous access by redirecting to
`/login`, but proxy/middleware is not the admin authorization boundary. A
signed-in non-admin parent must still be blocked by the server-side admin
guard.

## Implemented Helper Boundaries

The admin access helper lives at:

- `lib/admin/access.ts`

Implemented helper responsibilities:

- read the current Supabase user using the existing server auth path
- return unauthenticated when no user is signed in
- authorize only users whose id or email appears in the private allowlist
- expose `getAdminUser()` and `requireAdminUser()` for layouts, future admin
  route handlers, and future admin-only server actions
- avoid leaking allowlist values or service-role configuration to the browser

The service-role Supabase helper lives at:

- `lib/supabase/service-role.ts`

Implemented service-role responsibilities:

- use `import "server-only"`
- read a private server-side service-role key, never a `NEXT_PUBLIC_*` key
- be imported only by admin server components, admin route handlers, or
  admin-only server actions after admin authorization has passed
- never be passed to client components

The service-role helper exists as a server-only boundary. It is not imported by
client components. `/admin/catalog-review` uses it only after
`requireAdminUser()` passes.

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

For Slice `4C`, it authorizes the implemented protected
`/admin/catalog-review` read/triage surface over open
`spelling_catalog_review_cases`. That surface may group, inspect, and summarize
parent-raised catalog-review cases for internal triage.

The implemented Slice `4C` surface:

- reads only open `spelling_catalog_review_cases`
- groups cases by normalized `misspelling -> correction`
- sorts groups by latest `updated_at`
- displays misspelling -> correction, count, latest date, representative
  context, parent note/reason, source provenance, status, and limited
  supporting spelling context where appropriate
- includes safe empty/error states
- avoids unnecessary parent/child identity exposure
- calls `requireAdminUser()` before creating or using the service-role client
- keeps that page-level guard outside broad data-read `try/catch`, so
  `redirect()` / `notFound()` control-flow is not swallowed by generic error
  rendering

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

- has implemented the admin access foundation
- has implemented `/admin/catalog-review` as a separate read-only UI slice
- has implemented read-only internal triage over open catalog-review cases
- uses the server-only admin guard and service-role boundary
- must not mutate catalog-review case status or canonical catalog truth

Slice `4D`:

- owns admin decisions and canonical promotion if later approved
- may define curation decisions such as linking an existing skill, proposing or
  creating a skill, word-level-only classification, not-a-learning-issue
  classification, merging, superseding, closing, or reopening
- must not inherit write authority from Slice `4C`; it needs its own explicit
  docs-first write contract, audit trail, decision actions, canonical write
  path, validation, and tests

## QA Expectations

Slice `4C` runtime QA passed:

- anonymous `/admin/*` requests redirect to `/login`
- signed-in non-admin parents cannot render admin pages
- allowlisted users can render the admin shell
- service-role client code is server-only and not imported by client
  components
- parent routes still use parent-scoped clients and ownership filters
- existing parent-scoped RLS policies remain unchanged
- normal parents cannot list cross-parent catalog-review cases
- the page is read-only and mutation-free

Validation evidence:

- `npx eslint app/admin/catalog-review/page.tsx`
- `npx tsc --noEmit`
- `npm run build`
- `git diff --check`

Operational setup:

- `ADMIN_USER_IDS` and/or `ADMIN_EMAILS` must be configured in the server
  environment
- `SUPABASE_SERVICE_ROLE_KEY` must be configured server-side
- this is a private-MVP admin model, not long-term staff role management
- future write-capable admin workflows need separate action helpers, audit
  trail design, and regression coverage

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
