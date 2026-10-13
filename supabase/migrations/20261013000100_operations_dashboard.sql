create extension if not exists pgcrypto;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  created_at timestamptz not null default now()
);

create table public.org_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'operations', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.org_memberships m
    where m.organization_id = target_org and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_manage_org(target_org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.org_memberships m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'operations')
  );
$$;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type text not null check (type in ('landlord', 'letting_agent')),
  name text not null check (length(trim(name)) > 0),
  contact_name text not null check (length(trim(contact_name)) > 0),
  email text not null check (position('@' in email) > 1),
  phone text not null check (length(trim(phone)) > 0),
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null,
  address_line_1 text not null check (length(trim(address_line_1)) > 0),
  address_line_2 text,
  city text not null check (length(trim(city)) > 0),
  postcode text not null check (length(trim(postcode)) >= 5),
  property_type text not null default 'Residential',
  access_notes text,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (client_id, organization_id) references public.clients(id, organization_id)
);

create table public.contractors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_name text not null check (length(trim(business_name)) > 0),
  contact_name text not null check (length(trim(contact_name)) > 0),
  email text not null check (position('@' in email) > 1),
  phone text not null check (length(trim(phone)) > 0),
  trades text[] not null default '{}',
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'expired')),
  notes text,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  check (cardinality(trades) > 0)
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_ref text not null,
  property_id uuid not null,
  contractor_id uuid,
  title text not null check (length(trim(title)) > 0),
  trade text not null check (length(trim(trade)) > 0),
  description text not null check (length(trim(description)) > 0),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'emergency')),
  status text not null default 'new'
    check (status in ('new', 'assigned', 'in_progress', 'completed', 'cancelled')),
  due_date date,
  completion_notes text,
  completed_at timestamptz,
  review_status text not null default 'not_reviewed'
    check (review_status in ('not_reviewed', 'pending', 'approved', 'rework')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, job_ref),
  foreign key (property_id, organization_id) references public.properties(id, organization_id),
  foreign key (contractor_id, organization_id) references public.contractors(id, organization_id),
  check (status <> 'completed' or (completion_notes is not null and completed_at is not null))
);

create table public.job_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null,
  actor_id uuid references auth.users(id) on delete set null,
  event text not null,
  note text,
  created_at timestamptz not null default now(),
  foreign key (job_id, organization_id) references public.jobs(id, organization_id) on delete cascade
);

create index properties_client_id_idx on public.properties (client_id);
create index jobs_property_id_idx on public.jobs (property_id);
create index jobs_contractor_id_idx on public.jobs (contractor_id);
create index jobs_org_status_idx on public.jobs (organization_id, status, created_at desc);
create index job_history_job_id_idx on public.job_history (job_id, created_at desc);

create or replace function public.create_org_for_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  new_org_id uuid;
  org_name text;
begin
  org_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'organization_name'), ''),
    split_part(coalesce(new.email, 'My business'), '@', 1) || ' Property Services'
  );
  insert into public.organizations (name) values (org_name) returning id into new_org_id;
  insert into public.org_memberships (organization_id, user_id, role)
  values (new_org_id, new.id, 'owner');
  return new;
end;
$$;

create trigger auth_user_creates_organization
  after insert on auth.users
  for each row execute function public.create_org_for_new_user();

create or replace function public.record_job_history()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  changes text[] := array[]::text[];
  event_name text;
begin
  if tg_op = 'INSERT' then
    insert into public.job_history (organization_id, job_id, actor_id, event, note)
    values (new.organization_id, new.id, auth.uid(), 'Job created', new.title);
    return new;
  end if;

  if old.status is distinct from new.status then
    changes := array_append(changes, 'Status changed to ' || replace(new.status, '_', ' '));
  end if;
  if old.contractor_id is distinct from new.contractor_id then
    changes := array_append(changes, case when new.contractor_id is null
      then 'Contractor unassigned' else 'Contractor assigned' end);
  end if;
  if old.completion_notes is distinct from new.completion_notes and new.completion_notes is not null then
    changes := array_append(changes, 'Completion notes recorded');
  end if;
  if cardinality(changes) > 0 then
    event_name := changes[1];
    insert into public.job_history (organization_id, job_id, actor_id, event, note)
    values (new.organization_id, new.id, auth.uid(), event_name, array_to_string(changes, '. '));
  end if;
  return new;
end;
$$;

create trigger jobs_write_history
  after insert or update of status, contractor_id, completion_notes on public.jobs
  for each row execute function public.record_job_history();

alter table public.organizations enable row level security;
alter table public.org_memberships enable row level security;
alter table public.clients enable row level security;
alter table public.properties enable row level security;
alter table public.contractors enable row level security;
alter table public.jobs enable row level security;
alter table public.job_history enable row level security;

create policy "Members can read their organization" on public.organizations
  for select to authenticated using (public.is_org_member(id));
create policy "Managers can update their organization" on public.organizations
  for update to authenticated using (public.can_manage_org(id)) with check (public.can_manage_org(id));
create policy "Members can read their memberships" on public.org_memberships
  for select to authenticated using (user_id = auth.uid());

create policy "Members can read clients" on public.clients
  for select to authenticated using (public.is_org_member(organization_id));
create policy "Operators manage clients" on public.clients
  for all to authenticated using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id));

create policy "Members can read properties" on public.properties
  for select to authenticated using (public.is_org_member(organization_id));
create policy "Operators manage properties" on public.properties
  for all to authenticated using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id));

create policy "Members can read contractors" on public.contractors
  for select to authenticated using (public.is_org_member(organization_id));
create policy "Operators manage contractors" on public.contractors
  for all to authenticated using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id));

create policy "Members can read jobs" on public.jobs
  for select to authenticated using (public.is_org_member(organization_id));
create policy "Operators manage jobs" on public.jobs
  for all to authenticated using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id));

create policy "Members can read job history" on public.job_history
  for select to authenticated using (public.is_org_member(organization_id));

grant select on public.organizations, public.org_memberships, public.job_history to authenticated;
grant select, insert, update, delete on public.clients, public.properties, public.contractors, public.jobs to authenticated;
