# AICTE Integrated Institution Complaint Monitoring Dashboard — Reference Data Specification

**Draft date:** 26 October 2026  
**Status:** Prototype seed specification; not a certified current AICTE organizational register.  
**Basis:** Supplied hackathon problem statement; user-provided organizational and grievance research; AICTE Approval Process Handbook and regional-office references; publicly indexed government documents.

> **Data provenance key**  
> **[PS]** Explicit in the problem statement.  
> **[UR]** Supplied by project researcher; not independently established as the definitive 2026 chart.  
> **[OFF-H]** Documented in a published AICTE source, possibly historical.  
> **[DESIGN]** Suggested application-specific options for an editable demo.  
> **[VERIFY]** Check current name, status, jurisdiction or address before production.

## 1. Application scope [PS]

An authorized-official dashboard joining institution-related complaint records across AICTE Bureaus/Cells, with institution-level history, current assignments, chronological movement, overlap detection, pending/SLA alerts, and reports by institution, region, Bureau/Cell and status. The prototype must not represent synthetic complaints as real records.

**Core entities:** Institution, Office, Organization Unit, Officer, Designation, Complaint, Complaint Category, Case Assignment, Case Event, Related-Case Link, SLA Policy, Alert, Attachment, and User Role.

## 2. Organizational hierarchy [UR]

1. Chairman
2. Vice Chairman
3. Member Secretary
4. Adviser-I / Adviser-II
5. Director
6. Deputy Director / Assistant Director
7. Supporting Staff / Technical Officials

**Suggested normalized designation values [DESIGN]:** `CHAIRMAN`, `VICE_CHAIRMAN`, `MEMBER_SECRETARY`, `ADVISER_I`, `ADVISER_II`, `DIRECTOR`, `DEPUTY_DIRECTOR`, `ASSISTANT_DIRECTOR`, `REGIONAL_OFFICER`, `SUPPORTING_OFFICIAL`, `TECHNICAL_OFFICIAL`.

**Important:** This is an organizational presentation hierarchy, not a verified strict reporting chain or official grade order. A Regional Officer is a functional appointment that may overlap with a designation.

## 3. Functional Bureaus and programmes [UR; VERIFY]

| Code | Name / seed label | Primary focus | Named official(s) in supplied research |
|---|---|---|---|
| `RB` | Regulation Bureau | Approvals, new campuses/courses, regulatory compliance | Adviser-I Prof. More Ramulu; Director Sh. Naresh Kumar Grover; Deputy Directors Dr. C.S. Verma and Dr. Prashant Kharat |
| `ADMIN` | Administration Bureau | Personnel, tours, logistics, legal and infrastructure | Directors Sh. Kunaljeet Singh and Dr. Neetu Bhagat |
| `FIN` | Finance Bureau | Disbursement, accounts, budgets and audit | Smt. Gujju Manusree (financial head) |
| `PAP` | Policy & Academic Planning | Academic/curricular frameworks | Director Dr. Mamta Rani Agarwal |
| `ATAL` | Training & Learning / ATAL | Faculty development and training | Director Dr. Sunil Luthra |
| `SCH_GRANTS` | Scholarships & Grants | Aid, fellowships and stipends | Adviser Prof. Rajendra B Kakde |

The label 'Regulation Bureau' comes from the problem statement and user research. Treat `ATAL` and `SCH_GRANTS` as **functional seed units**; verify whether they are separate formal Bureaus in the current AICTE chart. Names and personnel should be editable and effective-dated.

### 3.1 Specialized Cells [UR; VERIFY]

| Code | Cell | Function |
|---|---|---|
| `PGRC` | Public Grievance Redressal Cell | Complaints, institutional grievances and coordination with regulatory functions |
| `VIGILANCE` | Vigilance Cell | Vigilance/integrity matters |
| `SKILL` | Skill Development Cell | Skills and vocational initiatives |
| `NEAT` | National Educational Alliance for Technology Cell | Edtech partnership initiatives |
| `CYBER` | Cyber Security Cell / CISO Office | Security of information systems |
| `IKS` | Indian Knowledge Systems Cell | IKS-related initiatives |

### 3.2 Additional candidate units from older organizational listings [VERIFY]

