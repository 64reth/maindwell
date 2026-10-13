drop policy if exists "Operations members read employees" on public.employees;
create policy "Managers and employees read employee profiles" on public.employees
  for select to authenticated using (public.can_manage_org(organization_id) or public.is_employee_self(id));

drop policy if exists "Operations members read job assignments" on public.job_employee_assignments;
create policy "Managers and assignees read job assignments" on public.job_employee_assignments
  for select to authenticated using (public.can_manage_org(organization_id) or public.is_employee_assignment_self(id));

drop policy if exists "Employees and operations read training" on public.employee_training_records;
create policy "Managers and employees read training" on public.employee_training_records
  for select to authenticated using (public.can_manage_org(organization_id) or public.is_employee_self(employee_id));

drop policy if exists "Employees and operations read assessments" on public.employee_competency_assessments;
create policy "Managers and employees read assessments" on public.employee_competency_assessments
  for select to authenticated using (public.can_manage_org(organization_id) or public.is_employee_self(employee_id));

drop policy if exists "Employees and operations read development goals" on public.employee_development_goals;
create policy "Managers and employees read development goals" on public.employee_development_goals
  for select to authenticated using (public.can_manage_org(organization_id) or public.is_employee_self(employee_id));

drop policy if exists "Employees and operations read development history" on public.employee_development_entries;
create policy "Managers and employees read development history" on public.employee_development_entries
  for select to authenticated using (public.can_manage_org(organization_id) or public.is_employee_self(employee_id));

drop policy if exists "Operations and related users read job history" on public.job_history;
create policy "Operations and assigned employees read job history" on public.job_history
  for select to authenticated using (
    public.is_operations_member(organization_id)
    or public.is_employee_assigned_to_job(job_id)
  );
