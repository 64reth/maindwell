"use client";

import { FormEvent, useEffect, useState } from "react";
import { ClipboardCheck, Copy, GraduationCap, Plus, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { CompetencyAssessment, DevelopmentEntry, DevelopmentGoal, EmployeeRecord, JobEmployeeAssignment, TrainingRecord } from "@/lib/types";

const outcomes = [
  { value: "needs_supervision", label: "Needs supervision" },
  { value: "supervised_practice", label: "Supervised practice" },
  { value: "approved_independent", label: "Approved for independent work" },
] as const;

function displayDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value)) : "Not recorded";
}

function friendlyError(message: string) {
  if (message.includes("duplicate key")) return "A profile with this email already exists in the workspace.";
  if (message.includes("row-level security")) return "You do not have permission to make that change.";
  return message;
}

type WorkforceWorkspaceProps = { organizationId: string };

type AssignedJob = JobEmployeeAssignment & { job?: { job_ref: string; title: string; status: string } };

export default function WorkforceWorkspace({ organizationId }: WorkforceWorkspaceProps) {
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [training, setTraining] = useState<TrainingRecord[]>([]);
  const [assessments, setAssessments] = useState<CompetencyAssessment[]>([]);
  const [goals, setGoals] = useState<DevelopmentGoal[]>([]);
  const [entries, setEntries] = useState<DevelopmentEntry[]>([]);
  const [assignments, setAssignments] = useState<AssignedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [addingEmployee, setAddingEmployee] = useState(false);

  async function loadEmployees() {
    const { data, error: loadError } = await createClient().from("employees").select("*").eq("organization_id", organizationId).order("last_name");
    if (loadError) setError(friendlyError(loadError.message));
    else {
      const records = (data || []) as EmployeeRecord[];
      setEmployees(records);
      if (!selectedId && records[0]) setSelectedId(records[0].id);
    }
    setLoading(false);
  }

  async function loadProfile(employeeId: string) {
    const supabase = createClient();
    const [trainingResult, assessmentResult, goalResult, entryResult, assignmentResult] = await Promise.all([
      supabase.from("employee_training_records").select("*").eq("employee_id", employeeId).order("created_at", { ascending: false }),
      supabase.from("employee_competency_assessments").select("*").eq("employee_id", employeeId).order("assessed_at", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("employee_development_goals").select("*").eq("employee_id", employeeId).order("created_at", { ascending: false }),
      supabase.from("employee_development_entries").select("*").eq("employee_id", employeeId).order("created_at", { ascending: false }),
      supabase.from("job_employee_assignments").select("*").eq("employee_id", employeeId).order("created_at", { ascending: false }),
    ]);
    const failed = [trainingResult, assessmentResult, goalResult, entryResult, assignmentResult].find((result) => result.error);
    if (failed?.error) {
      setError(friendlyError(failed.error.message));
      return;
    }
    const assigned = (assignmentResult.data || []) as JobEmployeeAssignment[];
    let assignedJobs: AssignedJob[] = assigned;
    if (assigned.length > 0) {
      const jobsResult = await supabase.from("jobs").select("id,job_ref,title,status").in("id", assigned.map((item) => item.job_id));
      if (!jobsResult.error) {
        const jobsById = new Map((jobsResult.data || []).map((job) => [job.id as string, job]));
        assignedJobs = assigned.map((item) => ({ ...item, job: jobsById.get(item.job_id) as AssignedJob["job"] }));
      }
    }
    setTraining((trainingResult.data || []) as TrainingRecord[]);
    setAssessments((assessmentResult.data || []) as CompetencyAssessment[]);
    setGoals((goalResult.data || []) as DevelopmentGoal[]);
    setEntries((entryResult.data || []) as DevelopmentEntry[]);
    setAssignments(assignedJobs);
  }

  useEffect(() => { void loadEmployees(); }, [organizationId]);
  useEffect(() => { if (selectedId) void loadProfile(selectedId); }, [selectedId]);

  const selected = employees.find((employee) => employee.id === selectedId);
  const latestAssessments = assessments.reduce<CompetencyAssessment[]>((latest, assessment) => {
    if (!latest.some((item) => item.task_name.toLowerCase() === assessment.task_name.toLowerCase())) latest.push(assessment);
    return latest;
  }, []);

  async function refreshAll() {
    await loadEmployees();
    if (selectedId) await loadProfile(selectedId);
  }

  async function createInvite(employeeId: string) {
    const { data, error: inviteError } = await createClient().rpc("create_portal_invite", { target_role: "employee", target_record: employeeId });
    if (inviteError) throw new Error(friendlyError(inviteError.message));
    const token = String(data);
    setInviteLink(`${window.location.origin}/join?token=${encodeURIComponent(token)}`);
    setInviteCopied(false);
  }

  async function addEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const data = new FormData(event.currentTarget);
    const payload = {
      organization_id: organizationId,
      first_name: String(data.get("first_name") || "").trim(),
      last_name: String(data.get("last_name") || "").trim(),
      email: String(data.get("email") || "").trim().toLowerCase(),
      phone: String(data.get("phone") || "").trim(),
      employment_role: String(data.get("employment_role") || "").trim(),
      start_date: data.get("start_date"),
      supervisor_id: data.get("supervisor_id") || null,
      responsibilities: String(data.get("responsibilities") || "").trim(),
      employment_status: "invited",
    };
    const { data: created, error: createError } = await createClient().from("employees").insert(payload).select("*").single();
    if (createError) {
      setError(friendlyError(createError.message));
      setSaving(false);
      return;
    }
    const employee = created as EmployeeRecord;
    setEmployees((current) => [...current, employee].sort((a, b) => a.last_name.localeCompare(b.last_name)));
    setSelectedId(employee.id);
    setAddingEmployee(false);
    try {
      await createInvite(employee.id);
      setNotice("Employee profile saved. Share the one-time invitation link with them.");
    } catch (cause) {
      setError(cause instanceof Error ? `Profile saved, but invite creation failed: ${cause.message}` : "Profile saved, but invite creation failed.");
    }
    setSaving(false);
  }

  async function updateEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const payload = {
      first_name: String(data.get("first_name") || "").trim(),
      last_name: String(data.get("last_name") || "").trim(),
      email: String(data.get("email") || "").trim().toLowerCase(),
      phone: String(data.get("phone") || "").trim(),
      employment_role: String(data.get("employment_role") || "").trim(),
      start_date: data.get("start_date"),
      supervisor_id: data.get("supervisor_id") || null,
      responsibilities: String(data.get("responsibilities") || "").trim(),
      employment_status: data.get("employment_status"),
    };
    const { error: updateError } = await createClient().from("employees").update(payload).eq("id", selected.id);
    if (updateError) setError(friendlyError(updateError.message));
    else {
      setNotice("Employee profile updated.");
      await refreshAll();
    }
    setSaving(false);
  }

  async function addTraining(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const { data: userData } = await createClient().auth.getUser();
    const { error: insertError } = await createClient().from("employee_training_records").insert({
      organization_id: organizationId,
      employee_id: selected.id,
      record_type: data.get("record_type"),
      title: String(data.get("title") || "").trim(),
      provider: data.get("provider") || null,
      status: data.get("status"),
      completed_on: data.get("completed_on") || null,
      expires_on: data.get("expires_on") || null,
      notes: data.get("notes") || null,
      recorded_by: userData.user?.id,
    });
    if (insertError) setError(friendlyError(insertError.message));
    else { form.reset(); setNotice("Training record added."); await loadProfile(selected.id); }
    setSaving(false);
  }

  async function addAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const outcome = String(data.get("outcome"));
    if (outcome === "approved_independent" && data.get("approval_confirm") !== "yes") {
      setError("Confirm the deliberate independent-working approval before recording it.");
      return;
    }
    setSaving(true);
    setError("");
    const { data: userData } = await createClient().auth.getUser();
    const { error: insertError } = await createClient().from("employee_competency_assessments").insert({
      organization_id: organizationId,
      employee_id: selected.id,
      task_name: String(data.get("task_name") || "").trim(),
      outcome,
      assessment_notes: String(data.get("assessment_notes") || "").trim(),
      assessed_at: data.get("assessed_at"),
      review_due: data.get("review_due") || null,
      assessed_by: userData.user?.id,
    });
    if (insertError) setError(friendlyError(insertError.message));
    else { form.reset(); setNotice("Competency assessment recorded."); await loadProfile(selected.id); }
    setSaving(false);
  }

  async function addGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const { data: userData } = await createClient().auth.getUser();
    const { error: insertError } = await createClient().from("employee_development_goals").insert({
      organization_id: organizationId,
      employee_id: selected.id,
      title: String(data.get("title") || "").trim(),
      description: String(data.get("description") || "").trim(),
      target_date: data.get("target_date") || null,
      created_by: userData.user?.id,
    });
    if (insertError) setError(friendlyError(insertError.message));
    else { form.reset(); setNotice("Development goal added."); await loadProfile(selected.id); }
    setSaving(false);
  }

  async function addDevelopmentEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const { data: userData } = await createClient().auth.getUser();
    const { error: insertError } = await createClient().from("employee_development_entries").insert({
      organization_id: organizationId,
      employee_id: selected.id,
      entry_type: data.get("entry_type"),
      title: String(data.get("title") || "").trim(),
      note: String(data.get("note") || "").trim(),
      created_by: userData.user?.id,
    });
    if (insertError) setError(friendlyError(insertError.message));
    else { form.reset(); setNotice("Development history updated."); await loadProfile(selected.id); }
    setSaving(false);
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteLink);
    setInviteCopied(true);
  }

  return (
    <div className="workforce-module">
      <div className="workforce-topline"><div><span className="eyebrow">People & development</span><h2>Employee profiles</h2><p>Employment, assigned work and a clear record of learning and responsibility.</p></div><button className="button button-primary" type="button" onClick={() => { setAddingEmployee((value) => !value); setError(""); }}><Plus size={16} />Add employee</button></div>
      {notice && <p className="form-message success-message" role="status">{notice}</p>}
      {error && <p className="form-message error-message" role="alert">{error}</p>}
      {addingEmployee && <section className="workforce-add-panel"><div className="section-heading"><div><span className="eyebrow">New employee</span><h2>Employment profile</h2></div><button type="button" className="row-action" onClick={() => setAddingEmployee(false)}>Cancel</button></div><form className="workforce-form-grid" onSubmit={addEmployee}>
        <label>First name<input name="first_name" required maxLength={80} /></label><label>Last name<input name="last_name" required maxLength={80} /></label>
        <label>Email address<input type="email" name="email" required /></label><label>Phone number<input type="tel" name="phone" /></label>
        <label>Employment role<input name="employment_role" required maxLength={120} placeholder="e.g. Property maintenance operative" /></label><label>Start date<input type="date" name="start_date" required /></label>
        <label>Supervisor<select name="supervisor_id" defaultValue=""><option value="">Not assigned</option>{employees.filter((employee) => employee.employment_status === "active").map((employee) => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name}</option>)}</select></label>
        <label className="span-two">Job responsibilities<textarea name="responsibilities" rows={3} maxLength={2000} placeholder="Describe the work this role is responsible for." /></label>
        <div className="span-two workforce-form-actions"><p>The profile is created separately from contractor records. A one-time account link will be generated after saving.</p><button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save & create invite"}</button></div>
      </form></section>}
      <div className="workforce-layout">
        <aside className="workforce-roster"><div className="workforce-roster-heading"><UsersRound size={16} /><span>Team</span><strong>{employees.length}</strong></div>{loading ? <p className="empty-copy">Loading profiles…</p> : employees.length === 0 ? <p className="empty-copy">No employee profiles yet.</p> : employees.map((employee) => <button type="button" key={employee.id} className={`employee-roster-item ${selectedId === employee.id ? "employee-roster-active" : ""}`} onClick={() => { setSelectedId(employee.id); setInviteLink(""); setError(""); }}><span className="employee-avatar">{employee.first_name[0]}{employee.last_name[0]}</span><span><strong>{employee.first_name} {employee.last_name}</strong><small>{employee.employment_role}</small></span><i className={`employee-state state-${employee.employment_status}`} /></button>)}</aside>
        <section className="workforce-detail">
          {!selected ? <div className="empty-state"><div className="empty-icon"><UserRound size={20} /></div><h3>Choose an employee</h3><p>Create an employee profile or select a name to review their work and development.</p></div> : <>
            <div className="employee-profile-heading"><div className="employee-large-avatar">{selected.first_name[0]}{selected.last_name[0]}</div><div><span className="eyebrow">{selected.employment_status === "active" ? "Employee profile" : "Invitation pending"}</span><h2>{selected.first_name} {selected.last_name}</h2><p>{selected.employment_role} · Started {displayDate(selected.start_date)}</p></div><span className={`status-badge status-${selected.employment_status}`}>{selected.employment_status}</span></div>
            {selected.employment_status === "invited" && <div className="invite-panel"><div><strong>Employee account invitation</strong><p>Share this one-time link with {selected.first_name}. No email is sent by the app.</p></div><button className="button button-subtle" type="button" onClick={() => void createInvite(selected.id).catch((cause) => setError(cause.message))}><Plus size={14} />Generate link</button></div>}
            {inviteLink && <div className="invite-link-row"><input readOnly aria-label="Employee invitation link" value={inviteLink} /><button className="button button-subtle" type="button" onClick={() => void copyInvite()}><Copy size={14} />{inviteCopied ? "Copied" : "Copy link"}</button></div>}
            <div className="employee-contact-row"><span>{selected.email}</span><span>{selected.phone || "No phone recorded"}</span><span>Supervisor: {employees.find((employee) => employee.id === selected.supervisor_id)?.first_name || "Not assigned"}{employees.find((employee) => employee.id === selected.supervisor_id) ? ` ${employees.find((employee) => employee.id === selected.supervisor_id)?.last_name}` : ""}</span></div>
            <details className="workforce-disclosure"><summary>Edit employment profile</summary><form className="workforce-form-grid" onSubmit={updateEmployee}>
              <label>First name<input name="first_name" defaultValue={selected.first_name} required maxLength={80} /></label><label>Last name<input name="last_name" defaultValue={selected.last_name} required maxLength={80} /></label>
              <label>Email address<input name="email" type="email" defaultValue={selected.email} required /></label><label>Phone number<input name="phone" type="tel" defaultValue={selected.phone} /></label>
              <label>Employment role<input name="employment_role" defaultValue={selected.employment_role} required maxLength={120} /></label><label>Start date<input name="start_date" type="date" defaultValue={selected.start_date} required /></label>
              <label>Supervisor<select name="supervisor_id" defaultValue={selected.supervisor_id || ""}><option value="">Not assigned</option>{employees.filter((employee) => employee.id !== selected.id && employee.employment_status === "active").map((employee) => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name}</option>)}</select></label>
              <label>Employment status<select name="employment_status" defaultValue={selected.employment_status}><option value="invited">Invitation pending</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
              <label className="span-two">Job responsibilities<textarea name="responsibilities" defaultValue={selected.responsibilities} rows={3} maxLength={2000} /></label>
              <div className="span-two workforce-form-actions"><span>Only authorised managers can change official employee records.</span><button className="button button-primary" type="submit" disabled={saving}>Save profile</button></div>
            </form></details>
            <div className="workforce-record-grid">
              <section className="workforce-record-section"><div className="workforce-section-heading"><div><GraduationCap size={17} /><div><h3>Training & qualifications</h3><p>{training.length} records</p></div></div></div>
                <details className="workforce-disclosure compact-disclosure"><summary><Plus size={14} />Add training record</summary><form className="workforce-form-grid" onSubmit={addTraining}>
                  <label>Record type<select name="record_type"><option value="training">Training</option><option value="qualification">Qualification</option></select></label><label>Status<select name="status"><option value="completed">Completed</option><option value="in_progress">In progress</option><option value="planned">Planned</option></select></label>
                  <label className="span-two">Course or qualification<input name="title" required maxLength={160} /></label><label>Provider<input name="provider" maxLength={120} /></label><label>Completed on<input name="completed_on" type="date" /></label><label>Expiry date<input name="expires_on" type="date" /></label><label className="span-two">Notes<textarea name="notes" rows={2} maxLength={1000} /></label>
                  <div className="span-two workforce-form-actions"><span>Training records are managed by the operations team.</span><button className="button button-primary" type="submit" disabled={saving}>Save training</button></div>
                </form></details>
                {training.length === 0 ? <p className="empty-copy record-empty">No training or qualifications recorded.</p> : <ul className="workforce-record-list">{training.map((item) => <li key={item.id}><div><strong>{item.title}</strong><small>{item.record_type === "qualification" ? "Qualification" : "Training"}{item.provider ? ` · ${item.provider}` : ""}</small></div><div className="record-dates"><span className={`status-badge status-${item.status}`}>{item.status}</span>{item.completed_on && <small>Completed {displayDate(item.completed_on)}</small>}{item.expires_on && <small>Expires {displayDate(item.expires_on)}</small>}</div></li>)}</ul>}
              </section>
              <section className="workforce-record-section"><div className="workforce-section-heading"><div><ShieldCheck size={17} /><div><h3>Task competencies</h3><p>Assessed per task, never inferred from tenure</p></div></div></div>
                <details className="workforce-disclosure compact-disclosure"><summary><Plus size={14} />Record assessment</summary><form className="workforce-form-grid" onSubmit={addAssessment}>
                  <label className="span-two">Task or competency<input name="task_name" required maxLength={160} placeholder="e.g. Replace a kitchen tap" /></label><label className="span-two">Assessment outcome<select name="outcome">{outcomes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                  <label>Assessed on<input name="assessed_at" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label><label>Review due<input name="review_due" type="date" /></label>
                  <label className="span-two">Assessment notes<textarea name="assessment_notes" rows={3} required minLength={5} maxLength={2000} placeholder="Observed work, safeguards and support required." /></label>
                  <label className="span-two approval-confirm"><input type="checkbox" name="approval_confirm" value="yes" />I explicitly approve independent working for the selected task, if that outcome is chosen.</label>
                  <div className="span-two workforce-form-actions"><span>Each assessment is stored as an immutable review record.</span><button className="button button-primary" type="submit" disabled={saving}>Record assessment</button></div>
                </form></details>
                {latestAssessments.length === 0 ? <p className="empty-copy record-empty">No task-specific competency assessments recorded.</p> : <ul className="workforce-record-list">{latestAssessments.map((item) => <li key={item.id}><div><strong>{item.task_name}</strong><small>{item.assessment_notes}</small></div><div className="record-dates"><span className={`competency-level competency-${item.outcome}`}>{outcomes.find((option) => option.value === item.outcome)?.label}</span><small>Reviewed {displayDate(item.assessed_at)}</small>{item.review_due && <small>Next review {displayDate(item.review_due)}</small>}</div></li>)}</ul>}
              </section>
            </div>
            <div className="workforce-record-grid">
              <section className="workforce-record-section"><div className="workforce-section-heading"><div><ClipboardCheck size={17} /><div><h3>Development goals</h3><p>{goals.filter((goal) => goal.status !== "achieved").length} open</p></div></div></div>
                <details className="workforce-disclosure compact-disclosure"><summary><Plus size={14} />Add development goal</summary><form className="workforce-form-grid" onSubmit={addGoal}><label className="span-two">Goal<input name="title" required maxLength={160} /></label><label className="span-two">What success looks like<textarea name="description" rows={2} required maxLength={1200} /></label><label>Target date<input name="target_date" type="date" /></label><div className="workforce-form-actions"><button className="button button-primary" type="submit" disabled={saving}>Save goal</button></div></form></details>
                {goals.length === 0 ? <p className="empty-copy record-empty">No development goals recorded.</p> : <ul className="workforce-record-list">{goals.map((goal) => <li key={goal.id}><div><strong>{goal.title}</strong><small>{goal.description}</small></div><div className="record-dates"><span className={`status-badge status-${goal.status}`}>{goal.status.replaceAll("_", " ")}</span>{goal.target_date && <small>Target {displayDate(goal.target_date)}</small>}</div></li>)}</ul>}
              </section>
              <section className="workforce-record-section"><div className="workforce-section-heading"><div><UsersRound size={17} /><div><h3>Feedback & milestones</h3><p>Constructive, employee-visible history</p></div></div></div>
                <details className="workforce-disclosure compact-disclosure"><summary><Plus size={14} />Add development entry</summary><form className="workforce-form-grid" onSubmit={addDevelopmentEntry}><label className="span-two">Entry type<select name="entry_type"><option value="supervisor_feedback">Supervisor feedback</option><option value="milestone">Development milestone</option><option value="job_experience">Relevant job experience</option></select></label><label className="span-two">Title<input name="title" required maxLength={160} /></label><label className="span-two">Notes<textarea name="note" rows={3} required minLength={5} maxLength={2000} /></label><div className="span-two workforce-form-actions"><span>Visible to the employee in their development history.</span><button className="button button-primary" type="submit" disabled={saving}>Add entry</button></div></form></details>
                {entries.length === 0 ? <p className="empty-copy record-empty">No feedback or milestones recorded.</p> : <ol className="development-timeline">{entries.map((entry) => <li key={entry.id}><span className="timeline-dot" /><div><span className="eyebrow">{entry.entry_type.replaceAll("_", " ")}</span><strong>{entry.title}</strong><p>{entry.note}</p><time>{displayDate(entry.created_at)}</time></div></li>)}</ol>}
              </section>
            </div>
            <section className="workforce-record-section assigned-work-section"><div className="workforce-section-heading"><div><ClipboardCheck size={17} /><div><h3>Assigned work</h3><p>Instructions and supervision requirements</p></div></div></div>{assignments.length === 0 ? <p className="empty-copy record-empty">No jobs assigned to this employee.</p> : <ul className="workforce-record-list">{assignments.map((assignment) => <li key={assignment.id}><div><strong>{assignment.job?.title || "Maintenance job"}</strong><small>{assignment.job?.job_ref} · {assignment.instructions || "No additional instructions"}</small></div><div className="record-dates"><span className={`status-badge status-${assignment.job?.status || "new"}`}>{assignment.job?.status?.replaceAll("_", " ") || "Assigned"}</span><span className="supervision-label">{assignment.requires_supervision ? "Supervision required" : "Independent assignment"}</span></div></li>)}</ul>}</section>
          </>}
        </section>
      </div>
      {inviteLink && <div className="invite-warning"><strong>Share invitation securely</strong><span>The link expires after seven days and is shown only here.</span></div>}
    </div>
  );
}