Do **not** silently combine these with the above six functional Bureaus without checking whether they are former names, aliases, programmes or active units:

- Approval Bureau (possible naming overlap with Regulation/Approval functions)
- Research, Institutional & Faculty Development (RIFD)
- e-Governance Cell
- Legal Cell
- RTI Cell
- Parliament Cell
- Internal Audit Cell
- Estate Management Cell
- Hindi Cell
- SWAYAM Cell
- CMAT Cell
- GPAT Cell
- PMSSS–Jammu & Kashmir Cell
- NEQIP Cell

**Recommended data model:** `org_units(id, code, name, unit_type, parent_unit_id, active, valid_from, valid_to, provenance, source_url)` and `org_aliases(org_unit_id, alias, valid_from, valid_to)`.

### 3.3 Cross-unit coordination [UR; VERIFY]

User research mentions PGRC/Vigilance clearance in certain security-deposit release/NOC processes and a Standing Complaint Scrutiny Committee (SCSC) in escalations. These are **workflow research leads**, not universal rules to apply to every complaint. Add configurable coordination rules only after matching them to an applicable current policy.

## 4. Central office and geographic/regional office directory

**Coordinate policy:** `latitude` / `longitude` contain **verified site coordinates only**. A blank (`null`) value is deliberate. Do not pass city-centre or guessed coordinates off as the office's GPS location. Use the linked map search to geocode the actual building, and preserve `coordinate_precision`, `coordinate_source`, and `verified_at` in the eventual dataset.

| Code | Office | Historical/published address / locality | GPS latitude | GPS longitude | Confidence |
|---|---|---|---:|---:|---|
| `HQ` | AICTE Head Office | Nelson Mandela Marg, Vasant Kunj, New Delhi 110070 | 28.535703 | 77.154419 | Building coordinate published on Wikimedia Commons (not government-surveyed) |
| `CRO` | Central Regional Office | Airport Bypass Road, Gandhi Nagar, Bhopal 462036 | null | null | Published historical AICTE address; verify current office |
| `ERO` | Eastern Regional Office | Govt. College of Engineering & Leather Technology Campus, LB Block, Sector III, Salt Lake, Kolkata | null | null | Published historical AICTE address; postal codes differ in sources |
| `NRO` | Northern Regional Office | Govt. Polytechnic Campus, Vikas Nagar / Zoo Road, Kanpur | null | null | Published historical AICTE address |
| `NWRO` | North-Western Regional Office | DTE Punjab Building, Sector 36-A, Chandigarh 160036 | null | null | Published historical AICTE address |
| `SRO` | Southern Regional Office | Shastri Bhavan, 26 Haddows Road, Nungambakkam, Chennai 600006 | null | null | Published historical AICTE address |
| `SCRO` | South Central Regional Office | West Block, 2nd Floor, Swarna Jayanthi Commercial Complex, Ameerpet, Hyderabad 500038 | null | null | AICTE 2022 tender and 2022 roles document |
| `SWRO` | South-Western Regional Office | P.K. Block, Palace Road, Bengaluru 560009 | null | null | Published historical AICTE address |
| `WRO` | Western Regional Office | Historic: Industrial Assurance Building, Nariman Road, Churchgate, Mumbai 400020; another directory lists NITIE campus, Powai 400087 | null | null | Conflicting location references: verify relocation/current site |
| `CAMP_GHY` | Guwahati Camp / North East Office | Assam Engineering College Campus, Jalukbari, Guwahati 781013 | null | null | Published historical camp office, sometimes called North East office |
| `CAMP_TVM` | Thiruvananthapuram Camp Office | College of Engineering campus, Thiruvananthapuram 695016 | null | null | Published historical camp office |
| `CAMP_VAD` | Vadodara Camp Office | A-1/2 Quarters, Chameli Baug, MS University campus, Vadodara 390002 | null | null | Published historical camp office |

**Location map searches** (verify that the result is the AICTE office rather than a different building):

