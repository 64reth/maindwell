export type ClientRecord = {
  id: string;
  organization_id: string;
  type: "landlord" | "letting_agent";
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  auth_user_id?: string | null;
  created_at: string;
};

export type EmployeeRecord = {
  id: string;
  organization_id: string;
  auth_user_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  employment_role: string;
  start_date: string;
  supervisor_id: string | null;
  responsibilities: string;
  employment_status: "invited" | "active" | "inactive";
  created_at: string;
};

export type TrainingRecord = {
  id: string;
  employee_id: string;
  record_type: "training" | "qualification";
  title: string;
  provider: string | null;
  status: "planned" | "in_progress" | "completed";
  completed_on: string | null;
  expires_on: string | null;
  notes: string | null;
  created_at: string;
};

export type CompetencyAssessment = {
  id: string;
  employee_id: string;
  task_name: string;
  outcome: "needs_supervision" | "supervised_practice" | "approved_independent";
  assessment_notes: string;
  assessed_at: string;
  review_due: string | null;
  created_at: string;
};

export type DevelopmentGoal = {
  id: string;
  employee_id: string;
  title: string;
  description: string;
  target_date: string | null;
  status: "planned" | "in_progress" | "achieved" | "paused";
  created_at: string;
};

export type DevelopmentEntry = {
  id: string;
  employee_id: string;
  entry_type: "supervisor_feedback" | "milestone" | "job_experience" | "goal_progress";
  title: string;
  note: string;
  job_id: string | null;
  goal_id: string | null;
  created_at: string;
};

export type JobEmployeeAssignment = {
  id: string;
  organization_id: string;
  job_id: string;
  employee_id: string;
  instructions: string;
  requires_supervision: boolean;
  assigned_by: string;
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

export type PageName = "overview" | "jobs" | "clients" | "properties" | "contractors" | "workforce";
export type RecordKind = "job" | "client" | "property" | "contractor";
