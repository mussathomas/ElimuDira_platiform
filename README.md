# ElimuDira

Multi-tenant education management platform for schools, built on Next.js (App Router) + Supabase (Postgres, Auth) + Cloudflare R2. Every school gets its own isolated workspace on shared infrastructure — tenant isolation is enforced by Postgres Row Level Security, not by frontend filtering.

This repository currently implements **Phase 1** of the build (see "Phase status" below): the architecture everything else depends on. It is a real, working foundation — not a mockup — but Students, Attendance, Exams, Finance, Letters and Notifications are intentionally left as documented placeholders for Phases 2–7.

## Stack

- **Next.js 15** (App Router, Server Components, Server Actions) + TypeScript (strict)
- **Tailwind CSS**, hand-built UI kit (no external component library dependency)
- **Supabase**: Postgres, Auth, Row Level Security
- **Cloudflare R2**: object storage (S3-compatible), accessed only from the server
- Deploy target: **Vercel** (app) + **Supabase** (DB/Auth) + **Cloudflare R2** (files) — portable to any Node host if you move away from Vercel later

## Getting started

1. Create a Supabase project. In the SQL editor, run the files in `supabase/migrations/` **in order** (`0001` → `0005`). They're plain SQL — no Supabase CLI required, though `supabase db push` works too if you prefer the CLI.
2. Create a Cloudflare R2 bucket and an API token scoped to it.
3. Copy `.env.example` to `.env.local` and fill in every value.
4. `npm install`
5. `npm run dev` → http://localhost:3000
6. Optional: `npm run db:seed` to create "ElimuDira Demo School" with a demo user for every role (Administrator/Teacher/Accountant/Secretary), a starter academic structure, and `setup_completed = true` so you land straight on the dashboard. Credentials are printed to the console when the script finishes. Never point this at a production project.

## Architecture

### Multi-tenancy

```
schools (tenant root)
  → profiles (school_id FK; one per auth.users row)
  → roles (school_id FK; Administrator/Teacher/Accountant/Secretary seeded per school)
      → role_permissions ↔ permissions (global catalog)
  → user_permission_overrides (per-user grant/revoke on top of their role)
  → academic_years / education_levels / classes / streams / subjects (school_id FK)
  → audit_logs (school_id FK, nullable for platform-level actions)
```

Every school-owned table carries `school_id` and has RLS enabled (`supabase/migrations/0002_helper_functions_and_rls.sql`). The enforcement is three helper functions, all `SECURITY DEFINER` so they resolve from `auth.uid()` and never trust a client-supplied id:

- `current_school_id()` — the caller's own school, or null for platform admins
- `is_super_admin()` — checked against `platform_admins`, a table deliberately separate from `profiles` so platform-level access can never be confused with a school role
- `has_permission(code)` — role permission, with per-user overrides taking precedence in either direction

**A school row is never inserted directly.** The only door in is `register_school()` (`0004_register_school_function.sql`), a `SECURITY DEFINER` function that creates the school, seeds its four default roles, grants the Administrator role every current permission, and links the new admin — in one transaction, so a failure partway through can never leave a school without an administrator.

### Permissions

Permissions are `module:action` codes (`view_students`, `create_payment`, `manage_roles`, ...) in a single platform-wide catalog (`0003_permissions_catalog.sql`) — schools don't edit this table, they decide which codes each role (or individual user, via overrides) is granted. New modules add their codes here as they're built; nothing is hard-coded into the UI. The full catalog is queryable and editable in-app at **Staff & Administration → Roles** (grant/revoke matrix) and **→ Permissions** (read-only reference).

The sidebar (`lib/permissions/nav.ts`, `components/sidebar/sidebar.tsx`) is the single source of truth for navigation, and it's genuinely permission-aware — but hiding a link is a UX courtesy, not the security boundary. Every Server Action calls `requirePermission(code)` (`lib/permissions/session.ts`) server-side, and RLS enforces tenant isolation underneath that regardless of what the action code does. **Never trust the sidebar's decision to hide something as the reason it's safe** — it isn't; the RLS policy and the `requirePermission` call are.

### Super Admin (platform level)

