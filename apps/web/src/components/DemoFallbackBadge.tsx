interface DemoFallbackBadgeProps {
  /** Short reason the demo data is showing — usually "server unreachable". */
  reason?: string;
}

/**
 * S12 B.2 — demo-data indicator. Shown next to a page title when one or more
 * TanStack Query hooks for that page have errored AND we fell back to a
 * `MOCK_*` constant so the UI still renders. Per the project's "honest
 * staging" rubric (G4 in `HL7-Challenge-Evaluation.md`), mock data is never
 * allowed to silently impersonate real data — when this badge is visible,
 * the judge/user knows they're looking at safety-net data, not live HAPI
 * output.
 *
 * Pattern at the page level:
 *   const summaryQuery = useQuery({
 *     queryKey: ['population-summary'],
 *     queryFn: getPopulationSummary,
 *     placeholderData: MOCK_POPULATION_SUMMARY,
 *     retry: 1,
 *   });
 *   const summary = summaryQuery.data ?? MOCK_POPULATION_SUMMARY;
 *   {summaryQuery.isError && <DemoFallbackBadge />}
 */
export function DemoFallbackBadge({ reason = 'server unreachable' }: DemoFallbackBadgeProps) {
  return (
    <span
      data-testid="demo-fallback-badge"
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-pill px-2 py-0.5 bg-amber-dim border border-amber text-amber"
      title={`Showing demo data because the ${reason}. Real data resumes when the API is back.`}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
        <path d="M12 9v4M12 17h.01" />
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      </svg>
      Demo data — {reason}
    </span>
  );
}