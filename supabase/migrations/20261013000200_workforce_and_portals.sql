alter table public.org_memberships drop constraint if exists org_memberships_role_check;
alter table public.org_memberships
  add constraint org_memberships_role_check
  check (role in ('owner', 'admin', 'operations', 'viewer', 'employee', 'client'));

alter table public.clients
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
create unique index if not exists clients_auth_user_id_unique
  on public.clients (auth_user_id) where auth_user_id is not null;

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  first_name text not null check (length(trim(first_name)) > 0),
  last_name text not null check (length(trim(last_name)) > 0),
  email text not null check (position('@' in email) > 1),
  phone text not null default '',
  employment_role text not null check (length(trim(employment_role)) > 0),
  start_date date not null,
  supervisor_id uuid,
  responsibilities text not null default '',
  employment_status text not null default 'invited'
    check (employment_status in ('invited', 'active', 'inactive')),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (supervisor_id, organization_id) references public.employees(id, organization_id)
);

create unique index employees_auth_user_id_unique
  on public.employees (auth_user_id) where auth_user_id is not null;
create unique index employees_organization_email_unique
  on public.employees (organization_id, lower(email));
create index employees_supervisor_id_idx on public.employees (supervisor_id);

create table public.portal_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invite_role text not null check (invite_role in ('employee', 'client')),
  employee_id uuid,
  client_id uuid,
  email text not null,
  token_hash text not null unique,
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (
    (invite_role = 'employee' and employee_id is not null and client_id is null)
    or (invite_role = 'client' and client_id is not null and employee_id is null)
  ),
  foreign key (employee_id, organization_id) references public.employees(id, organization_id) on delete cascade,
  foreign key (client_id, organization_id) references public.clients(id, organization_id) on delete cascade
);

create index portal_invites_record_idx on public.portal_invites (employee_id, client_id);
alter table public.portal_invites enable row level security;

create table public.job_employee_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null,
  employee_id uuid not null,
  instructions text not null default '',
  requires_supervision boolean not null default true,
  assigned_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (job_id, employee_id),
  foreign key (job_id, organization_id) references public.jobs(id, organization_id) on delete cascade,
  foreign key (employee_id, organization_id) references public.employees(id, organization_id) on delete cascade
);
create index job_employee_assignments_employee_idx on public.job_employee_assignments (employee_id, created_at desc);

create table public.employee_training_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null,
  record_type text not null check (record_type in ('training', 'qualification')),
  title text not null check (length(trim(title)) > 0),
  provider text,
  status text not null default 'completed' check (status in ('planned', 'in_progress', 'completed')),
  completed_on date,
  expires_on date,
  notes text,
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (employee_id, organization_id) references public.employees(id, organization_id) on delete cascade,
  check (expires_on is null or record_type = 'qualification' or status <> 'completed')
);
create index employee_training_records_employee_idx on public.employee_training_records (employee_id, created_at desc);

create table public.employee_competency_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null,
  task_name text not null check (length(trim(task_name)) > 0),
  outcome text not null check (outcome in ('needs_supervision', 'supervised_practice', 'approved_independent')),
  assessment_notes text not null,
  assessed_at date not null default current_date,
  review_due date,
  assessed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (employee_id, organization_id) references public.employees(id, organization_id) on delete cascade
);
create index employee_competency_assessments_latest_idx
  on public.employee_competency_assessments (employee_id, lower(task_name), assessed_at desc, created_at desc);

create table public.employee_development_goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null,
  title text not null check (length(trim(title)) > 0),
  description text not null,
  target_date date,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'achieved', 'paused')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, organization_id),
  foreign key (employee_id, organization_id) references public.employees(id, organization_id) on delete cascade
);
create index employee_development_goals_employee_idx on public.employee_development_goals (employee_id, status, target_date);

create table public.employee_development_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null,
  entry_type text not null check (entry_type in ('supervisor_feedback', 'milestone', 'job_experience', 'goal_progress')),
  title text not null check (length(trim(title)) > 0),
  note text not null,
  job_id uuid,
  goal_id uuid,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (employee_id, organization_id) references public.employees(id, organization_id) on delete cascade,
  foreign key (job_id, organization_id) references public.jobs(id, organization_id),
  foreign key (goal_id, organization_id) references public.employee_development_goals(id, organization_id)
);
create index employee_development_entries_employee_idx
  on public.employee_development_entries (employee_id, created_at desc);