- HQ: https://www.google.com/maps/search/?api=1&query=AICTE+Head+Office+Nelson+Mandela+Marg+Vasant+Kunj+New+Delhi
- CRO: https://www.google.com/maps/search/?api=1&query=AICTE+Central+Regional+Office+Bhopal
- ERO: https://www.google.com/maps/search/?api=1&query=AICTE+Eastern+Regional+Office+Salt+Lake+Kolkata
- NRO: https://www.google.com/maps/search/?api=1&query=AICTE+Northern+Regional+Office+Vikas+Nagar+Kanpur
- NWRO: https://www.google.com/maps/search/?api=1&query=AICTE+North+Western+Regional+Office+Sector+36A+Chandigarh
- SRO: https://www.google.com/maps/search/?api=1&query=AICTE+Southern+Regional+Office+Shastri+Bhavan+Chennai
- SCRO: https://www.google.com/maps/search/?api=1&query=AICTE+South+Central+Regional+Office+Ameerpet+Hyderabad
- SWRO: https://www.google.com/maps/search/?api=1&query=AICTE+South+Western+Regional+Office+Palace+Road+Bengaluru
- WRO: https://www.google.com/maps/search/?api=1&query=AICTE+Western+Regional+Office+Mumbai
- Guwahati: https://www.google.com/maps/search/?api=1&query=AICTE+Guwahati+office+Assam+Engineering+College
- Thiruvananthapuram: https://www.google.com/maps/search/?api=1&query=AICTE+camp+office+College+of+Engineering+Thiruvananthapuram
- Vadodara: https://www.google.com/maps/search/?api=1&query=AICTE+camp+office+MS+University+Vadodara

### 4.1 Eight historical regional jurisdictions [OFF-H; VERIFY]

These mappings are based on older AICTE handbook/directory material and **must not be treated as a certified October 2026 jurisdiction register**.

| Region | Code | Regional office | Historically covered states / UTs |
|---|---|---|---|
| Central | `CENTRAL` | Bhopal | Madhya Pradesh, Gujarat, Chhattisgarh |
| Eastern | `EASTERN` | Kolkata | West Bengal, Odisha, Jharkhand, Sikkim, Assam, Arunachal Pradesh, Meghalaya, Manipur, Mizoram, Nagaland, Tripura, Andaman & Nicobar Islands |
| Northern | `NORTHERN` | Kanpur | Uttar Pradesh, Uttarakhand, Bihar |
| North-West | `NORTH_WEST` | Chandigarh | Delhi, Haryana, Punjab, Rajasthan, Himachal Pradesh, Chandigarh, Jammu & Kashmir, Ladakh |
| Southern | `SOUTHERN` | Chennai | Tamil Nadu, Puducherry |
| South Central | `SOUTH_CENTRAL` | Hyderabad | Andhra Pradesh, Telangana |
| South-West | `SOUTH_WEST` | Bengaluru | Karnataka, Kerala, Lakshadweep |
| Western | `WESTERN` | Mumbai | Maharashtra, Goa, Dadra and Nagar Haveli and Daman and Diu |

**State/UT selector:** include all 28 states and 8 UTs using current standardized codes; prefer the government Location Code Directory for districts and administrative changes. Region and regional-office values are separate from State and District.

### 4.2 28 States and 8 Union Territories

**States:** Andhra Pradesh; Arunachal Pradesh; Assam; Bihar; Chhattisgarh; Goa; Gujarat; Haryana; Himachal Pradesh; Jharkhand; Karnataka; Kerala; Madhya Pradesh; Maharashtra; Manipur; Meghalaya; Mizoram; Nagaland; Odisha; Punjab; Rajasthan; Sikkim; Tamil Nadu; Telangana; Tripura; Uttar Pradesh; Uttarakhand; West Bengal.

**Union Territories:** Andaman and Nicobar Islands; Chandigarh; Dadra and Nagar Haveli and Daman and Diu; Delhi (NCT); Jammu and Kashmir; Ladakh; Lakshadweep; Puducherry.

## 5. Complaint categories

### 5.1 Student grievances: legal-inspired seed taxonomy [UR; OFF-H; VERIFY]

The 2019 AICTE student-grievance regulation describes several grounds. The names below are normalized dashboard labels and should be mapped back to the regulation's wording. Some items here are subdivisions of a single legal clause, so **do not label the set below an official 16-code AICTE taxonomy**.

