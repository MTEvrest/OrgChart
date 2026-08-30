/**
 * A person in the organization at a specific point in the event timeline.
 * `reportsTo` is `null` only for the root employee.
 */
export type Employee = {
  /** Stable numeric identifier used by events and reporting relationships. */
  id: number;
  /** Employee's display name. */
  name: string;
  /** Employee's current job title. */
  role: string;
  /** ID of the employee's manager, or `null` when they are the organization root. */
  reportsTo: number | null;
  /** IDs of the employees who currently report directly to this employee. */
  directReports: number[];
};

/** Employees indexed by ID for direct lookup during event processing. */
export type Organization = ReadonlyMap<number, Employee>;

/**
 * Identity fields supplied when one employee replaces another in a position.
 * The incoming ID must differ from the departing employee's ID.
 */
export type EmployeeReplacement = Pick<Employee, "id" | "name">;

/** Fields shared by every event concerning one employee identity. */
export type OrgEventBase<Type extends string> = {
  /** Event action used to narrow the event union. */
  type: Type;
  /** Employee primarily affected by the event. */
  employeeId: number;
};

/**
 * A change that can be applied to the organization.
 *
 * Additions may claim existing employees through `employee.directReports`. For
 * moves, that property is the complete report list after the move. Updates
 * change only an existing employee's title. Replacements atomically change the
 * identity attached to an existing position. Removals need only identify the
 * departing employee because their manager and reports are available in the
 * organization immediately before the event. Add and move events repeat the
 * subject ID inside `employee`; it must match their top-level `employeeId`.
 */
export type OrgEvent =
  | (OrgEventBase<"add"> & { employee: Employee })
  | (OrgEventBase<"move"> & { employee: Employee })
  | (OrgEventBase<"update"> & { role: string })
  | (OrgEventBase<"replace"> & { replacement: EmployeeReplacement })
  | OrgEventBase<"remove">;

/** A selectable company and the event history used to build its organization. */
export type CompanyPreset = {
  /** Stable value used by the company selector. */
  id: string;
  /** Human-readable company name. */
  name: string;
  /** Timeline position shown when the company is selected. */
  initialEventIndex: number;
  /** Chronologically ordered organization changes for the company. */
  events: OrgEvent[];
};

/**
 * Event stream for the default Crouton preset.
 *
 * Later events demonstrate the non-trivial behaviors: managers take on existing
 * reports, employees change titles and teams, reports move up a level when
 * their manager leaves, and one employee replaces another in place.
 */
const croutonEvents: OrgEvent[] = [
  { type: "add", employeeId: 1, employee: { id: 1, name: "Maya Chen", role: "CEO", reportsTo: null, directReports: [] } },
  { type: "add", employeeId: 2, employee: { id: 2, name: "Theo Martin", role: "VP, Product", reportsTo: 1, directReports: [] } },
  { type: "add", employeeId: 3, employee: { id: 3, name: "Sarah Kim", role: "VP, Engineering", reportsTo: 1, directReports: [] } },
  { type: "add", employeeId: 4, employee: { id: 4, name: "Leon Brooks", role: "Product Designer", reportsTo: 2, directReports: [] } },
  { type: "add", employeeId: 5, employee: { id: 5, name: "Aisha Patel", role: "Staff Engineer", reportsTo: 3, directReports: [] } },
  { type: "add", employeeId: 6, employee: { id: 6, name: "Ben Foster", role: "Product Engineer", reportsTo: 3, directReports: [] } },
  { type: "add", employeeId: 7, employee: { id: 7, name: "Priya Shah", role: "Product Manager", reportsTo: 2, directReports: [] } },
  { type: "add", employeeId: 8, employee: { id: 8, name: "Jordan Lee", role: "Director, Product", reportsTo: 2, directReports: [7] } },
  { type: "remove", employeeId: 3 },
  { type: "add", employeeId: 9, employee: { id: 9, name: "Mei Tan", role: "VP, Engineering", reportsTo: 1, directReports: [5, 6] } },
  { type: "update", employeeId: 6, role: "Senior Product Engineer" },
  { type: "move", employeeId: 7, employee: { id: 7, name: "Priya Shah", role: "Senior Product Manager", reportsTo: 1, directReports: [] } },
  { type: "move", employeeId: 4, employee: { id: 4, name: "Leon Brooks", role: "Senior Product Designer", reportsTo: 8, directReports: [] } },
  { type: "move", employeeId: 8, employee: { id: 8, name: "Jordan Lee", role: "VP, Product", reportsTo: 1, directReports: [7] } },
  { type: "remove", employeeId: 2 },
  { type: "move", employeeId: 5, employee: { id: 5, name: "Aisha Patel", role: "Engineering Manager", reportsTo: 8, directReports: [6] } },
  { type: "remove", employeeId: 9 },
  { type: "remove", employeeId: 8 },
  { type: "replace", employeeId: 1, replacement: { id: 10, name: "Elena Rossi" } },
];