create or replace function public.is_operations_member(target_org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.org_memberships m
    where m.organization_id = target_org and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'operations', 'viewer')
  );
$$;

create or replace function public.is_employee_self(target_employee uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.employees e
    where e.id = target_employee and e.auth_user_id = auth.uid()
  );
$$;

create or replace function public.is_employee_assigned_to_job(target_job uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.job_employee_assignments a
    join public.employees e on e.id = a.employee_id
    where a.job_id = target_job and e.auth_user_id = auth.uid()
  );
$$;

create or replace function public.is_employee_assignment_self(target_assignment uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.job_employee_assignments a
    join public.employees e on e.id = a.employee_id
    where a.id = target_assignment and e.auth_user_id = auth.uid()
  );
$$;

create or replace function public.is_client_property(target_property uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.properties p
    join public.clients c on c.id = p.client_id
    where p.id = target_property and c.auth_user_id = auth.uid()
  );
$$;

create or replace function public.is_client_job(target_job uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.jobs j
    join public.properties p on p.id = j.property_id
    join public.clients c on c.id = p.client_id
    where j.id = target_job and c.auth_user_id = auth.uid()
  );
$$;

create or replace function public.complete_portal_invite_for_user(target_user uuid, target_token text)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  invite_row public.portal_invites%rowtype;
  account_email text;
begin
  select lower(u.email) into account_email from auth.users u where u.id = target_user;
  if account_email is null or target_token is null or length(target_token) < 32 then
    raise exception 'This portal invite is invalid or expired' using errcode = '22023';
  end if;

  select * into invite_row
  from public.portal_invites i
  where i.token_hash = encode(extensions.digest(convert_to(target_token, 'UTF8'), 'sha256'), 'hex')
    and lower(i.email) = account_email
    and i.accepted_at is null
    and i.expires_at > now()
  for update;

  if not found then
    select * into invite_row
    from public.portal_invites i
    where i.token_hash = encode(extensions.digest(convert_to(target_token, 'UTF8'), 'sha256'), 'hex')
      and i.accepted_by = target_user and i.accepted_at is not null;
    if found then return invite_row.invite_role; end if;
    raise exception 'This portal invite is invalid or expired, or the email does not match' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.org_memberships m
    where m.organization_id = invite_row.organization_id and m.user_id = target_user
  ) then
    raise exception 'This account already has a different role in this workspace' using errcode = '23505';
  end if;

  insert into public.org_memberships (organization_id, user_id, role)
  values (invite_row.organization_id, target_user, invite_row.invite_role);

  if invite_row.invite_role = 'employee' then
    update public.employees set auth_user_id = target_user, employment_status = 'active'
    where id = invite_row.employee_id and organization_id = invite_row.organization_id;
    if not found then raise exception 'The employee profile for this invite no longer exists'; end if;
  else
    update public.clients set auth_user_id = target_user
    where id = invite_row.client_id and organization_id = invite_row.organization_id;
    if not found then raise exception 'The client record for this invite no longer exists'; end if;
  end if;

  update public.portal_invites set accepted_at = now(), accepted_by = target_user where id = invite_row.id;
  return invite_row.invite_role;
end;
$$;

create or replace function public.accept_portal_invite(target_token text)
returns text
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in before accepting this invite' using errcode = '28000'; end if;
  return public.complete_portal_invite_for_user(auth.uid(), target_token);
end;
$$;