| Code | Group | Dropdown label |
|---|---|---|
| `ADM_MERIT` | Admission & Prospectus | Admission merit violation |
| `ADM_PROCESS` | Admission & Prospectus | Admission-process irregularity |
| `ADM_REFUSAL` | Admission & Prospectus | Improper refusal of admission |
| `PROSPECTUS_MISSING` | Admission & Prospectus | Prospectus not published |
| `PROSPECTUS_MISLEADING` | Admission & Prospectus | False or misleading prospectus |
| `DOC_WITHHELD` | Financial & Documents | Original certificates/documents withheld |
| `FEE_EXCESS` | Financial & Documents | Fees demanded beyond declared policy |
| `SCHOLARSHIP_DELAY` | Financial & Documents | Scholarship / financial-aid delay or nonpayment |
| `FEE_REFUND` | Financial & Documents | Fee refund refused or delayed |
| `RESERVATION` | Admission & Equity | Reservation-policy violation |
| `DISCRIMINATION` | Discrimination & Harassment | Discrimination |
| `HARASSMENT` | Discrimination & Harassment | Harassment or victimization |
| `EXAM_DELAY` | Academic | Examination delay |
| `RESULT_DELAY` | Academic | Result publication delay |
| `UNFAIR_EVALUATION` | Academic | Unfair evaluation practice |
| `EDUCATION_QUALITY` | Academic | Promised education quality not delivered |
| `AMENITIES` | Academic & Infrastructure | Inadequate student amenities |

**Important legal caveat:** The source list shared by the researcher contains a mixture of AICTE and UGC sources. Verify legal applicability of each ground and the actual regulation effective for the institution and complaint. Keep `source_regulation` at the complaint-category level.

### 5.2 Additional broader institution/regulatory categories [DESIGN]

These broaden coverage to faculty, institutional compliance and regulatory actions, as required by the problem statement; **they are not represented as officially enumerated complaint categories**.

| Code | Group | Dropdown label |
|---|---|---|
| `APPROVAL_IRREGULARITY` | Regulatory | Approval/extension irregularity |
| `UNAPPROVED_COURSE` | Regulatory | Unapproved course or programme |
| `INTAKE_NONCOMPLIANCE` | Regulatory | Approved-intake noncompliance |
| `INFRASTRUCTURE_DEFICIT` | Regulatory | Infrastructure or laboratory deficiency |
| `FACULTY_SHORTAGE` | Faculty & Staffing | Faculty shortage / qualification deficiency |
| `FACULTY_SERVICE` | Faculty & Staffing | Faculty employment or service grievance |
| `STAFF_SERVICE` | Faculty & Staffing | Non-teaching staff service grievance |
| `SALARY_NONPAYMENT` | Faculty & Staffing | Salary or remuneration nonpayment |
| `SAFETY` | Institutional Welfare | Campus safety concern |
| `ANTI_RAGGING` | Institutional Welfare | Ragging-related institutional compliance |
| `ACCESSIBILITY` | Institutional Welfare | Accessibility concern |
| `RECORDS_MISREPORT` | Regulatory | Misrepresentation of institutional records |
| `FINANCIAL_MALPRACTICE` | Regulatory | Institutional financial malpractice |
| `OTHER` | General | Other / requires classification |

Maintain distinct `complainant_type` and `complaint_category`: not every student-grievance regulation governs faculty or institutional claims.

## 6. Institution reference values

### 6.1 Programme families [OFF-H; VERIFY]

- Engineering & Technology (`ENG_TECH`)
- Computer Applications (`COMP_APP`)
- Management (`MANAGEMENT`)
- Planning (`PLANNING`)
- Design (`DESIGN`)
- Applied Arts & Crafts (`APPLIED_ARTS`)
- Hotel Management & Catering Technology (`HOTEL`)

Consult the AICTE Approval Process Handbook for the current applicable programme and level definitions. Do not confuse programme family with type of institution.

### 6.2 Other institution attributes [DESIGN]

