"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { companyPresets, defaultCompanyPreset } from "../data/org-events";
import { buildOrganization } from "../lib/build-organization";

/**
 * Supplies the demo's event data, derived organization, and timeline controls.
 * Replacing `companyPresets` with API-backed data leaves the presentation and
 * Cytoscape components unchanged.
 *
 * @returns Current organization state and controls for navigating the events.
 */
export function useOrgEvents() {
  const [selectedCompanyId, setSelectedCompanyId] = useState(
    defaultCompanyPreset.id,
  );
  const selectedCompany =
    companyPresets.get(selectedCompanyId) ?? defaultCompanyPreset;
  const events = selectedCompany.events;

  // Start each preset at a populated snapshot while leaving later changes ready
  // to demonstrate through the playback controls.
  const [eventIndex, setEventIndex] = useState(
    defaultCompanyPreset.initialEventIndex,
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const organization = useMemo(
    () => buildOrganization(events, eventIndex),
    [events, eventIndex],
  );

  const next = useCallback(() => {
    setEventIndex((current) => {
      if (current >= events.length - 1) {
        setIsPlaying(false);
        return current;
      }
      return current + 1;
    });
  }, [events.length]);

  const previous = useCallback(() => {
    setIsPlaying(false);
    setEventIndex((current) => Math.max(0, current - 1));
  }, []);

  const reset = useCallback(() => {
    setIsPlaying(false);
    setEventIndex(0);
  }, []);

  const selectCompany = useCallback((companyId: string) => {
    const company = companyPresets.get(companyId);
    if (!company) return;

    // React batches these updates so the new event array and its valid starting
    // index reach the UI together.
    setIsPlaying(false);
    setSelectedCompanyId(company.id);
    setEventIndex(company.initialEventIndex);
  }, []);

  useEffect(() => {
    if (!isPlaying) return;

    // Advancing is centralized in `next` so manual and automatic playback use
    // the same end-of-timeline behavior.
    const timer = window.setInterval(next, 1700);
    return () => window.clearInterval(timer);
  }, [isPlaying, next]);

  return {
    companies: companyPresets,
    selectedCompanyId,
    selectCompany,
    organization,
    events,
    eventIndex,
    activeEvent: events[eventIndex],
    isPlaying,
    canGoBack: eventIndex > 0,
    canGoForward: eventIndex < events.length - 1,
    next,
    previous,
    reset,
    togglePlayback: () => setIsPlaying((playing) => !playing),
  };
}
