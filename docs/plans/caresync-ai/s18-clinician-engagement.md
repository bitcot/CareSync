# S18 WSC — Clinician Engagement

> **Slice:** S18 WSC (companion to `prd-s18.md`)
> **Status:** Draft (ready to send today)
> **Purpose:** Get one clinician to spend 90 minutes reviewing the Risk / Care Gap / SDOH rubric structure on a 26-patient cohort.
> **Highest-leverage single action in S18:** if a clinician responds and validates even 5 labels, Pillar P6 moves from 4 → 4.5 and total HL7 evaluation lifts from 86.8 → ~90.2. If they don't respond, P6 movement is +0.25 (engagement attempted, not validated) and the slice still merges.

---

## COPY-PASTE-READY EMAIL — SEND THIS TODAY

**To:** *(one clinician you have a working relationship with — primary care, hospitalist, cardiology, or endocrinology preferred; the rubric most directly impacts risk stratification in those specialties)*
**Subject:** 90-minute review — clinical risk rubric for an HL7 AI Challenge submission

---

Hi Dr. [Last Name],

I'm submitting [organization's] work to the HL7 AI Challenge 2026 and could use a clinician's eye on the risk-stratification rubric before the final eval. The system reads a patient's FHIR record with multiple LLM agents (risk, care gap, SDOH) and writes prioritized FHIR Tasks back to the care team. We're at 86.8/100 in the judge's pre-evaluation and the only piece below 4/5 on the rubric is the eval itself — specifically, that zero of our 26 ground-truth labels are clinician-validated.

What I'd ask for: 90 minutes, virtual, week-of-[DATE YOU PICK — aim for next week]. You don't need to prep. I'll share the eval report + the 3-page rubric structure docs 24 hours in advance and run you through them live. The agenda is below if you want to scan it. If you say no, that's a real and useful answer — we just need the audit trail of having asked.

The rubric is anchored on three signals — multi-condition comorbidity, recent inpatient discharge, and abnormal labs — with explicit "0 anchors → low / 2 anchors without labs → moderate" rules and 5 worked examples. I'd particularly value your read on whether the 2-anchor-without-labs case (comorbidity + recent discharge, but no recent HbA1c / BNP / eGFR on file) is calibrated right: does 'moderate' match your clinical read, or does it under-call?

If 90 minutes doesn't work, a 30-minute version is fine — we'd just skip the labeled-set review at the end.

Thanks for considering it.

— Manjula / Bitcot

---

*(End of email. Below is the support material — pre-meeting checklist, agenda, outreach-log update protocol.)*

---

## §1 — Outreach email template

The block above is the complete, ready-to-send email. Notes on the design choices:

