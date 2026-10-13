export type ClientRecord = {
  id: string;
  organization_id: string;
  type: "landlord" | "letting_agent";
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  created_at: string;
};

export type PropertyRecord = {
  id: string;
  organization_id: string;
  client_id: string;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  postcode: string;
  property_type: string;
  access_notes: string | null;
  created_at: string;
};

export type ContractorRecord = {
  id: string;
  organization_id: string;
  business_name: string;
  contact_name: string;
  email: string;
  phone: string;
  trades: string[];
  verification_status: "pending" | "verified" | "expired";
  notes: string | null;
  created_at: string;
};

export type JobStatus = "new" | "assigned" | "in_progress" | "completed" | "cancelled";
export type JobPriority = "low" | "normal" | "high" | "emergency";
export type ReviewStatus = "not_reviewed" | "pending" | "approved" | "rework";

export type JobRecord = {
  id: string;
  organization_id: string;
  job_ref: string;
  property_id: string;
  contractor_id: string | null;
  title: string;
  trade: string;
  description: string;
  priority: JobPriority;
  status: JobStatus;
  due_date: string | null;
  completion_notes: string | null;
  completed_at: string | null;
  review_status: ReviewStatus;
  created_at: string;
  updated_at: string;
};

export type JobHistoryRecord = {
  id: string;
  job_id: string;
  event: string;
  note: string | null;
  created_at: string;
};

export type PageName = "overview" | "jobs" | "clients" | "properties" | "contractors";
export type RecordKind = "job" | "client" | "property" | "contractor";
