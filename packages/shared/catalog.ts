export const referenceUnits = [
  {
    code: "RB",
    name: "Regulation Bureau",
  },
  {
    code: "ADMIN",
    name: "Administration Bureau",
  },
  {
    code: "FIN",
    name: "Finance Bureau",
  },
  {
    code: "PAP",
    name: "Policy & Academic Planning",
  },
  {
    code: "ATAL",
    name: "Training & Learning / ATAL",
  },
  {
    code: "SCH_GRANTS",
    name: "Scholarships & Grants",
  },
  {
    code: "PGRC",
    name: "Public Grievance Redressal Cell",
  },
  {
    code: "VIGILANCE",
    name: "Vigilance Cell",
  },
  {
    code: "SKILL",
    name: "Skill Development Cell",
  },
  {
    code: "NEAT",
    name: "National Educational Alliance for Technology Cell",
  },
  {
    code: "CYBER",
    name: "Cyber Security Cell / CISO Office",
  },
  {
    code: "IKS",
    name: "Indian Knowledge Systems Cell",
  },
];
const names = new Map(referenceUnits.map((u) => [u.code, u.name]));
export function registerUnits(units: { code: string; name: string }[]) {
  for (const unit of units) names.set(unit.code, unit.name);
}
export const bureauName = (code: string) => names.get(code) || code;
