"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, BriefcaseBusiness, Building2, CalendarDays, CheckCircle2,
  ChevronDown, ClipboardList, Clock3, Home, LogOut, Menu, Plus, Search, ShieldCheck,
  UsersRound, Wrench, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ClientRecord, ContractorRecord, EmployeeRecord, JobEmployeeAssignment, JobRecord, PageName, PropertyRecord, RecordKind } from "@/lib/types";
import JobDetail from "@/components/job-detail";
import RecordDialog from "@/components/record-dialog";
import WorkforceWorkspace from "@/components/workforce-workspace";

const navigation: { id: PageName; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "jobs", label: "Jobs", icon: ClipboardList },
  { id: "clients", label: "Clients", icon: UsersRound },
  { id: "properties", label: "Properties", icon: Building2 },
  { id: "contractors", label: "Contractors", icon: Wrench },
  { id: "workforce", label: "Workforce", icon: BriefcaseBusiness },
];

const pageCopy: Record<PageName, { title: string; description: string; addLabel: string; kind?: RecordKind }> = {
  overview: { title: "Operations overview", description: "A clear view of today's property work.", addLabel: "New request", kind: "job" },
  jobs: { title: "Jobs", description: "Maintenance requests, assignment and progress.", addLabel: "New request", kind: "job" },
  clients: { title: "Clients", description: "Landlords and letting agents you work with.", addLabel: "Add client", kind: "client" },
  properties: { title: "Properties", description: "Managed addresses and their client records.", addLabel: "Add property", kind: "property" },
  contractors: { title: "Contractors", description: "Trade partners, contact details and verification.", addLabel: "Register contractor", kind: "contractor" },
  workforce: { title: "Workforce", description: "Employment, assigned work and professional development.", addLabel: "Add employee" },
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value));
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function friendlyError(message: string) {
  if (message.includes("foreign key") || message.includes("violates foreign key")) return "This record is linked to other operational records and cannot be changed this way.";
  if (message.includes("duplicate key")) return "That reference is already in use. Please try again.";
  if (message.includes("violates check constraint")) return "Please check the required fields and values, then try again.";
  return message;
}

