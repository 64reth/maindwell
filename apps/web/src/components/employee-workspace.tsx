"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Award, BookOpenCheck, CalendarDays, ClipboardList, GraduationCap, LogOut, MapPin, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { CompetencyAssessment, DevelopmentEntry, DevelopmentGoal, EmployeeRecord, JobEmployeeAssignment, JobRecord, PropertyRecord, TrainingRecord } from "@/lib/types";

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value)) : "Not recorded";
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

type EmployeeJob = JobEmployeeAssignment & { job?: JobRecord; property?: Pick<PropertyRecord, "address_line_1" | "address_line_2" | "city" | "postcode" | "access_notes"> };

type EmployeeProfileResponse = EmployeeRecord & { supervisor_name?: string | null };

export default function EmployeeWorkspace() {
  const router = useRouter();
  const [profile, setProfile] = useState<EmployeeProfileResponse | null>(null);
  const [assignments, setAssignments] = useState<EmployeeJob[]>([]);
  const [training, setTraining] = useState<TrainingRecord[]>([]);
  const [assessments, setAssessments] = useState<CompetencyAssessment[]>([]);
  const [goals, setGoals] = useState<DevelopmentGoal[]>([]);
  const [entries, setEntries] = useState<DevelopmentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingJob, setSavingJob] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/"); return; }
    const { data: profileData, error: profileError } = await supabase.rpc("get_my_employee_profile");
    if (profileError || !profileData) {
      setError("Your employee profile could not be loaded. Contact your supervisor.");
      setLoading(false);
      return;
    }
    const employee = profileData as EmployeeProfileResponse;
    setProfile(employee);
    const [assignmentResult, trainingResult, assessmentResult, goalResult, entryResult] = await Promise.all([
      supabase.from("job_employee_assignments").select("*").eq("employee_id", employee.id).order("created_at", { ascending: false }),
      supabase.from("employee_training_records").select("*").eq("employee_id", employee.id).order("created_at", { ascending: false }),
      supabase.from("employee_competency_assessments").select("*").eq("employee_id", employee.id).order("assessed_at", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("employee_development_goals").select("*").eq("employee_id", employee.id).order("created_at", { ascending: false }),
      supabase.from("employee_development_entries").select("*").eq("employee_id", employee.id).order("created_at", { ascending: false }),
    ]);
    const failed = [assignmentResult, trainingResult, assessmentResult, goalResult, entryResult].find((result) => result.error);
    if (failed?.error) {
      setError("Some of your work or development records could not be loaded.");
      setLoading(false);
      return;
    }
    const assigned = (assignmentResult.data || []) as JobEmployeeAssignment[];
    let assignedJobs: EmployeeJob[] = assigned;
    if (assigned.length > 0) {
      const jobResult = await supabase.from("jobs").select("*").in("id", assigned.map((item) => item.job_id));
      if (!jobResult.error) {
        const jobs = (jobResult.data || []) as JobRecord[];
        const propertiesResult = jobs.length > 0
          ? await supabase.from("properties").select("id,address_line_1,address_line_2,city,postcode,access_notes").in("id", jobs.map((job) => job.property_id))
          : { data: [], error: null };
        const jobsById = new Map(jobs.map((job) => [job.id, job]));
        const propertiesById = new Map((propertiesResult.data || []).map((property) => [property.id as string, property]));
        assignedJobs = assigned.map((item) => {
          const job = jobsById.get(item.job_id);
          return { ...item, job, property: job ? propertiesById.get(job.property_id) as EmployeeJob["property"] : undefined };
        });
      }
    }
    setAssignments(assignedJobs);
    setTraining((trainingResult.data || []) as TrainingRecord[]);
    setAssessments((assessmentResult.data || []) as CompetencyAssessment[]);
    setGoals((goalResult.data || []) as DevelopmentGoal[]);
    setEntries((entryResult.data || []) as DevelopmentEntry[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/");
    router.refresh();
  }

  async function updateJob(event: FormEvent<HTMLFormElement>, job: JobRecord) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSavingJob(job.id);
    const data = new FormData(event.currentTarget);
    const nextStatus = String(data.get("status"));
    const completionNote = String(data.get("completion_note") || "").trim();
    const completionDate = String(data.get("completion_date") || "");
    if (nextStatus === "completed" && (completionNote.length < 10 || !completionDate)) {
      setError("Add completion notes and a completion date before submitting this job.");
      setSavingJob("");
      return;
    }
    const { error: updateError } = await createClient().rpc("employee_update_assigned_job", {
      target_job: job.id,
      next_status: nextStatus,
      completion_note: nextStatus === "completed" ? completionNote : null,
      completion_date: nextStatus === "completed" ? completionDate : null,
    });
    if (updateError) setError(updateError.message);
    else {
      setNotice(nextStatus === "completed" ? "Completion submitted for supervisor review." : "Work progress updated.");
      await load();
    }
    setSavingJob("");
  }

  const currentTraining = training.filter((item) => item.status !== "completed");
  const latestAssessments = assessments.reduce<CompetencyAssessment[]>((latest, item) => {
    if (!latest.some((saved) => saved.task_name.toLowerCase() === item.task_name.toLowerCase())) latest.push(item);
    return latest;
  }, []);
  const nextSkills = latestAssessments.filter((item) => item.outcome !== "approved_independent");
  const activeJobs = assignments.filter((assignment) => assignment.job && !["completed", "cancelled"].includes(assignment.job.status));

  return (
    <main className="portal-shell employee-portal">
      <header className="portal-topbar"><a className="brand-lockup brand-lockup-light" href="/employee"><span className="brand-mark">M</span><span>MAINDWELL</span></a><span className="portal-role-label">EMPLOYEE WORKSPACE</span><button className="account-button portal-signout" type="button" onClick={signOut}><LogOut size={16} />Sign out</button></header>
      <div className="portal-content">
        {loading ? <div className="loading-state"><span className="loading-mark">M</span><span>Loading your workspace…</span></div> : error && !profile ? <div className="portal-error" role="alert">{error}</div> : profile && <>
          <div className="portal-title-row"><div><span className="eyebrow">Good work. Well managed.</span><h1>Good morning, {profile.first_name}</h1><p>Your assigned work, training and development in one place.</p></div><span className="employee-self-role">{profile.employment_role}</span></div>
          {error && <p className="form-message error-message" role="alert">{error}</p>}{notice && <p className="form-message success-message" role="status">{notice}</p>}
          <section className="employee-profile-strip"><div className="employee-large-avatar">{profile.first_name[0]}{profile.last_name[0]}</div><div><span className="eyebrow">My profile</span><strong>{profile.first_name} {profile.last_name}</strong><p>{profile.email}{profile.phone ? ` · ${profile.phone}` : ""}</p></div><div className="profile-supervisor"><small>Supervisor</small><strong>{profile.supervisor_name || "Not assigned"}</strong></div><div className="profile-start-date"><small>Start date</small><strong>{formatDate(profile.start_date)}</strong></div></section>
          <section className="portal-stat-grid"><div><span className="portal-stat-icon"><ClipboardList size={17} /></span><strong>{activeJobs.length}</strong><small>Assigned open jobs</small></div><div><span className="portal-stat-icon"><GraduationCap size={17} /></span><strong>{training.length}</strong><small>Training & qualifications</small></div><div><span className="portal-stat-icon"><Award size={17} /></span><strong>{latestAssessments.filter((item) => item.outcome === "approved_independent").length}</strong><small>Independently approved tasks</small></div></section>
          <div className="employee-columns">
            <section className="portal-section employee-jobs-section"><div className="section-heading"><div><span className="eyebrow">Work assigned to me</span><h2>My jobs</h2></div></div>
              {assignments.length === 0 ? <div className="empty-state"><div className="empty-icon"><ClipboardList size={20} /></div><h3>No work assigned yet</h3><p>Your supervisor will add jobs and instructions here.</p></div> : <div className="employee-job-list">{assignments.map((assignment) => {
                const job = assignment.job;
                if (!job) return null;
                const isClosed = ["completed", "cancelled"].includes(job.status);
                return <article className="employee-job-card" key={assignment.id}><div className="employee-job-heading"><div><span className="eyebrow">{job.job_ref} · {job.trade}</span><h3>{job.title}</h3></div><span className={`status-badge status-${job.status}`}><span />{statusLabel(job.status)}</span></div>{assignment.property && <div className="employee-job-property"><MapPin size={14} /><span>{[assignment.property.address_line_1, assignment.property.address_line_2, assignment.property.city, assignment.property.postcode].filter(Boolean).join(", ")}{assignment.property.access_notes && <small>Access: {assignment.property.access_notes}</small>}</span></div>}<p className="employee-job-description">{job.description}</p><div className="employee-instructions"><strong>Job instructions</strong><p>{assignment.instructions || "Follow the task description and agreed work process."}</p><small>{assignment.requires_supervision ? "Supervisor support required for this assignment" : "Assigned for independent work"}</small></div>
                  {job.status === "completed" && <div className="employee-completion-status"><strong>Completion submitted</strong><p>{job.completion_notes}</p><small>{job.completed_at && `Submitted ${formatDate(job.completed_at)} · `}Review: {statusLabel(job.review_status)}</small></div>}
                  {!isClosed && <details className="employee-job-update"><summary>Update work progress</summary><form className="employee-update-form" onSubmit={(event) => void updateJob(event, job)}><label>Progress<select name="status" defaultValue={job.status === "in_progress" ? "in_progress" : "in_progress"}><option value="in_progress">Work in progress</option><option value="completed">Submit as complete</option></select></label><label>Completion date<input type="date" name="completion_date" defaultValue={new Date().toISOString().slice(0, 10)} /></label><label className="span-two">Completion notes<textarea name="completion_note" rows={3} maxLength={3000} placeholder="Describe work completed, parts used and anything your supervisor should review." /></label><button className="button button-primary" type="submit" disabled={savingJob === job.id}>{savingJob === job.id ? "Saving…" : "Save progress"}</button></form></details>}
                </article>;
              })}</div>}
            </section>
            <aside className="employee-development-column"><section className="portal-section"><div className="section-heading"><div><span className="eyebrow">Development plan</span><h2>What to work on next</h2></div></div><div className="next-step-list">{currentTraining.map((item) => <div className="next-step" key={item.id}><span className="next-step-marker"><GraduationCap size={15} /></span><div><strong>{item.title}</strong><p>{item.record_type === "qualification" ? "Qualification" : "Training"} · {statusLabel(item.status)}</p>{item.expires_on && <small>Expires {formatDate(item.expires_on)}</small>}</div></div>)}{nextSkills.map((item) => <div className="next-step" key={item.id}><span className="next-step-marker"><ShieldCheck size={15} /></span><div><strong>{item.task_name}</strong><p>{item.outcome === "needs_supervision" ? "Continue with supervision" : "Build experience under supervision"}</p>{item.review_due && <small>Review due {formatDate(item.review_due)}</small>}</div></div>)}{goals.filter((goal) => goal.status !== "achieved").map((goal) => <div className="next-step" key={goal.id}><span className="next-step-marker"><BookOpenCheck size={15} /></span><div><strong>{goal.title}</strong><p>{goal.description}</p>{goal.target_date && <small>Target {formatDate(goal.target_date)}</small>}</div></div>)}{currentTraining.length === 0 && nextSkills.length === 0 && goals.every((goal) => goal.status === "achieved") && <p className="empty-copy">No next steps have been set. Ask your supervisor about your next development goal.</p>}</div></section>
              <section className="portal-section"><div className="section-heading"><div><span className="eyebrow">My record</span><h2>Skills & qualifications</h2></div></div>{training.length === 0 && latestAssessments.length === 0 ? <p className="empty-copy portal-empty-copy">Your supervisor will add verified training and task assessments here.</p> : <ul className="employee-credential-list">{training.map((item) => <li key={item.id}><span><strong>{item.title}</strong><small>{item.record_type === "qualification" ? "Qualification" : "Training"}</small></span><span className={`status-badge status-${item.status}`}>{item.status === "completed" && item.expires_on && new Date(item.expires_on) < new Date() ? "expired" : statusLabel(item.status)}</span></li>)}{latestAssessments.map((item) => <li key={item.id}><span><strong>{item.task_name}</strong><small>Assessed {formatDate(item.assessed_at)}</small></span><span className={`competency-level competency-${item.outcome}`}>{item.outcome === "approved_independent" ? "Independent" : "Supervised"}</span></li>)}</ul>}</section>
              <section className="portal-section"><div className="section-heading"><div><span className="eyebrow">Learning record</span><h2>Development history</h2></div></div>{entries.length === 0 ? <p className="empty-copy portal-empty-copy">Feedback, milestones and relevant job experience will appear here.</p> : <ol className="development-timeline">{entries.map((entry) => <li key={entry.id}><span className="timeline-dot" /><div><span className="eyebrow">{statusLabel(entry.entry_type)}</span><strong>{entry.title}</strong><p>{entry.note}</p><time>{formatDate(entry.created_at)}</time></div></li>)}</ol>}</section>
              <div className="portal-privacy"><ShieldCheck size={16} /><span>Your profile and development records are visible only to you and authorised managers.</span></div>
            </aside>
          </div>
        </>}
      </div>
    </main>
  );
}
