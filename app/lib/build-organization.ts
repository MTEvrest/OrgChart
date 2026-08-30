/**
 * Pure helpers for reducing organization events into immutable timeline
 * snapshots. Keeping this logic separate leaves the React hook focused on
 * selection and playback state.
 */

import type { Employee, Organization, OrgEvent } from "../data/org-events";

/** Extracts one payload shape from the discriminated organization event union. */
type EventOf<Type extends OrgEvent["type"]> = Extract<
  OrgEvent,
  { type: Type }
>;

/**
 * Replaces one manager's direct-report list inside a mutable draft snapshot.
 *
 * @param draft - Cloned organization Map being prepared for the next snapshot.
 * @param managerId - Manager whose report list should change, or `null`.
 * @param update - Pure transformation applied to the current report IDs.
 */
function updateManagerReports(
  draft: Map<number, Employee>,
  managerId: number | null,
  update: (reportIds: number[]) => number[],
) {
  if (managerId === null) return;

  const manager = draft.get(managerId);
  if (!manager) return;

  draft.set(managerId, {
    ...manager,
    directReports: update(manager.directReports),
  });
}

/**
 * Changes an employee's manager and synchronizes both employees' report lists.
 *
 * @param draft - Cloned organization Map being prepared for the next snapshot.
 * @param employeeId - Employee whose manager should change.
 * @param managerId - New manager ID, or `null` for a root employee.
 */
function setManager(
  draft: Map<number, Employee>,
  employeeId: number,
  managerId: number | null,
) {
  const employee = draft.get(employeeId);
  if (!employee || employeeId === managerId || employee.reportsTo === managerId) {
    return;
  }

  // Remove from old manager
  updateManagerReports(draft, employee.reportsTo, (reportIds) =>
    reportIds.filter((reportId) => reportId !== employeeId),
  );

  // Add to new manager
  updateManagerReports(draft, managerId, (reportIds) =>
    reportIds.includes(employeeId) ? reportIds : [...reportIds, employeeId],
  );
  draft.set(employeeId, { ...employee, reportsTo: managerId });
}

/** Applies an addition without mutating the preceding timeline snapshot. */
function applyAdd(
  organization: Organization,
  event: EventOf<"add">,
): Organization {
  const { employee } = event;
  if (employee.id !== event.employeeId) return organization;

  const next = new Map(organization);

  // Start with no relationships, then establish both sides through setManager
  // so claimed reports are also removed from their previous managers.
  next.set(event.employeeId, {
    ...employee,
    reportsTo: null,
    directReports: [],
  });
  setManager(next, event.employeeId, employee.reportsTo);
  for (const reportId of employee.directReports) {
    setManager(next, reportId, event.employeeId);
  }

  return next;
}

/** Applies a move and its authoritative post-move direct-report list. */
function applyMove(
  organization: Organization,
  event: EventOf<"move">,
): Organization {
  if (event.employee.id !== event.employeeId) return organization;

  const movingEmployee = organization.get(event.employeeId);
  if (!movingEmployee) return organization;

  const next = new Map(organization);
  const nextDirectReports = new Set(event.employee.directReports);

  // The stored report list makes omitted reports directly addressable, so this
  // work scales with the moved employee's team rather than the entire company.
  for (const reportId of movingEmployee.directReports) {
    if (!nextDirectReports.has(reportId)) {
      setManager(next, reportId, movingEmployee.reportsTo);
    }
  }

  // Listed reports either remain or transfer from elsewhere in the company.
  for (const reportId of event.employee.directReports) {
    setManager(next, reportId, event.employeeId);
  }
  setManager(next, event.employeeId, event.employee.reportsTo);

  // Relationship fields come from the synchronized draft; the move payload
  // supplies the employee's updated identity and title fields.
  const movedEmployee = next.get(event.employeeId);
  if (movedEmployee) {
    next.set(event.employeeId, {
      ...movedEmployee,
      name: event.employee.name,
      role: event.employee.role,
    });
  }

  return next;
}

/** Applies a title-only update to an existing employee. */
function applyUpdate(
  organization: Organization,
  event: EventOf<"update">,
): Organization {
  const employee = organization.get(event.employeeId);
  if (!employee) return organization;

  // Setting an existing Map key preserves its iteration order while changing
  // only the title named by this event.
  const next = new Map(organization);
  next.set(event.employeeId, { ...employee, role: event.role });
  return next;
}

/** Replaces the identity occupying a position while preserving its structure. */
function applyReplace(
  organization: Organization,
  event: EventOf<"replace">,
): Organization {
  const departingEmployee = organization.get(event.employeeId);
  if (!departingEmployee) return organization;

  // A replacement must introduce a distinct, unused identity. Matching the
  // departing ID would describe an update rather than a replacement.
  if (
    event.replacement.id === event.employeeId ||
    organization.has(event.replacement.id)
  ) {
    return organization;
  }

  const next = new Map(organization);

  // Update only the departing employee's known manager and reports rather than
  // searching the whole organization for reverse reporting relationships.
  updateManagerReports(next, departingEmployee.reportsTo, (reportIds) =>
    reportIds.map((reportId) =>
      reportId === event.employeeId ? event.replacement.id : reportId,
    ),
  );
  for (const reportId of departingEmployee.directReports) {
    const report = next.get(reportId);
    if (report) {
      next.set(reportId, { ...report, reportsTo: event.replacement.id });
    }
  }

  // Map iteration order is not part of the organization model, so replacing
  // the key directly avoids rebuilding every unrelated employee entry.
  next.delete(event.employeeId);
  next.set(event.replacement.id, {
    ...departingEmployee,
    ...event.replacement,
  });

  return next;
}

/** Removes an employee and moves their reports up to the previous manager. */
function applyRemove(
  organization: Organization,
  event: EventOf<"remove">,
): Organization {
  const departing = organization.get(event.employeeId);
  if (!departing) return organization;

  const next = new Map(organization);

  // The departing employee's own report list provides the exact employees to
  // reassign, avoiding a scan over unrelated teams.
  for (const reportId of departing.directReports) {
    setManager(next, reportId, departing.reportsTo);
  }
  updateManagerReports(next, departing.reportsTo, (reportIds) =>
    reportIds.filter((reportId) => reportId !== departing.id),
  );
  next.delete(departing.id);

  return next;
}

/**
 * Dispatches one immutable event to its focused organization reducer.
 *
 * @param organization - Employees present immediately before the event.
 * @param event - Addition, move, update, replacement, or removal to apply.
 * @returns A new organization snapshot containing the event's changes.
 */
function applyEvent(
  organization: Organization,
  event: OrgEvent,
): Organization {
  switch (event.type) {
    case "add":
      return applyAdd(organization, event);
    case "move":
      return applyMove(organization, event);
    case "update":
      return applyUpdate(organization, event);
    case "replace":
      return applyReplace(organization, event);
    case "remove":
      return applyRemove(organization, event);
  }
}

/**
 * Replays the event stream through a requested index.
 *
 * @param events - Chronologically ordered organization events.
 * @param eventIndex - Inclusive index of the last event to apply.
 * @returns The organization as it existed after that event.
 */
export function buildOrganization(events: OrgEvent[], eventIndex: number) {
  return events
    .slice(0, eventIndex + 1)
    .reduce<Organization>(applyEvent, new Map<number, Employee>());
}
