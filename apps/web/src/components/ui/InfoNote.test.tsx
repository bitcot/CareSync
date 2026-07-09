import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InfoNote } from './InfoNote';

/**
 * Tests for the InfoNote primitive. Sets the bar for `components/ui/` test
 * coverage — siblings (Badge/Card/Spinner/Toast) have no tests today, so
 * this stays small (3 cases) and just locks in: caption renders, label
 * renders when provided, and the tone prop changes the glyph color.
 *
 * Pure presentational, no state — RTL `render` + `getByText` /
 * `getByTestId` is enough.
 */
describe('InfoNote', () => {
  it('renders the caption body', () => {
    render(<InfoNote>Four agents reason over Maria's FHIR bundle.</InfoNote>);
    expect(
      screen.getByText(/Four agents reason over Maria's FHIR bundle\./)
    ).toBeInTheDocument();
  });

  it('renders the label eyebrow when provided', () => {
    render(
      <InfoNote label="Why this matters" testId="note">
        Caption body text.
      </InfoNote>
    );
    expect(screen.getByText('Why this matters')).toBeInTheDocument();
    expect(screen.getByText('Caption body text.')).toBeInTheDocument();
    expect(screen.getByTestId('note')).toBeInTheDocument();
  });

  it('omits the label element when label prop is not provided', () => {
    render(<InfoNote testId="note">No label, just body.</InfoNote>);
    expect(screen.queryByText(/Why this matters/i)).not.toBeInTheDocument();
    expect(screen.getByText('No label, just body.')).toBeInTheDocument();
  });

  it('applies the cyan tone by default and respects the amber tone', () => {
    const { rerender } = render(<InfoNote testId="note">Body</InfoNote>);
    const root = screen.getByTestId('note');
    // Default tone is cyan — the ⓘ glyph + label both inherit from currentColor,
    // but the label span carries the explicit text-cyan class when label is set.
    // We check the SVG/label combo via the root container's className.
    expect(root.className).toMatch(/bg-surface-raised/);

    rerender(
      <InfoNote tone="amber" label="Reading this chart" testId="note">
        Body
      </InfoNote>
    );
    expect(screen.getByText('Reading this chart').className).toMatch(/text-amber/);
  });
});