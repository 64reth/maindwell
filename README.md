# MAINDWELL

Property maintenance operations for UK landlords, letting agents and trade partners. Build 001 covers client and property records, contractor verification, maintenance requests, assignment, job progress and completion review.

## Requirements

- Node.js 20.9 or newer
- pnpm 9 or newer
- A Supabase project

## Local setup

1. Install dependencies with `pnpm install`.
2. Create a Supabase project and copy its project URL and publishable key from Project Settings → API.
3. In the Supabase SQL Editor, run [`supabase/migrations/20261013000100_operations_dashboard.sql`](supabase/migrations/20261013000100_operations_dashboard.sql).
4. Copy `.env.example` to `apps/web/.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` is also supported).
5. Set the Supabase Auth Site URL to `http://localhost:3000` and add `http://localhost:3000/**` to the allowed redirect URLs. Sign-up confirmation returns to the current app origin.
6. Run `pnpm dev` and open [http://localhost:3000](http://localhost:3000).
7. Create the first account in the app. The signup creates an organization and owner membership automatically.

The dashboard contains no seed or sample operational records. All business data is stored in Supabase and scoped by organization-level row-level security. Never put a Supabase service-role key in this app.

## Build and typecheck

- `pnpm typecheck`
- `pnpm build`

## Build 001 notes

- Records are created and edited in the dashboard; related records are linked by database foreign keys.
- Contractors can only be newly assigned when verified and registered for the job's required trade.
- Job status, assignment and completion changes are recorded in job history by a database trigger.
- The initial account is the organization owner. Additional memberships and roles are enforced by database policies; in-app team invitations are not included in Build 001.
- The product, MVP, technical, schema, and design planning documents in `docs/` are currently empty; this implementation follows the Build 001 request and the assumptions above.
- Supabase project provisioning and applying the migration are required before signup and operational workflows can be used.