export default function Workspace() {
  const router = useRouter();
  const [page, setPage] = useState<PageName>("overview");
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [contractors, setContractors] = useState<ContractorRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [userRole, setUserRole] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [jobFilter, setJobFilter] = useState("all");
  const [recordKind, setRecordKind] = useState<RecordKind | null>(null);
  const [editing, setEditing] = useState<Record<string, unknown> | undefined>();
  const [selectedJobId, setSelectedJobId] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [clientInviteLink, setClientInviteLink] = useState("");
  const [clientInviteCopied, setClientInviteCopied] = useState(false);

  async function refreshData() {
    const supabase = createClient();
    setLoadError("");
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      router.replace("/");
      return;
    }
    setUserEmail(authData.user.email || "");
    const { data: membership, error: membershipError } = await supabase.from("org_memberships").select("organization_id,role").eq("user_id", authData.user.id).limit(1).maybeSingle();
    if (membershipError || !membership) {
      setLoadError("Your workspace membership could not be loaded. Please check the Supabase database migration.");
      setLoading(false);
      return;
    }
    const orgId = membership.organization_id as string;
    setOrganizationId(orgId);
    setUserRole(membership.role as string);
    const [orgResult, clientsResult, propertiesResult, contractorsResult, jobsResult, employeesResult] = await Promise.all([
      supabase.from("organizations").select("name").eq("id", orgId).single(),
      supabase.from("clients").select("*").order("name"),
      supabase.from("properties").select("*").order("city"),
      supabase.from("contractors").select("*").order("business_name"),
      supabase.from("jobs").select("*").order("created_at", { ascending: false }),
      supabase.from("employees").select("*").order("last_name"),
    ]);
    const failed = [orgResult, clientsResult, propertiesResult, contractorsResult, jobsResult, employeesResult].find((result) => result.error);
    if (failed?.error) {
      setLoadError(friendlyError(failed.error.message));
      setLoading(false);
      return;
    }
    setOrganizationName(orgResult.data?.name || "Operations workspace");
    setClients((clientsResult.data || []) as ClientRecord[]);
    setProperties((propertiesResult.data || []) as PropertyRecord[]);
    setContractors((contractorsResult.data || []) as ContractorRecord[]);
    setJobs((jobsResult.data || []) as JobRecord[]);
    setEmployees((employeesResult.data || []) as EmployeeRecord[]);
    setLoading(false);
  }

  useEffect(() => { void refreshData(); }, []);

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/");
    router.refresh();
  }

  function openNew(kind: RecordKind) {
    setEditing(undefined);
    setRecordKind(kind);
  }

  function openEdit(kind: RecordKind, record: object) {
    setEditing(record as Record<string, unknown>);
    setRecordKind(kind);
  }

  async function saveRecord(payload: Record<string, unknown>) {
    if (!organizationId) throw new Error("Workspace is still loading. Please try again.");
    const supabase = createClient();
    const table = recordKind === "client" ? "clients" : recordKind === "property" ? "properties" : recordKind === "contractor" ? "contractors" : "jobs";
    const record = { ...payload };
    if (recordKind === "job" && !editing?.id) {
      record.job_ref = `MD-${new Date().getFullYear().toString().slice(-2)}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      record.status = "new";
      record.review_status = "not_reviewed";
    }
    const result = editing?.id
      ? await supabase.from(table).update({ ...record, updated_at: new Date().toISOString() } as never).eq("id", String(editing.id))
      : await supabase.from(table).insert({ ...record, organization_id: organizationId } as never);
    if (result.error) throw new Error(friendlyError(result.error.message));
    setRecordKind(null);
    setEditing(undefined);
    setNotice(editing?.id ? "Record updated." : "Record added.");
    await refreshData();
  }

  async function saveJob(jobId: string, changes: Record<string, unknown>) {
    const { error } = await createClient().from("jobs").update(changes as never).eq("id", jobId);
    if (error) throw new Error(friendlyError(error.message));
    setNotice("Job progress saved.");
    await refreshData();
  }

  async function assignEmployee(jobId: string, employeeId: string, instructions: string, requiresSupervision: boolean) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Your session has expired. Please sign in again.");
    const organizationId = jobs.find((job) => job.id === jobId)?.organization_id;
    if (!organizationId) throw new Error("The job could not be found in this workspace.");
    const { data, error } = await supabase.from("job_employee_assignments").insert({
      organization_id: organizationId,
      job_id: jobId,
      employee_id: employeeId,
      instructions: instructions.trim(),
      requires_supervision: requiresSupervision,
      assigned_by: user.id,
    }).select("*").single();
    if (error) throw new Error(friendlyError(error.message));
    await refreshData();
    return data as JobEmployeeAssignment;
  }

  async function removeEmployeeAssignment(assignmentId: string) {
    const { error } = await createClient().from("job_employee_assignments").delete().eq("id", assignmentId);
    if (error) throw new Error(friendlyError(error.message));
  }

  async function inviteClient(clientId: string) {
    const { data, error } = await createClient().rpc("create_portal_invite", { target_role: "client", target_record: clientId });
    if (error) {
      setLoadError(friendlyError(error.message));
      return;
    }
    setLoadError("");
    setClientInviteLink(`${window.location.origin}/join?token=${encodeURIComponent(String(data))}`);
    setClientInviteCopied(false);
  }

  const selectedJob = jobs.find((job) => job.id === selectedJobId);
  const canManage = ["owner", "admin", "operations"].includes(userRole);
  const copy = pageCopy[page];
  const activeJobs = jobs.filter((job) => !["completed", "cancelled"].includes(job.status));
  const newJobs = jobs.filter((job) => job.status === "new");
  const unassignedJobs = jobs.filter((job) => !job.contractor_id && !["completed", "cancelled"].includes(job.status));
  const inProgressJobs = jobs.filter((job) => job.status === "in_progress");
  const completedJobs = jobs.filter((job) => job.status === "completed");
  const normalizedQuery = query.trim().toLowerCase();

  function locationFor(job: JobRecord) {
    const property = properties.find((item) => item.id === job.property_id);
    return property ? `${property.address_line_1}, ${property.postcode}` : "Property unavailable";
  }

  function isJobMatch(job: JobRecord) {
    const contractor = contractors.find((item) => item.id === job.contractor_id);
    const searchable = `${job.job_ref} ${job.title} ${job.description} ${job.trade} ${locationFor(job)} ${contractor?.business_name || ""}`.toLowerCase();
    return searchable.includes(normalizedQuery) && (jobFilter === "all" || job.status === jobFilter);
  }

  const filteredJobs = jobs.filter(isJobMatch);
  const filteredClients = clients.filter((client) => `${client.name} ${client.contact_name} ${client.email} ${client.phone}`.toLowerCase().includes(normalizedQuery));
  const filteredProperties = properties.filter((property) => `${property.address_line_1} ${property.address_line_2 || ""} ${property.city} ${property.postcode} ${clients.find((client) => client.id === property.client_id)?.name || ""}`.toLowerCase().includes(normalizedQuery));
  const filteredContractors = contractors.filter((contractor) => `${contractor.business_name} ${contractor.contact_name} ${contractor.email} ${contractor.trades.join(" ")}`.toLowerCase().includes(normalizedQuery));

  return (
    <div className={`workspace-shell ${canManage ? "" : "workspace-read-only"}`}>
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <a className="brand-lockup brand-lockup-light" href="/dashboard"><span className="brand-mark">M</span><span>MAINDWELL</span></a>
        <div className="workspace-label"><span className="workspace-avatar">{organizationName.slice(0, 1).toUpperCase() || "M"}</span><span><strong>{organizationName || "Your workspace"}</strong><small>Operations team</small></span><ChevronDown size={15} /></div>
        <span className="sidebar-caption">WORKSPACE</span>
        <nav className="side-nav" aria-label="Main navigation">{navigation.filter(({ id }) => id !== "workforce" || canManage).map(({ id, label, icon: Icon }) => <button type="button" key={id} className={page === id ? "nav-item nav-item-active" : "nav-item"} onClick={() => { setPage(id); setMobileNavOpen(false); setNotice(""); }}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{id === "jobs" && unassignedJobs.length > 0 && <span className="nav-count">{unassignedJobs.length}</span>}</button>)}</nav>
        <div className="sidebar-bottom"><div className="privacy-note"><ShieldCheck size={16} /><span>Private workspace<br /><small>Your records stay with your business.</small></span></div><button className="account-button" type="button" onClick={signOut}><span className="account-avatar">{userEmail.slice(0, 1).toUpperCase() || "U"}</span><span className="account-copy"><strong>{userEmail || "Account"}</strong><small>Sign out</small></span><LogOut size={16} /></button></div>
      </aside>
      {mobileNavOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <main className="workspace-main">
        <header className="topbar"><button className="mobile-menu icon-button" type="button" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button><div className="breadcrumb"><span>Workspace</span><span>/</span><strong>{copy.title}</strong></div><div className="topbar-right"><label className="global-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this view" aria-label="Search this view" /><kbd>⌘ K</kbd></label><span className="today-label"><CalendarDays size={16} />{new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date())}</span></div></header>
        <div className="page-content">
          <div className="page-heading"><div><p className="eyebrow">{new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p><h1>{copy.title}</h1><p>{copy.description}</p></div>{canManage && copy.kind && <button className="button button-primary" type="button" onClick={() => openNew(copy.kind!)} disabled={(copy.kind === "property" && clients.length === 0) || (copy.kind === "job" && properties.length === 0)}><Plus size={17} />{copy.kind === "property" && clients.length === 0 ? "Add a client first" : copy.kind === "job" && properties.length === 0 ? "Add a property first" : copy.addLabel}</button>}</div>
          {notice && <div className="notice-bar" role="status"><CheckCircle2 size={16} />{notice}<button className="icon-button" type="button" aria-label="Dismiss message" onClick={() => setNotice("")}><X size={15} /></button></div>}
          {clientInviteLink && <div className="invite-link-row client-invite-link"><input readOnly aria-label="Client invitation link" value={clientInviteLink} /><button className="button button-subtle" type="button" onClick={() => { void navigator.clipboard.writeText(clientInviteLink).then(() => setClientInviteCopied(true)); }}><BriefcaseBusiness size={14} />{clientInviteCopied ? "Copied" : "Copy client link"}</button><button className="icon-button" type="button" aria-label="Close invitation link" onClick={() => setClientInviteLink("")}><X size={15} /></button></div>}
          {loadError && <div className="load-error" role="alert"><strong>Workspace data unavailable</strong><span>{loadError}</span><button className="button button-subtle" type="button" onClick={() => { setLoading(true); void refreshData(); }}>Try again</button></div>}
          {loading ? <div className="loading-state"><span className="loading-mark">M</span><span>Loading your workspace…</span></div> : !loadError && <>
            {page === "overview" && <Overview jobs={jobs} active={activeJobs.length} newCount={newJobs.length} unassigned={unassignedJobs.length} inProgress={inProgressJobs.length} completed={completedJobs.length} properties={properties} clients={clients} contractors={contractors} onOpenJobs={() => setPage("jobs")} onOpenJob={setSelectedJobId} locationFor={locationFor} />}
            {page === "jobs" && <JobsPage jobs={filteredJobs} properties={properties} contractors={contractors} filter={jobFilter} onFilter={setJobFilter} onOpen={setSelectedJobId} />}
            {page === "clients" && <ClientsPage clients={filteredClients} properties={properties} onEdit={canManage ? (client) => openEdit("client", client) : undefined} onInvite={canManage ? (client) => void inviteClient(client.id) : undefined} />}
            {page === "properties" && <PropertiesPage properties={filteredProperties} clients={clients} jobs={jobs} onEdit={canManage ? (property) => openEdit("property", property) : undefined} />}
            {page === "contractors" && <ContractorsPage contractors={filteredContractors} jobs={jobs} onEdit={canManage ? (contractor) => openEdit("contractor", contractor) : undefined} />}
            {page === "workforce" && canManage && <WorkforceWorkspace organizationId={organizationId} />}
          </>}
        </div>
      </main>
      {canManage && recordKind && <RecordDialog kind={recordKind} initial={editing} clients={clients} properties={properties} contractors={contractors} onClose={() => { setRecordKind(null); setEditing(undefined); }} onSubmit={saveRecord} />}
      {selectedJob && <JobDetail key={selectedJob.id} job={selectedJob} property={properties.find((property) => property.id === selectedJob.property_id)} client={clients.find((client) => client.id === properties.find((property) => property.id === selectedJob.property_id)?.client_id)} contractors={contractors} employees={employees} canManage={canManage} onClose={() => setSelectedJobId("")} onEdit={(job) => { setSelectedJobId(""); openEdit("job", job); }} onSave={saveJob} onAssignEmployee={assignEmployee} onRemoveEmployee={removeEmployeeAssignment} />}
    </div>
  );
}

type OverviewProps = {
  jobs: JobRecord[];
  active: number;
  newCount: number;
  unassigned: number;
  inProgress: number;
  completed: number;
  properties: PropertyRecord[];
  clients: ClientRecord[];
  contractors: ContractorRecord[];
  onOpenJobs: () => void;
  onOpenJob: (id: string) => void;
  locationFor: (job: JobRecord) => string;
};

function Overview({ jobs, active, newCount, unassigned, inProgress, completed, properties, clients, contractors, onOpenJobs, onOpenJob, locationFor }: OverviewProps) {
  const stats: { label: string; value: number; caption: string; icon: LucideIcon; tone: string; action?: () => void }[] = [
    { label: "Active jobs", value: active, caption: "All open work", icon: ClipboardList, tone: "green", action: onOpenJobs },
    { label: "New requests", value: newCount, caption: "Awaiting review", icon: ArrowDownRight, tone: "blue", action: onOpenJobs },
    { label: "Unassigned", value: unassigned, caption: "Need a contractor", icon: UsersRound, tone: "amber", action: onOpenJobs },
    { label: "In progress", value: inProgress, caption: "Work underway", icon: Clock3, tone: "coral", action: onOpenJobs },
    { label: "Completed", value: completed, caption: "All time", icon: CheckCircle2, tone: "sage", action: onOpenJobs },
  ];
  const recentJobs = jobs.slice(0, 6);
  const needsAttention = jobs.filter((job) => job.priority === "emergency" || job.priority === "high").filter((job) => !["completed", "cancelled"].includes(job.status)).slice(0, 3);

  return (
    <>
      <section className="stat-grid" aria-label="Job summary">{stats.map(({ label, value, caption, icon: Icon, tone, action }) => <button type="button" className="stat-card" key={label} onClick={action}><span className={`stat-icon tone-${tone}`}><Icon size={18} /></span><span className="stat-value">{value}</span><span className="stat-label">{label}</span><span className="stat-caption">{caption}<ArrowRight size={13} /></span></button>)}</section>
      <div className="overview-columns"><section className="content-section recent-section"><div className="section-heading"><div><span className="eyebrow">Latest activity</span><h2>Recent jobs</h2></div><button className="text-button" type="button" onClick={onOpenJobs}>View all jobs <ArrowRight size={15} /></button></div>
        {recentJobs.length === 0 ? <div className="empty-state"><div className="empty-icon"><ClipboardList size={21} /></div><h3>No jobs yet</h3><p>Requests you create will appear here. Start by adding a client, property and contractor.</p></div> : <div className="table-scroll"><table><thead><tr><th>Job</th><th>Property</th><th>Status</th><th>Priority</th><th>Logged</th></tr></thead><tbody>{recentJobs.map((job) => <tr key={job.id} className="clickable-row" onClick={() => onOpenJob(job.id)}><td><strong>{job.title}</strong><span className="cell-subtext">{job.job_ref}</span></td><td>{locationFor(job)}</td><td><StatusBadge status={job.status} /></td><td><PriorityBadge priority={job.priority} /></td><td>{dateLabel(job.created_at)}</td></tr>)}</tbody></table></div>}
      </section><aside className="overview-aside"><section className="attention-section"><div className="section-heading"><div><span className="eyebrow">Priority queue</span><h2>Needs attention</h2></div><span className="attention-count">{needsAttention.length}</span></div>{needsAttention.length === 0 ? <p className="empty-copy attention-empty">No urgent or high-priority open work.</p> : <ul className="attention-list">{needsAttention.map((job) => <li key={job.id}><button type="button" onClick={() => onOpenJob(job.id)}><span className={`attention-line priority-${job.priority}`} /><span><strong>{job.title}</strong><small>{job.job_ref} · {job.trade}</small></span><ArrowUpRight size={15} /></button></li>)}</ul>}</section>
        <section className="readiness-section"><div className="section-heading"><div><span className="eyebrow">Workspace records</span><h2>Ready to work</h2></div></div><div className="readiness-row"><span><UsersRound size={16} /> Clients</span><strong>{clients.length}</strong></div><div className="readiness-row"><span><Building2 size={16} /> Properties</span><strong>{properties.length}</strong></div><div className="readiness-row"><span><Wrench size={16} /> Verified contractors</span><strong>{contractors.filter((item) => item.verification_status === "verified").length}<small> / {contractors.length}</small></strong></div></section>
      </aside></div>
    </>
  );
}

function JobsPage({ jobs, properties, contractors, filter, onFilter, onOpen }: { jobs: JobRecord[]; properties: PropertyRecord[]; contractors: ContractorRecord[]; filter: string; onFilter: (value: string) => void; onOpen: (id: string) => void }) {
  return <section className="content-section list-section"><div className="list-toolbar"><div><span className="eyebrow">{jobs.length} {jobs.length === 1 ? "record" : "records"}</span><h2>Maintenance requests</h2></div><label className="select-filter">Filter by status<select value={filter} onChange={(event) => onFilter(event.target.value)}><option value="all">All statuses</option><option value="new">New</option><option value="assigned">Assigned</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label></div>{jobs.length === 0 ? <EmptyList title="No matching jobs" description="Create a request or adjust your search and status filter." /> : <div className="table-scroll"><table><thead><tr><th>Job</th><th>Property</th><th>Trade</th><th>Contractor</th><th>Status</th><th>Priority</th><th>Target date</th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id} className="clickable-row" onClick={() => onOpen(job.id)}><td><strong>{job.title}</strong><span className="cell-subtext">{job.job_ref}</span></td><td>{properties.find((property) => property.id === job.property_id)?.address_line_1 || "Property unavailable"}</td><td>{job.trade}</td><td>{contractors.find((contractor) => contractor.id === job.contractor_id)?.business_name || <span className="unassigned-label">Unassigned</span>}</td><td><StatusBadge status={job.status} /></td><td><PriorityBadge priority={job.priority} /></td><td>{job.due_date ? dateLabel(job.due_date) : "—"}</td></tr>)}</tbody></table></div>}</section>;
}

function ClientsPage({ clients, properties, onEdit = () => {}, onInvite = () => {} }: { clients: ClientRecord[]; properties: PropertyRecord[]; onEdit?: (client: ClientRecord) => void; onInvite?: (client: ClientRecord) => void }) {
  return <section className="content-section list-section"><div className="list-toolbar"><div><span className="eyebrow">{clients.length} {clients.length === 1 ? "record" : "records"}</span><h2>Client directory</h2></div></div>{clients.length === 0 ? <EmptyList title="No clients added" description="Add a landlord or letting agent to start building your property records." /> : <div className="table-scroll"><table><thead><tr><th>Client</th><th>Type</th><th>Contact</th><th>Email</th><th>Phone</th><th>Properties</th><th>Portal</th><th></th></tr></thead><tbody>{clients.map((client) => <tr key={client.id}><td><strong>{client.name}</strong></td><td><span className="type-label">{client.type === "letting_agent" ? "Letting agent" : "Landlord"}</span></td><td>{client.contact_name}</td><td><a className="table-link" href={`mailto:${client.email}`}>{client.email}</a></td><td><a className="table-link" href={`tel:${client.phone}`}>{client.phone}</a></td><td>{properties.filter((property) => property.client_id === client.id).length}</td><td>{client.auth_user_id ? <span className="portal-linked">Connected</span> : <button className="row-action" type="button" onClick={() => onInvite(client)}>Create invite</button>}</td><td><button className="row-action" type="button" onClick={() => onEdit(client)}>Edit</button></td></tr>)}</tbody></table></div>}</section>;
}

function PropertiesPage({ properties, clients, jobs, onEdit = () => {} }: { properties: PropertyRecord[]; clients: ClientRecord[]; jobs: JobRecord[]; onEdit?: (property: PropertyRecord) => void }) {
  return <section className="content-section list-section"><div className="list-toolbar"><div><span className="eyebrow">{properties.length} {properties.length === 1 ? "record" : "records"}</span><h2>Managed properties</h2></div></div>{properties.length === 0 ? <EmptyList title="No properties added" description="Link a property to a client so maintenance requests can be tracked against the right address." /> : <div className="table-scroll"><table><thead><tr><th>Address</th><th>Client</th><th>Type</th><th>Open jobs</th><th>Access notes</th><th></th></tr></thead><tbody>{properties.map((property) => <tr key={property.id}><td><strong>{property.address_line_1}</strong><span className="cell-subtext">{[property.address_line_2, property.city, property.postcode].filter(Boolean).join(", ")}</span></td><td>{clients.find((client) => client.id === property.client_id)?.name || "Client unavailable"}</td><td>{property.property_type}</td><td>{jobs.filter((job) => job.property_id === property.id && !["completed", "cancelled"].includes(job.status)).length}</td><td className="truncate-cell">{property.access_notes || "—"}</td><td><button className="row-action" type="button" onClick={() => onEdit(property)}>Edit</button></td></tr>)}</tbody></table></div>}</section>;
}

function ContractorsPage({ contractors, jobs, onEdit = () => {} }: { contractors: ContractorRecord[]; jobs: JobRecord[]; onEdit?: (contractor: ContractorRecord) => void }) {
  return <section className="content-section list-section"><div className="list-toolbar"><div><span className="eyebrow">{contractors.length} {contractors.length === 1 ? "record" : "records"}</span><h2>Contractor directory</h2></div></div>{contractors.length === 0 ? <EmptyList title="No contractors registered" description="Add trade partners and record their verification before assigning work." /> : <div className="table-scroll"><table><thead><tr><th>Business</th><th>Trades</th><th>Contact</th><th>Email / phone</th><th>Verification</th><th>Active jobs</th><th></th></tr></thead><tbody>{contractors.map((contractor) => <tr key={contractor.id}><td><strong>{contractor.business_name}</strong><span className="cell-subtext">{contractor.contact_name}</span></td><td><div className="trade-list">{contractor.trades.map((trade) => <span key={trade}>{trade}</span>)}</div></td><td>{contractor.contact_name}</td><td><a className="table-link" href={`mailto:${contractor.email}`}>{contractor.email}</a><span className="cell-subtext">{contractor.phone}</span></td><td><StatusBadge status={contractor.verification_status} /></td><td>{jobs.filter((job) => job.contractor_id === contractor.id && !["completed", "cancelled"].includes(job.status)).length}</td><td><button className="row-action" type="button" onClick={() => onEdit(contractor)}>Edit</button></td></tr>)}</tbody></table></div>}</section>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge status-${status}`}><span />{statusLabel(status)}</span>;
}

function PriorityBadge({ priority }: { priority: string }) {
  return <span className={`priority-badge priority-${priority}`}>{priority}</span>;
}

function EmptyList({ title, description }: { title: string; description: string }) {
  return <div className="empty-state list-empty"><div className="empty-icon"><Search size={19} /></div><h3>{title}</h3><p>{description}</p></div>;
}