`platform_admins` is a separate table from `profiles.role_id` — a platform admin is never "a school role with extra permissions," they're a different kind of account entirely, with `school_id = null`. `/platform/*` routes (separate layout, separate sidebar in `lib/permissions/nav.ts`) are gated by `requireSuperAdmin()`, distinct from `requireSchoolSession()` used everywhere under `/dashboard`. A suspended or deactivated school's users are redirected to `/school-suspended` on their next request, independent of whether their session is still valid — that check lives in `requireSchoolSession()`, not just at login.

### File storage

`lib/storage/r2.ts` is the only file in the codebase that touches R2 credentials, and it's marked `import 'server-only'` so importing it from a Client Component is a build error. Objects are namespaced `schools/{schoolId}/...`; the school id in that key always comes from the caller's own session (`requireSchoolSession()`), never from a client-supplied value, so one school can never construct another school's object key. Reads go through short-lived signed URLs (`getSignedDownloadUrl`) — nothing is public by default.

### Setup wizard

`/dashboard/setup` — steps 1–5 write real data (school profile, academic year, education levels, classes/streams, subjects) via the same Server Actions and shared UI panels (`components/academic/*`) used later at **Settings → Academic Settings**, so there's exactly one implementation of "create a class," not two. Steps 6 (Grading) and 7 (Staff & Users) are honest placeholders — they say plainly that they ship with Phases 4 and 2 — with a Skip action. Administrators can leave setup incomplete and return later; the dashboard shows a progress banner instead of blocking access.

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 1 | Architecture, auth, multi-tenancy, DB, registration, setup wizard, dashboard, permission system, Super Admin | **Built** |
| 2 | Students, Staff, Users, Positions | Placeholder routes only |
| 3 | Attendance, Syllabus Progress | Syllabus progress built; attendance remains in progress |
| 4 | Exams, Results, Reports, Grading | Placeholder routes only |
| 5 | Finance | Placeholder routes only |
| 6 | Letters/Documents (R2 usage extends here) | Placeholder routes only |
| 7 | Notifications, WhatsApp/SMS | Placeholder routes only |
| 8 | Analytics, deeper audit, performance/security hardening | Not started |

Remaining placeholder routes already exist in the sidebar, already have permission codes assigned in the catalog, and resolve through `app/dashboard/[...slug]/page.tsx` (or `app/platform/[...slug]/page.tsx`) with an honest "ships in Phase N" message instead of a 404. Extending one is mostly: add tables + RLS policies, add Server Actions, and add a real `page.tsx` where the placeholder used to resolve.

## Known Phase 1 simplifications (deliberate, called out for Phase 2+)

- Delete confirmations use `window.confirm()`, not a proper modal component — fine for Phase 1, worth a real dialog component once more destructive actions (student deletion, payment voiding) exist.
- The registration form is one page with visual sections, not a true multi-step client wizard — the backend already supports doing this as a true wizard if you want that polish later; nothing about the data model assumes otherwise.
- `types/database.ts` is hand-authored to match the SQL migrations. Once your Supabase project is live, regenerate it with `npx supabase gen types typescript --project-id <ref> > types/database.ts` and delete the hand-authored version — the shape is deliberately identical so nothing downstream breaks.
- Row-level "can a user edit their own profile's role_id" fine-grained protection is intentionally left to a future `assign_role()` function + Staff module (Phase 2) rather than fought through RLS `USING`/`WITH CHECK` alone — documented in `0002_helper_functions_and_rls.sql`.

## Security checklist (what's actually enforced today)

- ✅ RLS enabled on every school-owned table, verified via `current_school_id()` / `is_super_admin()`
- ✅ No insert policy on `schools` — creation only via `register_school()`
- ✅ Audit log is append-only (no update/delete policy exists for any role)
- ✅ Service-role key (`createAdminSupabaseClient`) is isolated to one file, unused by any Phase 1 route — everything school-facing runs as the authenticated user, so RLS is always live
- ✅ R2 credentials isolated to `lib/storage/r2.ts`, `server-only`-guarded
- ✅ Every Server Action re-checks permission server-side; the sidebar hiding a link is never the only gate
- ⏳ Rate limiting on public endpoints (registration, login) — not yet implemented; add at the Vercel/edge layer or via a Supabase Edge Function before production traffic
- ⏳ CSRF: Next.js Server Actions have built-in origin checking; no additional work needed unless you add non-Server-Action API routes that mutate state
