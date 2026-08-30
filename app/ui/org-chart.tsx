"use client";

import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import { useEffect, useRef } from "react";
import type { Organization } from "../data/org-events";

// Have node graph shift before revealing new elements
const LAYOUT_DURATION = 650;
const EDGE_REVEAL_DELAY = 650;

/**
 * Converts the application organization into Cytoscape nodes and reporting edges.
 *
 * @param organization - Current employees indexed by their numeric IDs.
 * @returns Element definitions ready to add to a Cytoscape graph.
 */
function elementsFor(organization: Organization): ElementDefinition[] {
  // Cytoscape consumes arrays of elements, so the Map is converted only at the
  // visualization boundary after event processing has finished.
  const employees = Array.from(organization.values());
  const nodes: ElementDefinition[] = employees.map((employee) => ({
    group: "nodes",
    // Cytoscape requires string element IDs; numeric IDs remain authoritative
    // everywhere outside this visualization boundary.
    data: { id: String(employee.id), name: employee.name, role: employee.role },
  }));

  // Direct each edge from manager to report so the breadth-first layout places
  // management above the people who report to them.
  const edges: ElementDefinition[] = employees.flatMap((employee) =>
    employee.reportsTo
      ? [{ group: "edges" as const, data: { id: `${employee.reportsTo}-${employee.id}`, source: String(employee.reportsTo), target: String(employee.id) } }]
      : [],
  );
  return [...nodes, ...edges];
}

/**
 * Arranges the graph into a top-down reporting hierarchy. Responsible for moving the nodes.
 *
 * @param cy - Cytoscape instance to lay out.
 * @param animate - Whether nodes should transition to their new positions.
 */
function runLayout(cy: Core, animate: boolean) {
  cy.layout({
    name: "breadthfirst",
    directed: true,
    spacingFactor: 1.15,
    padding: 36,
    animate,
    animationDuration: LAYOUT_DURATION,
    animationEasing: "ease-in-out-cubic",
    fit: true,
  }).run();
}

type OrgChartProps = {
  /** Organization snapshot to render. */
  organization: Organization;
  /** Employee whose node should remain highlighted for the active event. */
  highlightedEmployeeId?: number;
};

/**
 * Renders an interactive Cytoscape organization chart and animates changes
 * whenever a new organization Map is received.
 */
export function OrgChart({
  organization,
  highlightedEmployeeId,
}: OrgChartProps) {
  // The DOM element Cytoscape renders the graph inside.
  const containerRef = useRef<HTMLDivElement>(null);
  // The Cytoscape instance used to update and animate the graph.
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Create Cytoscape exactly once. React owns the surrounding interface while
    // Cytoscape imperatively owns everything inside the canvas container.
    const cy = cytoscape({
      container: containerRef.current,
      elements: elementsFor(organization),
      minZoom: 0.55,
      maxZoom: 1.35,
      wheelSensitivity: 0.2,
      boxSelectionEnabled: false,
      style: [
        { selector: "node", style: { width: 176, height: 68, shape: "round-rectangle", "background-color": "#ffffff", "border-color": "#b7b7c0", "border-width": 1, label: "data(name)", color: "#18181b", "font-size": 13, "font-weight": 600, "font-family": "Arial, sans-serif", "text-valign": "center", "text-halign": "center", "text-margin-y": -8, "text-wrap": "wrap", "overlay-opacity": 0 } },
        { selector: "edge", style: { width: 1.5, "line-color": "#a8a8b2", "target-arrow-shape": "none", "curve-style": "round-taxi", "taxi-direction": "downward", "taxi-radius": 8, "taxi-turn": 34, "taxi-turn-min-distance": 18, opacity: 0.9 } },
        { selector: ".event-highlight", style: { "border-color": "#6d5dfc", "border-width": 2 } },
      ],
    });

    cy.nodes().forEach((node) => {
      node.style("label", `${node.data("name")}\n${node.data("role")}`);
    });
    runLayout(cy, false);
    cyRef.current = cy;

    const resize = () => {
      cy.resize();
      cy.fit(undefined, 36);
    };
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      cy.destroy();
      cyRef.current = null;
    };
    // Cytoscape owns the graph after initialization; the next effect syncs it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animate org changes
  useEffect(() => {
    // Current (old) hierarchy
    const cy = cyRef.current;
    if (!cy) return;

    // Diff desired element IDs against the live graph. This preserves existing
    // nodes and their positions, allowing Cytoscape to animate between layouts
    // instead of rebuilding the whole graph on every event.
    const desired = elementsFor(organization);
    const desiredIds = new Set(desired.map(({ data }) => String(data.id)));
    const currentIds = new Set(cy.elements().map((element) => element.id()));
    const additions = desired.filter(({ data }) => !currentIds.has(String(data.id)));
    cy.stop();
    // A node remains highlighted for the lifetime of its event and returns to
    // its normal outline when the next organization update begins.
    cy.nodes(".event-highlight").removeClass("event-highlight");
    // If a prior update interrupted an edge fade, restore surviving edges
    // before making this update's newly added edges transparent.
    cy.edges().style("opacity", 0.9);
    const removedElements = cy
      .elements()
      .filter((element) => !desiredIds.has(element.id()));
    let addedElements = cy.collection();

    // Batch removal, insertion, styling, and initial positioning so Cytoscape
    // never renders a new edge connected to a node at its default (0, 0) point.
    cy.batch(() => {
      removedElements.remove();
      if (!additions.length) return;

      addedElements = cy.add(additions);

      // New elements begin transparent, then fade into the organization below.
      addedElements.nodes().style("opacity", 0);
      addedElements.edges().style("opacity", 0);

      // Begin a new employee at their manager's current position instead of at
      // Cytoscape's default origin in the top-left corner.
      addedElements.nodes().forEach((node) => {
        const managerId = organization.get(Number(node.id()))?.reportsTo;
        if (managerId === null || managerId === undefined) return;

        const manager = cy.getElementById(String(managerId));
        if (manager.nonempty()) node.position(manager.position());
      });
    });

    organization.forEach((employee) => {
      const node = cy.getElementById(String(employee.id));
      node.data({ name: employee.name, role: employee.role });
      node.style("label", `${employee.name}\n${employee.role}`);
    });

    // Highlight only the employee named by the event. Reports whose manager
    // changed are deliberately excluded even though their edges also changed.
    if (highlightedEmployeeId !== undefined) {
      cy.getElementById(String(highlightedEmployeeId)).addClass(
        "event-highlight",
      );
    }

    // Animate the new graph while retaining its event highlight until the next update.
    runLayout(cy, currentIds.size > 0);
    const addedNodes = addedElements.nodes();
    const addedEdges = addedElements.edges();
    addedNodes.animate(
      { style: { opacity: 1 } },
      { duration: 300, easing: "ease-out-cubic" },
    );

    // Reveal the new reporting line once the node is clearly moving away from
    // its manager, avoiding the initial stretch without delaying its arrival.
    const edgeTimer = window.setTimeout(() => {
      addedEdges.animate(
        { style: { opacity: 0.9 } },
        { duration: 300, easing: "ease-out-cubic" },
      );
    }, EDGE_REVEAL_DELAY);

    return () => window.clearTimeout(edgeTimer);
  }, [highlightedEmployeeId, organization]);

  return (
    <div
      ref={containerRef}
      className="org-canvas"
      role="img"
      aria-label={`Organization chart showing ${organization.size} employees`}
    />
  );
}
