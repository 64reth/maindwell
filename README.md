# MAINDWELL

Property maintenance operations for UK landlords, letting agents, employees and trade partners. MAINDWELL's tagline is **Good work. Well managed.**

## Requirements

- Node.js 20.9 or newer
- pnpm 9 or newer
- A Supabase project
- Supabase CLI for applying schema migrations

## Local setup

1. Install dependencies with `pnpm install`.
2. Create a Supabase project and copy its project URL and publishable key from Project Settings → API.
3. Authenticate and link the CLI with `supabase login` and `supabase link --project-ref <project-ref>`, then apply ordered migrations with `supabase db push --linked`. Alternatively, run every SQL migration in `supabase/migrations/` in filename order in the SQL Editor.
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
- The initial account is the organization owner. Additional membership roles are enforced by database policies.
- The product, MVP, technical, schema, and design planning documents in `docs/` are currently empty; this implementation follows the Build 001 request and the assumptions above.
- Supabase project provisioning and applying the migrations are required before signup and operational workflows can be used.

## Workforce and Portals

- Operations managers use `/dashboard` to manage employee profiles, supervisors, responsibilities, training, qualifications, task competency assessments, development goals, feedback, milestones and job assignments.
- Employees use `/employee` to view their own profile, assigned jobs and instructions, training, qualifications, current task assessments and development history. Their work updates use a constrained database function; official profile and competency records are manager-only.
- Clients use `/client` to view their linked properties and requests, and to submit maintenance requests against those properties.
- Managers generate one-time employee or client links from the relevant profile. The app does not send invitation email; links must be shared securely. Links expire after seven days and require an account using the record's email address.
- Independent assignments require an explicit, current supervisor assessment matching the job title or trade. Other employee assignments require supervision by default. Assessments are append-only, task-specific history.
- Employee data is limited to employment and professional development information needed to manage work. Referral details, youth justice records and social-services casework are not collected or managed here.