/** Small product and engineering organization with a title update. */
const companyAEvents: OrgEvent[] = [
  { type: "add", employeeId: 1, employee: { id: 1, name: "Avery Stone", role: "Founder & CEO", reportsTo: null, directReports: [] } },
  { type: "add", employeeId: 2, employee: { id: 2, name: "Morgan Wells", role: "Engineering Manager", reportsTo: 1, directReports: [] } },
  { type: "add", employeeId: 3, employee: { id: 3, name: "Riley Grant", role: "Product Manager", reportsTo: 1, directReports: [] } },
  { type: "add", employeeId: 4, employee: { id: 4, name: "Casey Ford", role: "Software Engineer", reportsTo: 2, directReports: [] } },
  { type: "add", employeeId: 5, employee: { id: 5, name: "Jamie Ross", role: "Product Designer", reportsTo: 3, directReports: [] } },
  { type: "add", employeeId: 6, employee: { id: 6, name: "Drew Hall", role: "Staff Engineer", reportsTo: 2, directReports: [4] } },
  { type: "update", employeeId: 4, role: "Senior Software Engineer" },
];

/** Wider organization with a title update and a departing sales director. */
const companyBEvents: OrgEvent[] = [
  { type: "add", employeeId: 1, employee: { id: 1, name: "Alex Monroe", role: "CEO", reportsTo: null, directReports: [] } },
  { type: "add", employeeId: 2, employee: { id: 2, name: "Taylor Brooks", role: "Sales Director", reportsTo: 1, directReports: [] } },
  { type: "add", employeeId: 3, employee: { id: 3, name: "Jordan Blake", role: "Product Director", reportsTo: 1, directReports: [] } },
  { type: "add", employeeId: 4, employee: { id: 4, name: "Cameron Diaz", role: "Account Executive", reportsTo: 2, directReports: [] } },
  { type: "add", employeeId: 5, employee: { id: 5, name: "Quinn Bailey", role: "Account Executive", reportsTo: 2, directReports: [] } },
  { type: "add", employeeId: 6, employee: { id: 6, name: "Parker Lane", role: "Product Manager", reportsTo: 3, directReports: [] } },
  { type: "add", employeeId: 7, employee: { id: 7, name: "Reese Murphy", role: "Software Engineer", reportsTo: 3, directReports: [] } },
  { type: "update", employeeId: 6, role: "Senior Product Manager" },
  { type: "remove", employeeId: 2 },
];

/** Default company shown when the demo first loads. */
export const defaultCompanyPreset: CompanyPreset = {
  id: "crouton",
  name: "Crouton",
  initialEventIndex: 6,
  events: croutonEvents,
};

/** Company histories indexed by ID for direct selector lookup. */
export const companyPresets: ReadonlyMap<string, CompanyPreset> = new Map([
  [defaultCompanyPreset.id, defaultCompanyPreset],
  [
    "company-a",
    {
      id: "company-a",
      name: "Example Company A",
      initialEventIndex: 4,
      events: companyAEvents,
    },
  ],
  [
    "company-b",
    {
      id: "company-b",
      name: "Example Company B",
      initialEventIndex: 5,
      events: companyBEvents,
    },
  ],
]);