create or replace function public.create_portal_invite(target_role text, target_record uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  target_org uuid;
  target_email text;
  target_user uuid;
  raw_token text;
  invite_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in is required' using errcode = '28000'; end if;
  if target_role = 'employee' then
    select e.organization_id, e.email, e.auth_user_id
      into target_org, target_email, target_user
    from public.employees e where e.id = target_record;
  elsif target_role = 'client' then
    select c.organization_id, c.email, c.auth_user_id
      into target_org, target_email, target_user
    from public.clients c where c.id = target_record;
  else
    raise exception 'Unsupported portal role' using errcode = '22023';
  end if;
  if target_org is null or not public.can_manage_org(target_org) then
    raise exception 'You do not have permission to invite this record' using errcode = '42501';
  end if;
  if target_user is not null then raise exception 'This record already has a portal account' using errcode = '23505'; end if;

  raw_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  update public.portal_invites set expires_at = now()
    where organization_id = target_org and invite_role = target_role
      and accepted_at is null and expires_at > now()
      and ((target_role = 'employee' and employee_id = target_record)
        or (target_role = 'client' and client_id = target_record));
  insert into public.portal_invites (organization_id, invite_role, employee_id, client_id, email, token_hash, created_by)
  values (
    target_org, target_role,
    case when target_role = 'employee' then target_record end,
    case when target_role = 'client' then target_record end,
    lower(target_email),
    encode(extensions.digest(convert_to(raw_token, 'UTF8'), 'sha256'), 'hex'),
    auth.uid()
  ) returning id into invite_id;
  return raw_token;
end;
$$;

create or replace function public.create_org_for_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  new_org_id uuid;
  org_name text;
  invite_token text;
begin
  invite_token := new.raw_user_meta_data ->> 'portal_invite_token';
  if invite_token is not null then
    perform public.complete_portal_invite_for_user(new.id, invite_token);
    return new;
  end if;

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

create or replace function public.employee_update_assigned_job(
  target_job uuid,
  next_status text,
  completion_note text default null,
  completion_date date default null
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  current_status text;
begin
  if auth.uid() is null then raise exception 'Sign in is required' using errcode = '28000'; end if;
  if next_status not in ('in_progress', 'completed') then
    raise exception 'Employees may only update work progress or submit completion' using errcode = '22023';
  end if;
  select j.status into current_status
  from public.jobs j
  where j.id = target_job and public.is_employee_assigned_to_job(j.id)
  for update;
  if not found then raise exception 'This job is not assigned to your employee profile' using errcode = '42501'; end if;
  if current_status in ('completed', 'cancelled') then raise exception 'This job is closed' using errcode = '22023'; end if;
  if next_status = 'completed' and (length(trim(coalesce(completion_note, ''))) < 10 or completion_date is null) then
    raise exception 'Add completion notes and a completion date before submitting' using errcode = '22023';
  end if;

  update public.jobs set
    status = next_status,
    completion_notes = case when next_status = 'completed' then trim(completion_note) else null end,
    completed_at = case when next_status = 'completed' then completion_date else null end,
    review_status = case when next_status = 'completed' then 'pending' else 'not_reviewed' end,
    updated_at = now()
  where id = target_job;
end;
$$;

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
  if old.review_status is distinct from new.review_status then
    changes := array_append(changes, 'Completion review changed to ' || replace(new.review_status, '_', ' '));
  end if;
  if cardinality(changes) > 0 then
    event_name := changes[1];
    insert into public.job_history (organization_id, job_id, actor_id, event, note)
    values (new.organization_id, new.id, auth.uid(), event_name, array_to_string(changes, '. '));
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_write_history on public.jobs;
create trigger jobs_write_history
  after insert or update of status, contractor_id, completion_notes, review_status on public.jobs
  for each row execute function public.record_job_history();

create or replace function public.record_employee_assignment_history()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  worker_name text;
  related_job uuid;
  related_org uuid;
begin
  if tg_op = 'DELETE' then
    select e.first_name || ' ' || e.last_name into worker_name from public.employees e where e.id = old.employee_id;
    related_job := old.job_id;
    related_org := old.organization_id;
  else
    select e.first_name || ' ' || e.last_name into worker_name from public.employees e where e.id = new.employee_id;
    related_job := new.job_id;
    related_org := new.organization_id;
  end if;
  insert into public.job_history (organization_id, job_id, actor_id, event, note)
  values (related_org, related_job, auth.uid(),
    case when tg_op = 'DELETE' then 'Employee removed from job' else 'Employee assigned to job' end,
    worker_name);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger job_employee_assignment_history
  after insert or delete on public.job_employee_assignments
  for each row execute function public.record_employee_assignment_history();

create policy "Operations members read clients" on public.clients
  for select to authenticated using (public.is_operations_member(organization_id) or auth_user_id = auth.uid());
drop policy if exists "Members can read clients" on public.clients;

drop policy if exists "Members can read properties" on public.properties;
create policy "Operations and linked clients read properties" on public.properties
  for select to authenticated using (public.is_operations_member(organization_id) or public.is_client_property(id));

drop policy if exists "Members can read contractors" on public.contractors;
create policy "Operations members read contractors" on public.contractors
  for select to authenticated using (public.is_operations_member(organization_id));

create policy "Operations members read employees" on public.employees
  for select to authenticated using (public.is_operations_member(organization_id) or public.is_employee_self(id));
create policy "Managers manage employees" on public.employees
  for all to authenticated using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id));

