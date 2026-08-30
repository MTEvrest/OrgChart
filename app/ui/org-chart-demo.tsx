"use client";

import { useMemo } from "react";
import type { OrgEvent } from "../data/org-events";
import { useOrgEvents } from "../hooks/use-org-events";
import { OrgChart } from "./org-chart";

/**
 * Produces the human-readable timeline description for an organization event.
 *
 * @param event - Event currently selected in the timeline.
 * @param names - Employee names indexed independently of the current snapshot,
 * so removed employees can still be named.
 */
function eventLabel(event: OrgEvent, names: Map<number, string>) {
  if (event.type === "add") {
    return `${event.employee.name} joined as ${event.employee.role}`;
  }
  if (event.type === "move") {
    const manager = event.employee.reportsTo
      ? names.get(event.employee.reportsTo) ?? "a new manager"
      : "the top level";
    const reports = event.employee.directReports.length;
    const reportSummary = reports
      ? ` and took on ${reports} direct ${reports === 1 ? "report" : "reports"}`
      : "";
    return `${event.employee.name} moved to report to ${manager}${reportSummary}`;
  }
  if (event.type === "update") {
    const employee = names.get(event.employeeId) ?? "An employee";
    return `${employee} became ${event.role}`;
  }
  if (event.type === "replace") {
    const departing = names.get(event.employeeId) ?? "An employee";
    return `${event.replacement.name} replaced ${departing}`;
  }
  return `${names.get(event.employeeId) ?? "An employee"} left the organization`;
}

/** Returns the compact symbol used for each timeline event type. */
function eventSymbol(event: OrgEvent) {
  if (event.type === "add") return "+";
  if (event.type === "move") return "→";
  if (event.type === "update") return "✎";
  if (event.type === "replace") return "⇄";
  return "−";
}

/** Returns the employee identity emphasized by the active event, if present. */
function highlightedEmployeeId(event: OrgEvent) {
  if (event.type === "add" || event.type === "move") {
    return event.employeeId;
  }
  if (event.type === "update") return event.employeeId;
  if (event.type === "replace") return event.replacement.id;
  return undefined;
}

/**
 * Composes the event hook, Cytoscape chart, employee total, and playback
 * controls into the complete frontend demo.
 */
export function OrgChartDemo() {
  const org = useOrgEvents();

  // Build names from the full history rather than the current organization so
  // removals and replacements can describe identities no longer in the chart.
  const names = useMemo(() => {
    console.log("update");
    const result = new Map<number, string>();
    org.events.forEach((event) => {
      if (event.type === "add" || event.type === "move") {
        result.set(event.employeeId, event.employee.name);
      } else if (event.type === "replace") {
        result.set(event.replacement.id, event.replacement.name);
      }
    });
    return result;
  }, [org.events]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Crouton home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          crouton
        </a>
        <label className="company-picker">
          <span className="company-label">Company</span>
          <span className="company-select">
            <select
              value={org.selectedCompanyId}
              onChange={(event) => org.selectCompany(event.target.value)}
            >
              {Array.from(org.companies.values(), (company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="m4 6 4 4 4-4" />
            </svg>
          </span>
        </label>
        <button className="avatar" aria-label="Open account menu">EC</button>
      </header>

      <section className="workspace">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Workspace / Organization</p>
            <h1>Your organization</h1>
            <p className="subtitle">See how your team grows and changes over time.</p>
          </div>
          <div className="employee-total" aria-live="polite">
            <span>{org.organization.size}</span>
            <div><strong>Employees</strong><small>Current total</small></div>
          </div>
        </div>

        <section className="chart-panel" aria-label="Organization timeline">
          <div className="chart-toolbar">
            <div><span className="toolbar-label">Org chart</span><span className="toolbar-count">{org.organization.size} people</span></div>
            <button className="reset-button" onClick={org.reset} disabled={org.eventIndex === 0}>Reset demo</button>
          </div>
          <OrgChart
            key={org.selectedCompanyId}
            organization={org.organization}
            highlightedEmployeeId={highlightedEmployeeId(org.activeEvent)}
          />
          <div className="timeline">
            <div className={`event-icon ${org.activeEvent.type}`} aria-hidden="true">{eventSymbol(org.activeEvent)}</div>
            <div className="event-copy" aria-live="polite">
              <span>Event {org.eventIndex + 1} of {org.events.length}</span>
              <strong>{eventLabel(org.activeEvent, names)}</strong>
            </div>
            <div className="progress-track" aria-hidden="true"><span style={{ width: `${((org.eventIndex + 1) / org.events.length) * 100}%` }} /></div>
            <div className="playback-controls">
              <button onClick={org.previous} disabled={!org.canGoBack} aria-label="Previous event"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.5 5-5 5 5 5" /></svg></button>
              <button className="play" onClick={org.togglePlayback} aria-label={org.isPlaying ? "Pause" : "Play"}>
                {org.isPlaying ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5v10M13 5v10" /></svg> : <svg viewBox="0 0 20 20" aria-hidden="true"><path className="filled" d="m7 5 8 5-8 5z" /></svg>}
              </button>
              <button onClick={org.next} disabled={!org.canGoForward} aria-label="Next event"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 5 5 5-5 5" /></svg></button>
            </div>
          </div>
        </section>
        <p className="hint">Drag to pan · Scroll to zoom · Use the timeline to replay changes</p>
      </section>
    </main>
  );
}
