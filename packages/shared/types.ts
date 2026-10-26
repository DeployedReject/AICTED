export type UserRole = "official" | "manager" | "it";
export interface Official {
  id: string;
  name: string;
  designation: string;
  bureau: string;
  role: UserRole;
  manager_id: string | null;
  is_demo: number;
  email?: string;
  active?: number;
}
export type Lifecycle =
  "Pending" | "Under process" | "Awaiting information" | "Disposed";
export type Intake = "Submitted" | "Approved" | "Returned" | "Rejected";
export interface Institution {
  id: string;
  name: string;
  permanent_id: string;
  city: string;
  state: string;
  region: string;
  is_demo: number;
  active_cases?: number;
  past_cases?: number;
}
export interface CaseRecord {
  id: string;
  subject: string;
  institution_id: string;
  institution_name: string;
  permanent_id: string;
  city: string;
  state: string;
  region: string;
  bureau: string;
  assigned_to: string;
  assigned_name: string;
  created_by: string;
  status: Lifecycle;
  intake: Intake;
  escalated: number;
  priority: string;
  tags: string[];
  description: string;
  next_action: string;
  received_at: string;
  due_at: string;
  updated_at: string;
  is_demo: number;
  can_act?: boolean;
  can_comment?: boolean;
  approval_reason?: string;
}
export interface CaseEvent {
  id: string;
  case_id: string;
  kind: string;
  actor_id: string;
  actor_name: string;
  designation: string;
  bureau: string;
  body: string;
  created_at: string;
}
export interface Coordination {
  id: string;
  case_id: string;
  requester_id: string;
  target_official_id: string;
  target_name: string;
  target_bureau: string;
  status: string;
  manager_approved_at: string | null;
  bureau_approved_at: string | null;
  created_at: string;
  reason: string;
  can_approve?: boolean;
}
export interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  sender_name: string;
  recipient_name: string;
  case_id: string | null;
  body: string;
  created_at: string;
  read_at: string | null;
}
export interface Tag {
  code: string;
  label: string;
  group_name: string;
}
export interface Summary {
  total: number;
  pending: number;
  processing: number;
  disposed: number;
  overdue: number;
  escalated: number;
  proposed: number;
  overlaps: number;
  due_soon: number;
}
export interface Bootstrap {
  user: Official;
  officials: Official[];
  tags: Tag[];
  summary: Summary;
  units: {
    code: string;
    name: string;
    unit_type: string;
    verification: string;
  }[];
}
export interface CaseDetail {
  case: CaseRecord;
  events: CaseEvent[];
  coordination: Coordination[];
  candidates: { bureau: string }[];
  relations: {
    kind: string;
    created_at: string;
    related_id: string | null;
    subject: string | null;
  }[];
}
