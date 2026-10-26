export interface Analytics {
  scope: string;
  as_of: string;
  summary: {
    total: number;
    approved: number;
    active: number;
    disposed: number;
    overdue: number;
    transferred: number;
    overlaps: number;
    review: number;
    escalated: number;
    duplicates: number;
    disposal_rate: number;
  };
  weeks: { label: string; count: number }[];
  statuses: { label: string; count: number }[];
  bureaus: { name: string; active: number; disposed: number }[];
  regions: { name: string; count: number }[];
  ages: { label: string; count: number }[];
  months: { label: string; received: number; disposed: number }[];
  quarters: { label: string; received: number; disposed: number }[];
}