| Field | Candidate values |
|---|---|
| Academic level | Diploma; Post Diploma; Undergraduate; Postgraduate Diploma; Postgraduate Degree; Integrated |
| Management/control | Government; Government-Aided; Private Unaided; University Department; Constituent Institution; Other |
| Relationship | Affiliated; Autonomous; Constituent; University Department; Other |
| Approval status | Approved; Under Review; Approval Withdrawn; Closed; Hibernating; Unknown/Not Verified |
| Approval application type | New Institution; Extension of Approval; New Programme; Intake Change; Closure; Hibernation; Off-Campus |
| Academic year seed | 2024–25; 2025–26; 2026–27 |

**Institution selector:** searchable by AICTE Permanent ID and institution name; store `aishe_code` as an optional secondary identifier. Never assume one AISHE institution matches exactly one AICTE record. Institution-programme relations are many-to-many.

## 7. Complaint statuses, movements and outcomes

The original problem statement explicitly calls for **Pending, Under Process, Disposed, Transferred, and Escalated**. For better accounting, record **Transferred** and **Escalated** as actions/flags as well as reporting views; a transfer does not necessarily finish active processing.

### 7.1 Recommended primary lifecycle [DESIGN]

| Code | Label | Meaning |
|---|---|---|
| `RECEIVED` | Received | Registered; not yet reviewed |
| `PENDING` | Pending | Awaiting assignment/action |
| `IN_PROCESS` | Under Process | Active processing |
| `AWAITING_INFO` | Awaiting Information | Waiting for documents/response |
| `ON_HOLD` | On Hold | Temporarily blocked with reason |
| `DISPOSED` | Disposed | Formal case disposal recorded |
| `REOPENED` | Reopened | Previously disposed case reactivated |

### 7.2 Case event types [DESIGN]

`REGISTERED`, `ASSIGNED`, `PRELIMINARY_REVIEW`, `INVESTIGATION_STARTED`, `INFORMATION_REQUESTED`, `INFORMATION_RECEIVED`, `REMARK_ADDED`, `TRANSFERRED`, `ESCALATED`, `RELATED_CASE_LINKED`, `COORDINATION_REQUESTED`, `RESOLUTION_PROPOSED`, `DISPOSED`, `REOPENED`.

### 7.3 Supporting dropdowns [DESIGN]

| Selector | Seed options |
|---|---|
| Complainant type | Student; Applicant; Faculty; Employee; Parent/Guardian; Institution Representative; Other |
| Intake source | CPGRAMS; AICTE PGRC; Regulation Bureau; Regional Office; Email; Written Correspondence; Other |
| Priority | Routine; High; Urgent |
| Investigation outcome | Substantiated; Partially Substantiated; Unsubstantiated; Insufficient Evidence; Withdrawn |
| Resolution type | Corrective Action; Institutional Clarification; Refund/Financial Remedy; Regulatory Action; Referred Elsewhere; No Action Required; Withdrawn |
| Transfer reason | Jurisdiction; Specialist Review; Regional Referral; Escalation; Coordination |
| Case overlap review | Unreviewed; Confirmed Related; Confirmed Duplicate; Unrelated; Requires Coordination |
| Alert state | New; Acknowledged; Under Review; Resolved; Dismissed |

## 8. Alerts, overlap and SLA

### 8.1 Problem-statement alert types [PS]

- Duplicate / overlapping case
- Pending-case reminder
- Escalation alert
- Timeline / SLA alert

### 8.2 Overlap logic [DESIGN]

1. Exact institution Permanent ID equality => same institution, **not automatically duplicate**.
2. Institution name/address normalization => suggest likely institution link only when ID is missing.
3. Same institution + similar subject/category/descriptions => candidate related case.
4. Candidate related cases under different Bureaus => cross-Bureau coordination alert.
5. Human confirmation required before final duplicate classification or merger.

Types: `SAME_INSTITUTION`, `POTENTIAL_DUPLICATE`, `CROSS_BUREAU_COORDINATION`, `CONFIRMED_DUPLICATE`, `NO_MATERIAL_OVERLAP`.

### 8.3 SLA design

A 21-day resolution guideline exists for the **CPGRAMS** public-grievance process; **do not use it as a universal AICTE-regulatory-case SLA**. Seed configurable reminders at 7 and 3 days before case-specific due date [DESIGN]. The due date must derive from the applicable policy and case start/event rules, not an arbitrary universal timer.

Suggested `sla_policies(id, source, category_id, duration_days, day_count_type, effective_from, effective_to, escalation_policy_id, source_url)`.

