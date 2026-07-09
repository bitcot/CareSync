import type { ReactNode } from 'react';
import clsx from 'clsx';

/**
 * `InfoNote` — small, always-visible explanatory caption paired with an
 * `ⓘ` glyph. Built for external evaluators (HL7 judges) who land on a screen
 * with no preamble and need a one-line "what you are looking at" /
 * "why it matters" in the same row as the chart or section title.
 *
 * Always-visible by design: the user's brief explicitly rejected hover-only
 * tooltips and screen-bottom footnotes as easy-to-miss. This sits inline with
 * the title or section header so the explanation is present the moment the
 * page renders, with zero interaction cost.
 *
 * Follows the same clsx + Tailwind pattern as `components/ui/Badge.tsx`:
 * token-driven tones, `className` passthrough for layout spacing.
 *
 * Pattern used in:
 * - Page headers (PatientDetail, Population, Governance, Quality, CostROI,
 *   Sdoh, TaskManagement) — caption = "why this matters" framing for the
 *   whole screen.
 * - Chart components (PopulationScatterChart, ParityRadarChart,
 *   QualityGaugeChart, ConfidenceChart) — when the page passes an optional
 *   `caption` prop, the chart renders an `<InfoNote>` under the canvas with
 *   the label "Reading this chart" and the page's caption as body. When no
 *   `caption` is passed, the chart is byte-identical to its pre-InfoNote
 *   version.
 */
export type InfoNoteTone = 'cyan' | 'amber' | 'emerald' | 'violet' | 'muted';

interface InfoNoteProps {
  /** Short eyebrow label — e.g. "Why this matters" or "Reading this chart".
   *  Rendered in 10px uppercase, letter-spacing per HANDOFF.md §4 design
   *  language. Optional; omitted entirely if not provided. */
  label?: string;
  /** 1–2 line caption (the actual explanation). Required. */
  children: ReactNode;
  /** Accent color of the ⓘ glyph. Defaults to 'cyan' (the orchestrator
   *  primary accent in HANDOFF.md §4). 'muted' falls back to text-muted,
   *  used for chart-level notes where the page already owns the tone. */
  tone?: InfoNoteTone;
  /** Test hook — applied to the root container. */
  testId?: string;
  className?: string;
}

const TONE_CLASSES: Record<InfoNoteTone, string> = {
  cyan: 'text-cyan',
  amber: 'text-amber',
  emerald: 'text-emerald',
  violet: 'text-violet',
  muted: 'text-text-muted',
};

/**
 * Inline 12×12px ⓘ glyph (circle + lowercase "i"). Drawn as SVG so we don't
 * pull in an icon font for a single character, and so the stroke/fill picks
 * up the tone color via `currentColor`. Avoids the emoji anti-pattern called
 * out in HANDOFF.md §4 ("No emoji — use inline SVG icons throughout").
 */
function InfoGlyph({ toneClass }: { toneClass: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={clsx('flex-shrink-0 mt-[1px]', toneClass)}
    >
      <circle cx="6" cy="6" r="5.25" stroke="currentColor" strokeWidth="1" fill="none" />
      <circle cx="6" cy="3.5" r="0.7" fill="currentColor" />
      <rect x="5.3" y="5" width="1.4" height="4" rx="0.5" fill="currentColor" />
    </svg>
  );
}

export function InfoNote({
  label,
  children,
  tone = 'cyan',
  testId,
  className,
}: InfoNoteProps) {
  const toneClass = TONE_CLASSES[tone];
  return (
    <div
      className={clsx(
        'inline-flex items-start gap-2 rounded-chip border border-border bg-surface-raised px-2 py-1.5 max-w-md',
        className
      )}
      data-testid={testId}
    >
      <InfoGlyph toneClass={toneClass} />
      <div className="min-w-0 flex flex-col gap-0.5">
        {label ? (
          <span className={clsx('text-[10px] font-medium uppercase tracking-wider', toneClass)}>
            {label}
          </span>
        ) : null}
        <p
          className="text-[11px] leading-snug text-text-muted font-mono m-0 truncate"
          title={typeof children === 'string' ? children : undefined}
        >
          {children}
        </p>
      </div>
    </div>
  );
}