- **No honorarium mentioned.** Per project context, the clinician is doing a peer review of a CHALLENGE submission, not a paid engagement. Adding money signals "this is a paid task" and changes the response posture. A small gesture of thanks (a hand-written card, a coffee gift card, a mention in the submission's ack section) is appropriate *after* the session if it goes well, not negotiated upfront.
- **The "rubric most directly impacts risk stratification in those specialties"** — primary care / hospitalist / cardiology / endocrinology are the specialties whose read of "comorbidity + recent discharge without labs" is most directly relevant to the model's call. Family medicine is the broadest fit for the cohort's mixed-condition profile.
- **"If you say no, that's a real and useful answer"** — explicitly welcome the decline. The audit-trail value of having asked is +0.25 to P6 even with a no-response, per the PRD's score-card delta.
- **No mention of compensation in the ask.** If the clinician responds asking about payment, the posture is "happy to do a brief honorarium if that's the norm for your institution" — defer the specifics to the follow-up exchange.

## §2 — 24-hour-advance pre-meeting checklist

Run these commands and email the outputs the day before the session:

```bash
# 1. Confirm the eval report is current (regenerated after OpenAI quota refresh).
cd apps/api && npx tsx src/scripts/eval.ts
cat docs/eval-report.md | head -120

# 2. Render the clinician-review surface (the agents' decision narrations + the labels).
cd apps/api && npx tsx src/scripts/render-clinician-review.ts
# Output: docs/clinician-review.md — the per-agent narrated reasoning against the 26 labeled patients.

# 3. Save the rubric design docs.
cat docs/plans/caresync-ai/design-risk-calibration.md      # S13 reverted rubric — audit trail
cat docs/plans/caresync-ai/design-risk-calibration-v2.md  # v2 rubric (S16) — the working design doc
cat docs/plans/caresync-ai/rubric-eval-result.md          # 2x2 gate result + the 4 v2 FPs explicitly named
cat docs/plans/caresync-UI/apps/api/src/agents/riskAgent.ts | sed -n '97,200p'  # current v3 buildPrompt body
```

Send the clinician:
- `docs/eval-report.md` (post-v3 or post-v4, whichever is current)
- `docs/clinician-review.md` (if rendered)
- `docs/plans/caresync-ai/design-risk-calibration-v2.md`
- `docs/plans/caresync-UI/apps/api/src/agents/riskAgent.ts` lines 97-201 (the current rubric body)

Skip the S13 reverted-rubric file — that's internal history, not review material.

## §3 — 90-minute meeting agenda

| Time | Phase | What happens | What we ask |
|---|---|---|---|
| 0:00 – 0:10 | Walkthrough | Open PatientDetail on `maria-chen`. Run a live analysis. Watch the 5-agent graph animate on screen. The agent narrates its reasoning in tokens; the orchestrator synthesizes. | "Does the sequence make clinical sense to you? Is anything missing before the system's first output?" |
| 0:10 – 0:30 | Risk rubric review | Walk through: 3 anchors (comorbidity / recent discharge / abnormal labs), Rule 1 (0 anchors → low), Rule 2 (1 = moderate / 2 = high only with abnormal labs / 3 = critical), 5 worked examples (james-okafor, linda-torres, maria-chen, bob, pop-0004). Then the 4 v2 FPs in `rubric-eval-result.md §"Specificity lift on the four FP patients"`. | "For each of the 4 FPs — james-okafor (COPD alone), linda-torres (CKD alone), pop-0004 (diabetes + CHF + recent discharge, no labs), pop-0005 (diabetes + depression, low riskScore) — should this patient be 'high', 'moderate', or something else?" |
| 0:30 – 0:50 | Care Gap rubric review | Open `careGapAgent.buildPrompt` (referenced from `apps/api/src/agents/careGapAgent.ts`). Walk through what counts as a monitoring gap (HbA1c overdue for diabetes, BNP overdue for CHF, etc.). Show the 1 dev-labeled FP (`maria-chen`, where the agent flagged a gap but the label expects none because observations are on file). | "Looking at `maria-chen`'s record — does the agent's call ('there IS a gap') match your clinical read, or should 'no gap' be the right call when observations are on file, even if recent?" |
| 0:50 – 1:10 | SDOH rubric review | Open `apps/api/src/agents/sdohAgent.ts`'s `buildPrompt`. Walk through the AHC-HRSN screening shape. Show the 5 dev-labeled screenings (3 positive + 2 explicit-negative). Note that held-out cohort has zero SDOH data points (a label-set issue, not a rubric issue). | "For the 3 positive SDOH patients — does the agent's call (transportation / financial / etc.) match what you'd flag in your own practice? For the 2 negative — does 'no barrier' hold up?" |
| 1:10 – 1:30 | Labeled-set review | Open `data/eval/labels.json`. Walk through 5–15 labels. Use the existing `clinicianOverride` slot: each row has `source: "dev"` + an empty `clinicianOverride: null` field. The clinician can fill in via the running `npm run review:apply` flow (during the session), or by sending back the rows they've marked up afterward. | "For these patients, does `expectedHighRisk: false` look right? Does any expected gap look wrong? Just mark up the rows you can answer; leave the rest." |

The 90 minutes is hard-stop. If the Risk rubric review is still active at 0:30, we either truncate Care Gap + SDOH into a 20-minute combined block or schedule a 30-minute follow-up.

## §4 — Outreach-log update protocol (S15 schema)

When a clinician responds (positively, negatively, or no-response after 14 days), append an entry to `data/eval/clinician-outreach.json`'s `invitations[]` array. Schema (carried from S15; no change):

```json
{
  "invitations": [
    {
      "id": "outreach-2026-07-09-001",
      "sentTs": "2026-07-09T...Z",
      "sentTo": "[clinician name or alias — the clinician's consent per the _meta.consentBoundary field must be confirmed before adding this]",
      "respondedTs": null,
      "validatedCount": 0,
      "declineReason": null,
      "notes": "Sent the WSC email template. Awaiting response."
    }
  ]
}
```

Field semantics:
- `id` — `outreach-{YYYY-MM-DD}-{sequence}` (zero-padded if multiple on same day)
- `sentTs` — ISO-8601 timestamp the email was sent
- `sentTo` — clinician's preferred identifier; **only set this field after confirming the clinician is OK with their name appearing in a public eval artifact** (per `_meta.consentBoundary`); otherwise use an alias like "primary-care-physician-A"
- `respondedTs` — ISO timestamp of first response (positive or negative); null if no response within 14 days
- `validatedCount` — number of labels they validated via `npm run review:apply`; updates during and after the session
- `declineReason` — short free-text (e.g., "too busy", "not the right specialty", "would need IRB approval"); null if positive or no-response
- `notes` — running commentary the next reviewer (or future-you) will thank you for

Update protocol:
1. **Send email today** → add the entry with `respondedTs: null`, `validatedCount: 0`.
2. **14 days no response** → update `respondedTs` to `null` (still null) and `notes` to "no response after 14 days."
3. **Positive response** → update `respondedTs` + `notes`; leave `validatedCount` as 0.
4. **After the 90-min session** → update `validatedCount` to the actual number the clinician validated (likely 5-15); append a `notes` entry with "validated N labels via review:apply; see `data/eval/labels.json` rows X-Y for `source: clinician`."
5. **Decline** → update `respondedTs` + `declineReason` + `notes`; `validatedCount` stays 0.

The schema is committed in the S15 initial state; this protocol documents the timing + semantics of the writes.

## §5 — Honesty section (what this engagement does and doesn't move)

If the clinician responds and validates **N** labels:

| N | P6 movement | Total weighted | Note |
|---|---|---|---|
| 0 (no response) | +0.25 (attempted) | ~89.4 | Engagement documented; rubric stays at "dev-labeled only" |
| 0 (decline) | +0.25 (attempted) | ~89.4 | Same as no response for score purposes |
| 1-4 | +0.30 (attempted + minimal validation) | ~89.5 | Audit trail improves; P6 itself may not lift |
| **5-14** | **+0.50 (validated, partial)** | **~90.0** | P6 lifts from 4 → 4.5; the threshold for the 90+ total |
| 15+ | +1.00 (validated, comprehensive) | ~90.6+ | P6 lifts to 5; the strongest single deliverable in the slice |
| 26 (full set) | +1.00 (clinician-validated ground truth) | ~90.6+ | The eval-report's source field shifts to "clinician" for all rows; same P6 movement as 15+ |

**The labels the clinician validates go through the existing `npm run review:apply` pipeline** — no new code path. The label rows' `source` field shifts from `"dev"` to `"clinician"` automatically (S14's `c6587f1` made this data-driven). The eval harness reads the same 26 patients; the cache key doesn't change; the next eval run emits updated `source: clinician` lines in the eval-report. **No code change required for the labels to count** — they just need to be filled in.

