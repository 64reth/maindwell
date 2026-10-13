create or replace function public.is_employee_assigned_to_property(target_property uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.job_employee_assignments assignment
    join public.employees employee on employee.id = assignment.employee_id
    join public.jobs job on job.id = assignment.job_id
    where job.property_id = target_property and employee.auth_user_id = auth.uid()
  );
$$;

create policy "Employees read properties for assigned work" on public.properties
  for select to authenticated using (public.is_employee_assigned_to_property(id));