create policy "Operations members read job assignments" on public.job_employee_assignments
  for select to authenticated using (public.is_operations_member(organization_id) or public.is_employee_assignment_self(id));
create policy "Managers manage job assignments" on public.job_employee_assignments
  for all to authenticated using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id));

create policy "Employees and operations read training" on public.employee_training_records
  for select to authenticated using (public.is_operations_member(organization_id) or public.is_employee_self(employee_id));
create policy "Managers manage training" on public.employee_training_records
  for all to authenticated using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id));

create policy "Employees and operations read assessments" on public.employee_competency_assessments
  for select to authenticated using (public.is_operations_member(organization_id) or public.is_employee_self(employee_id));
create policy "Managers record assessments" on public.employee_competency_assessments
  for insert to authenticated with check (public.can_manage_org(organization_id) and assessed_by = auth.uid());

create policy "Employees and operations read development goals" on public.employee_development_goals
  for select to authenticated using (public.is_operations_member(organization_id) or public.is_employee_self(employee_id));
create policy "Managers manage development goals" on public.employee_development_goals
  for all to authenticated using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id));

create policy "Employees and operations read development history" on public.employee_development_entries
  for select to authenticated using (public.is_operations_member(organization_id) or public.is_employee_self(employee_id));
create policy "Managers record development history" on public.employee_development_entries
  for insert to authenticated with check (public.can_manage_org(organization_id) and created_by = auth.uid());
create policy "Employees record own experience" on public.employee_development_entries
  for insert to authenticated with check (
    created_by = auth.uid()
    and entry_type in ('job_experience', 'goal_progress')
    and public.is_employee_self(employee_id)
    and (job_id is null or public.is_employee_assigned_to_job(job_id))
  );

create policy "Operations and assigned employees read jobs" on public.jobs
  for select to authenticated using (
    public.is_operations_member(organization_id)
    or public.is_employee_assigned_to_job(id)
    or public.is_client_job(id)
  );
drop policy if exists "Members can read jobs" on public.jobs;

create policy "Clients submit requests for linked properties" on public.jobs
  for insert to authenticated with check (
    contractor_id is null
    and status = 'new'
    and review_status = 'not_reviewed'
    and exists (
      select 1 from public.properties p
      join public.clients c on c.id = p.client_id
      where p.id = jobs.property_id and p.organization_id = jobs.organization_id
        and c.auth_user_id = auth.uid() and c.organization_id = jobs.organization_id
    )
  );

drop policy if exists "Members can read job history" on public.job_history;
create policy "Operations and related users read job history" on public.job_history
  for select to authenticated using (
    public.is_operations_member(organization_id)
    or public.is_employee_assigned_to_job(job_id)
    or public.is_client_job(job_id)
  );

grant select, insert, update, delete on public.employees, public.job_employee_assignments,
  public.employee_training_records, public.employee_development_goals to authenticated;
grant select, insert on public.employee_competency_assessments, public.employee_development_entries to authenticated;
revoke all on function public.complete_portal_invite_for_user(uuid, text) from public, anon, authenticated;
revoke all on function public.create_org_for_new_user() from public, anon, authenticated;
revoke all on function public.create_portal_invite(text, uuid) from public, anon;
revoke all on function public.accept_portal_invite(text) from public, anon;
revoke all on function public.employee_update_assigned_job(uuid, text, text, date) from public, anon;
grant execute on function public.create_portal_invite(text, uuid) to authenticated;
grant execute on function public.accept_portal_invite(text) to authenticated;
grant execute on function public.employee_update_assigned_job(uuid, text, text, date) to authenticated;
