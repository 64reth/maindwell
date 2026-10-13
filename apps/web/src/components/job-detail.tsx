"use client";

import { FormEvent, useEffect, useState } from "react";
import { CalendarDays, Clock3, ExternalLink, MapPin, UserRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ClientRecord, ContractorRecord, JobHistoryRecord, JobRecord, PropertyRecord } from "@/lib/types";

const statuses = ["new", "assigned", "in_progress", "completed", "cancelled"] as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value));
}

function labelStatus(value: string) {
  return value.replaceAll("_", " ");
}

type JobDetailProps = {
  job: JobRecord;
  property?: PropertyRecord;
  client?: ClientRecord;
  contractors: ContractorRecord[];
  onClose: () => void;
  onEdit: (job: JobRecord) => void;
  onSave: (jobId: string, changes: Record<string, unknown>) => Promise<void>;
};

export default function JobDetail({ job, property, client, contractors, onClose, onEdit, onSave }: JobDetailProps) {
  const [history, setHistory] = useState<JobHistoryRecord[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [status, setStatus] = useState(job.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [completedAt, setCompletedAt] = useState(job.completed_at?.slice(0, 10) || "");
  const eligible = contractors.filter((contractor) => contractor.verification_status === "verified" && contractor.trades.some((trade) => trade.toLowerCase() === job.trade.toLowerCase()));
  const currentContractor = contractors.find((contractor) => contractor.id === job.contractor_id);
  const availableContractors = currentContractor && !eligible.some((item) => item.id === currentContractor.id) ? [currentContractor, ...eligible] : eligible;

  useEffect(() => {
    let active = true;
    createClient().from("job_history").select("*").eq("job_id", job.id).order("created_at", { ascending: false })
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setHistoryError("Job history could not be loaded.");
        else setHistory((data || []) as JobHistoryRecord[]);
      });
    return () => { active = false; };
  }, [job.id, statusMessage]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatusMessage("");
    setSaving(true);
    const data = new FormData(event.currentTarget);
    const contractorId = String(data.get("contractor_id") || "") || null;
    let nextStatus = String(data.get("status")) as JobRecord["status"];
    if (contractorId && nextStatus === "new") nextStatus = "assigned";
    const completionNotes = String(data.get("completion_notes") || "").trim();
    const reviewStatus = String(data.get("review_status") || "not_reviewed");

    if (nextStatus === "completed" && (!completionNotes || !completedAt)) {
      setError("Add completion notes and the completion date before closing this job.");
      setSaving(false);
      return;
    }
    if (contractorId && contractorId !== job.contractor_id && !eligible.some((contractor) => contractor.id === contractorId)) {
      setError("Only verified contractors with the required trade can be assigned.");
      setSaving(false);
      return;
    }

    const changes = {
      status: nextStatus,
      contractor_id: contractorId,
      completion_notes: completionNotes || null,
      completed_at: nextStatus === "completed" ? completedAt : null,
      review_status: nextStatus === "completed" && reviewStatus === "not_reviewed" ? "pending" : reviewStatus,
      updated_at: new Date().toISOString(),
    };
    try {
      await onSave(job.id, changes);
      setStatusMessage("Job updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update this job.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog-panel job-dialog" role="dialog" aria-modal="true" aria-labelledby="job-dialog-title">
        <header className="dialog-header"><div><span className="eyebrow">{job.job_ref}</span><h2 id="job-dialog-title">{job.title}</h2></div><button className="icon-button" type="button" aria-label="Close job details" onClick={onClose}><X size={19} /></button></header>
        <div className="job-context"><div><MapPin size={16} /><span>{property ? `${property.address_line_1}, ${property.city} ${property.postcode}` : "Property unavailable"}</span></div><div><UserRound size={16} /><span>{client?.name || "Client unavailable"}</span></div><div><CalendarDays size={16} /><span>Logged {formatDate(job.created_at)}</span></div></div>
        <div className="job-summary-grid"><div><span>Priority</span><strong className={`priority-text priority-${job.priority}`}>{job.priority}</strong></div><div><span>Required trade</span><strong>{job.trade}</strong></div><div><span>Current status</span><strong className={`status-text status-${job.status}`}>{labelStatus(job.status)}</strong></div><div><span>Contractor</span><strong>{currentContractor?.business_name || "Unassigned"}</strong></div></div>
        <section className="description-block"><h3>Problem description</h3><p>{job.description}</p>{job.due_date && <span className="due-date"><Clock3 size={14} /> Target {formatDate(job.due_date)}</span>}</section>
        {job.status === "completed" && <section className="completion-readout"><h3>Completion record</h3><p>{job.completion_notes}</p><div><span>Completed {job.completed_at ? formatDate(job.completed_at) : "Date not recorded"}</span><span className={`status-text status-${job.review_status}`}>Review: {labelStatus(job.review_status)}</span></div></section>}
        <div className="job-detail-columns">
          <section className="history-section"><h3>Job history <span>{history.length}</span></h3>{historyError && <p className="inline-error">{historyError}</p>}{history.length === 0 && !historyError && <p className="empty-copy">No updates recorded yet.</p>}<ol className="history-list">{history.map((item) => <li key={item.id}><span className="timeline-dot" /><div><strong>{item.event}</strong>{item.note && <p>{item.note}</p>}<time>{formatDate(item.created_at)} · {new Intl.DateTimeFormat("en-GB", { timeStyle: "short" }).format(new Date(item.created_at))}</time></div></li>)}</ol></section>
          <form className="progress-form" onSubmit={submit}>
            <div className="progress-heading"><div><span className="eyebrow">Work update</span><h3>Assignment & progress</h3></div><button className="text-button" type="button" onClick={() => onEdit(job)}>Edit request <ExternalLink size={14} /></button></div>
            <label>Assign verified {job.trade.toLowerCase()} contractor<select name="contractor_id" defaultValue={job.contractor_id || ""}><option value="">Unassigned</option>{availableContractors.map((contractor) => <option key={contractor.id} value={contractor.id}>{contractor.business_name}{contractor.id === currentContractor?.id && contractor.verification_status !== "verified" ? " · check verification" : ""}</option>)}</select>{eligible.length === 0 && <span className="field-hint">No verified contractors are registered for {job.trade.toLowerCase()}.</span>}</label>
            <label>Job status<select name="status" value={status} onChange={(event) => { setStatus(event.target.value as JobRecord["status"]); if (event.target.value === "completed" && !completedAt) setCompletedAt(new Date().toISOString().slice(0, 10)); }}>{statuses.map((item) => <option key={item} value={item}>{labelStatus(item)}</option>)}</select></label>
            {status === "completed" && <>
              <label>Completion date<input type="date" value={completedAt} onChange={(event) => setCompletedAt(event.target.value)} required /></label>
              <label>Completion notes<textarea name="completion_notes" defaultValue={job.completion_notes || ""} rows={3} required maxLength={3000} placeholder="Work completed, parts used and any follow-up required." /></label>
              <label>Review status<select name="review_status" defaultValue={job.review_status === "not_reviewed" ? "pending" : job.review_status}><option value="pending">Awaiting review</option><option value="approved">Approved</option><option value="rework">Rework required</option></select></label>
            </>}
            {status !== "completed" && <input type="hidden" name="completion_notes" value={job.completion_notes || ""} />}
            {status !== "completed" && <input type="hidden" name="review_status" value={job.review_status} />}
            {error && <p className="form-message error-message" role="alert">{error}</p>}{statusMessage && <p className="form-message success-message" role="status">{statusMessage}</p>}
            <button className="button button-primary full-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save update"}</button>
          </form>
        </div>
      </section>
    </div>
  );
}