## 9. Dashboard reports and search [PS]

**Search:** institution name, AICTE Permanent ID, complaint ID, Bureau/Cell, region, category, status, date range.

**Summary metrics:** total cases, pending, under process, disposed, transferred, overdue, escalated, overlaps, institution cases, Bureau workload.

**Reports:** Bureau-wise, region-wise, institution-wise history, pending-ageing, disposal rate, overlap/duplicate, monthly and quarterly performance.

**Recommended filter cascade:** Region → State/UT → District → Institution; Bureau/Cell; Complaint Group → Category; Lifecycle Status; Dates; Officer; Priority; SLA condition.

## 10. Recommended tables and configuration

`org_units`, `org_aliases`, `offices`, `designations`, `officers`, `regions`, `states`, `districts`, `institutions`, `programmes`, `institution_programmes`, `institution_types`, `complaint_categories`, `complaint_sources`, `complainant_types`, `case_statuses`, `complaints`, `case_assignments`, `case_events`, `case_relations`, `resolution_types`, `sla_policies`, `alerts`, `alert_types`, `roles`, `attachments`.

All lookup tables should support at least: `id`, `code`, `display_name`, `is_active`, `sort_order`, `source_type`, `source_url`, `verified_at`. Offices additionally need `full_address`, `latitude`, `longitude`, `coordinate_precision`, `coordinate_source`, `address_verified_at`.

**Data integrity:** case events append-only; assignments effective-dated; keep historical department names/aliases; support multi-Bureau case relationships without overwriting ownership history; do not infer a unique person solely from a designation.

## 11. Seed targets for prototype [DESIGN]

- 8 AICTE regions (+ headquarters and historical camp offices)
- 28 states, 8 UTs; district master data imported separately
- 6 user-researched functional Bureaus + 6 specialized Cells (unverified organizational status)
- 14 older candidate Bureau/Cell labels, inactive/unverified until confirmed
- 17 normalized student grievance labels + 14 provisional broader institution/regulatory categories
- 7 primary lifecycle statuses, 14 action types, 4 alerts
- 100 real/sourced institutions for testing (with provenance)
- 300 **synthetic** cases and 25 purposeful cross-unit overlap scenarios

## 12. Source bibliography and validation queue

1. **Uploaded Problem Statement 1.docx** — source of features, target users, overlap and status requirements [PS].
2. **User-supplied research** — proposed 2026 Bureaus/Cells, named personnel, hierarchy, grievance descriptions [UR].
3. **AICTE Approval Process Handbook 2024–2027** — https://www.aicte.gov.in/sites/default/files/APH%20Final.pdf
4. **AICTE Approval Process Handbook 2018–19, Appendix 14 (historical regional office addresses/jurisdiction)** — https://www.aicte.gov.in/sites/default/files/APH%202018-19%20Modified.pdf
5. **AICTE roles and responsibilities document (2022)** — https://fliphtml5.com/jfjx/elln/Roles_and_Responsibilities_21_03_2022_Combined/
6. **AICTE South Central Regional Office tender (January 2022), Hyderabad address** — https://aicte.gov.in/sites/default/files/Tenderdocument.pdf
7. **AICTE Head Office public notice, Delhi address** — https://aicte.gov.in/sites/default/files/Updated%20Public%20Notice.pdf
8. **AICTE office listing on LinkedIn (address cross-check; not definitive live directory)** — https://in.linkedin.com/company/aicteindia
9. **AICTE head-office geographic coordinate on Wikimedia Commons** — https://commons.wikimedia.org/wiki/Category:All_India_Council_for_Technical_Education_Head_Office
10. **2019 Student Grievance Regulation reproduction** — https://indiankanoon.org/doc/93892215/
11. **AICTE approved institutions dashboard** — https://facilities.aicte-india.org/dashboard/pages/angulardashboard.php#!/approved
12. **AISHE institution directory** — https://dashboard.aishe.gov.in/hedirectory/

**Highest-priority outstanding verification:** current official organizational chart, named officers' current assignments, 2026 regional office operational addresses and coordinates, current region-state jurisdiction, legality/applicability of category taxonomy, and current approval-state options.
