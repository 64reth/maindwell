"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CalendarDays, ClipboardList, LogOut, Plus, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ClientRecord, JobRecord, PropertyRecord } from "@/lib/types";

const trades = ["Plumbing", "Electrical", "Heating", "Roofing", "General maintenance", "Locksmith", "Drainage", "Cleaning", "Other"];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value));
}

export default function ClientWorkspace() {
  const router = useRouter();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [notice, setNotice] = useState("");

  async function load() {
    setError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/"); return; }
    const { data: clientData, error: clientError } = await supabase.from("clients").select("*").eq("auth_user_id", user.id).maybeSingle();
    if (clientError || !clientData) {
      setError(clientError?.message || "This account is not linked to a client record.");
      setLoading(false);
      return;
    }
    const clientRecord = clientData as ClientRecord;
    setClient(clientRecord);
    const { data: propertyData, error: propertyError } = await supabase.from("properties").select("id,organization_id,client_id,address_line_1,address_line_2,city,postcode,property_type,created_at").eq("client_id", clientRecord.id).order("city");
    if (propertyError) {
      setError(propertyError.message);
      setLoading(false);
      return;
    }
    const propertyRecords = (propertyData || []) as PropertyRecord[];
    setProperties(propertyRecords);
    if (propertyRecords.length > 0) {
      const { data: jobData, error: jobsError } = await supabase.from("jobs").select("*").in("property_id", propertyRecords.map((property) => property.id)).order("created_at", { ascending: false });
      if (jobsError) setError(jobsError.message);
      else setJobs((jobData || []) as JobRecord[]);
    } else setJobs([]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/");
    router.refresh();
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    setSaving(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const { error: insertError } = await createClient().from("jobs").insert({
      organization_id: client.organization_id,
      property_id: data.get("property_id"),
      job_ref: `MD-${new Date().getFullYear().toString().slice(-2)}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
      title: String(data.get("title") || "").trim(),
      trade: data.get("trade"),
      description: String(data.get("description") || "").trim(),
      priority: data.get("priority"),
      status: "new",
      review_status: "not_reviewed",
    });
    if (insertError) setError(insertError.message);
    else {
      setRequestOpen(false);
      setNotice("Maintenance request submitted.");
      await load();
    }
    setSaving(false);
  }

  const active = jobs.filter((job) => !["completed", "cancelled"].includes(job.status));
  const completed = jobs.filter((job) => job.status === "completed");

  return (
    <main className="portal-shell client-portal">
      <header className="portal-topbar"><a className="brand-lockup brand-lockup-light" href="/client"><span className="brand-mark">M</span><span>MAINDWELL</span></a><span className="portal-role-label">CLIENT WORKSPACE</span><button className="account-button portal-signout" type="button" onClick={signOut}><LogOut size={16} />Sign out</button></header>
      <div className="portal-content">
        <div className="portal-title-row"><div><span className="eyebrow">Good work. Well managed.</span><h1>{client?.name || "Client workspace"}</h1><p>Property requests and work updates in one place.</p></div><button className="button button-primary" type="button" disabled={properties.length === 0} onClick={() => setRequestOpen(true)}><Plus size={16} />New maintenance request</button></div>
        {error && <p className="form-message error-message" role="alert">{error}</p>}{notice && <p className="form-message success-message" role="status">{notice}</p>}
        {loading ? <div className="loading-state"><span className="loading-mark">M</span><span>Loading your properties…</span></div> : <>
          <section className="portal-stat-grid"><div><span className="portal-stat-icon"><ClipboardList size={17} /></span><strong>{active.length}</strong><small>Open requests</small></div><div><span className="portal-stat-icon"><Building2 size={17} /></span><strong>{properties.length}</strong><small>Managed properties</small></div><div><span className="portal-stat-icon"><CalendarDays size={17} /></span><strong>{completed.length}</strong><small>Completed jobs</small></div></section>
          <section className="portal-section"><div className="section-heading"><div><span className="eyebrow">Your portfolio</span><h2>Properties & requests</h2></div></div>{properties.length === 0 ? <div className="empty-state"><div className="empty-icon"><Building2 size={20} /></div><h3>No properties linked</h3><p>Contact MAINDWELL to link a property to your account.</p></div> : <div className="client-property-list">{properties.map((property) => {
            const propertyJobs = jobs.filter((job) => job.property_id === property.id);
            return <article className="client-property" key={property.id}><div className="client-property-heading"><span className="property-icon"><Building2 size={18} /></span><div><h3>{property.address_line_1}</h3><p>{[property.address_line_2, property.city, property.postcode].filter(Boolean).join(", ")}</p></div><span className="property-job-count">{propertyJobs.length} {propertyJobs.length === 1 ? "request" : "requests"}</span></div>
              {propertyJobs.length > 0 && <div className="client-job-list">{propertyJobs.map((job) => <details className="client-job" key={job.id}><summary><span><strong>{job.title}</strong><small>{job.job_ref} · Submitted {formatDate(job.created_at)}</small></span><span className={`status-badge status-${job.status}`}><span />{job.status.replaceAll("_", " ")}</span></summary><div className="client-job-detail"><div className="client-job-meta"><span>Trade: {job.trade}</span><span>Priority: {job.priority}</span>{job.due_date && <span>Target: {formatDate(job.due_date)}</span>}</div><p>{job.description}</p>{job.review_status === "approved" && job.completion_notes && <div className="client-completion"><strong>Completion update</strong><p>{job.completion_notes}</p>{job.completed_at && <small>Completed {formatDate(job.completed_at)}</small>}</div>}{job.review_status !== "approved" && job.status === "completed" && <p className="client-review-note">Work marked complete and awaiting MAINDWELL review.</p>}</div></details>)}</div>}
            </article>;
          })}</div>}</section>
          <div className="portal-privacy"><ShieldCheck size={16} /><span>Client access is limited to your linked properties and maintenance requests.</span></div>
        </>}
      </div>
      {requestOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRequestOpen(false); }}><section className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="request-title"><header className="dialog-header"><div><span className="eyebrow">New request</span><h2 id="request-title">Report a maintenance issue</h2></div><button className="icon-button" type="button" aria-label="Close" onClick={() => setRequestOpen(false)}>×</button></header><form className="record-form" onSubmit={submitRequest}>
        <label>Property<select name="property_id" defaultValue="" required><option value="" disabled>Select a property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.address_line_1}, {property.postcode}</option>)}</select></label>
        <label>Issue title<input name="title" required maxLength={140} placeholder="e.g. Bathroom extractor fan not working" /></label>
        <div className="field-row"><label>Required trade<select name="trade" defaultValue="" required><option value="" disabled>Select a trade</option>{trades.map((trade) => <option key={trade}>{trade}</option>)}</select></label><label>Priority<select name="priority"><option value="normal">Normal</option><option value="low">Low</option><option value="high">High</option><option value="emergency">Emergency</option></select></label></div>
        <label>Problem description<textarea name="description" required minLength={10} maxLength={4000} rows={4} placeholder="Describe the issue and any relevant details." /></label>
        {error && <p className="form-message error-message" role="alert">{error}</p>}<footer className="dialog-actions"><button className="button button-subtle" type="button" onClick={() => setRequestOpen(false)}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? "Submitting…" : "Submit request"}</button></footer>
      </form></section></div>}
    </main>
  );
}
