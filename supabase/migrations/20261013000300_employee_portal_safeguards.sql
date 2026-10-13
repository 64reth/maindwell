create or replace function public.get_my_employee_profile()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select to_jsonb(e) || jsonb_build_object(
    'supervisor_name', case
      when supervisor.id is null then null
      else supervisor.first_name || ' ' || supervisor.last_name
    end
  )
  from public.employees e
  left join public.employees supervisor on supervisor.id = e.supervisor_id
    and supervisor.organization_id = e.organization_id
  where e.auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function public.guard_employee_job_assignment()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  job_trade text;
  job_title text;
  employee_status text;
  approved_outcome text;
begin
  select j.trade, j.title into job_trade, job_title
  from public.jobs j where j.id = new.job_id and j.organization_id = new.organization_id;
  if not found then raise exception 'The assigned job is not in this organization'; end if;

  select e.employment_status into employee_status
  from public.employees e where e.id = new.employee_id and e.organization_id = new.organization_id;
  if employee_status is distinct from 'active' then
    raise exception 'Only active employees can be assigned to jobs';
  end if;

  if not new.requires_supervision then
    select assessment.outcome into approved_outcome
    from public.employee_competency_assessments assessment
    where assessment.employee_id = new.employee_id
      and assessment.organization_id = new.organization_id
      and lower(assessment.task_name) in (lower(job_trade), lower(job_title))
      and (assessment.review_due is null or assessment.review_due >= current_date)
    order by assessment.assessed_at desc, assessment.created_at desc
    limit 1;
    if approved_outcome is distinct from 'approved_independent' then
      raise exception 'Independent assignment requires a current supervisor approval for this task';
    end if;
  end if;

  if tg_op = 'INSERT' then
    update public.jobs set status = 'assigned', updated_at = now()
    where id = new.job_id and status = 'new';
  end if;
  return new;
end;
$$;

create trigger guard_employee_job_assignment
  before insert or update of requires_supervision, employee_id, job_id on public.job_employee_assignments
  for each row execute function public.guard_employee_job_assignment();

revoke all on function public.get_my_employee_profile() from public, anon;
grant execute on function public.get_my_employee_profile() to authenticated;