**What this engagement does NOT move:**
- P7 (cost) — that's WSA's job, independent of clinician engagement
- P8 (experience) — that's the deferred S18-lite / 6th-agent-node work
- P9 (equity / multilingual) — different problem space, post-challenge
- The Care Gap specificity = 0% on the 1 dev-labeled negative example — that needs more negative labels, which is what this engagement may produce if the clinician validates the "no gap" cases

**What this engagement DOES move:**
- P6's biggest gap (clinician-validated ground truth) — 0/26 today, target ≥5/26 by session end
- The audit-trail honesty: an *attempted* engagement is documented whether or not it produces labels
- The 90-minute clinician-time cost is real; the +0.5 P6 delta is the most-rubric-movement-per-hour available in this slice

## §6 — What if the engagement overlaps with WSA's post-v3 eval?

Realistic ordering: send email Day 0, WSA eval runs Day 1-2, engagement session in week-of-Day 7 (clinician's schedule). WSA's eval-regen produces real numbers by Day 2; the engagement's 0:10-0:30 Risk rubric review (Phase 2 above) uses whatever post-v3 numbers exist at that point. If WSA's regen shows v3 nailed it, the Risk rubric review collapses to a 10-minute "rubric is working; here are the 4 FPs it already addressed" check. If WSA shows v3 missed it, the Risk rubric review expands to "here's the v3 eval, here's why we think v4 needs Rule 3, does your clinical read agree?" — both paths are productive.

---

## Slice status

- [x] Email drafted (above, §1)
- [ ] Email sent — *action: send today, then update `data/eval/clinician-outreach.json` per §4 protocol*
- [ ] Pre-meeting checklist run (§2) — *action: 24 hours before the session*
- [ ] 90-min agenda executed (§3) — *action: week-of [DATE YOU PICK]*
- [ ] Outreach-log updated (§4) — *action: at each transition above*

When this file gets the slice merged, the email-send action is logged in `data/eval/clinician-outreach.json` and the doc itself stays in `docs/plans/caresync-ai/` as the engagement record (one paragraph per future slice that touches the rubric — keeps the audit trail honest across S19, S20, etc.).
