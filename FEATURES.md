# FEATURES.md

The plan for this work and its single source of truth. Every requirement, assumption and change lands here before any code. PROCESS-LOG.md records how the plan was carried out.

Base commit: _filled by /kickoff_ · Repo state: _existing code / greenfield_

## How this file works

- Features are numbered in build order. Each has a priority, a status, a branch, and testable acceptance criteria.
- Tasks are numbered `F0X.Y`. One task is one commit, about 20 minutes of work.
- A feature is Done when every criterion has a passing test (or a written reason why not) and it's merged to `main`.
- Statuses: `Todo`, `In Progress`, `Done`, `Cut`. A cut feature stays listed with the reason.
- Done work is never unticked or rewritten. Changes are added as new tasks (`(CR)` or `fix:`) or new features (`CR:` or `Fix:`, with `amends F0X`). Replaced criteria are struck through and marked `superseded`.

## Brief summary

_Five lines or fewer, written by /kickoff: what's asked, what exists, what's required, what's stretch._

## Solution outline

_Approved at kickoff, before any features. About 15 lines: domain model, request flow, cross-cutting concerns, structure, variation points._

## Assumptions

Only assumptions I approved. Code that depends on one cites its ID.

| ID | Assumption | Reason | Approved |
|---|---|---|---|

## Decisions

| ID | Decision | Alternatives considered | Reason |
|---|---|---|---|

## Features

<!--
### F00 Foundation
Priority: Must · Status: Todo · Branch: feature/F00-foundation · Estimate: 25 min

Acceptance criteria:
- [ ] `npm run verify` passes with no warnings; one `inject()` test passes against /health
- [ ] Unhandled error returns 500 problem+json with correlation ID, no internals
- [ ] Every response carries X-Correlation-ID; logs include it
- [ ] Scalar UI available in Development
-->

<!--
### F01 Feature name
Priority: Must · Status: Todo · Branch: feature/F01-short-name · Estimate: 30 min

Approach (approved before the first task):
Three to five lines: design, where the code goes, key types, how it's tested, risks.

Acceptance criteria:
- [ ] Happy path behaviour
- [ ] Invalid input returns 400 with field errors
- [ ] Unknown ID returns 404

Tasks:
- [ ] F01.1 ...
- [ ] F01.2 ...
-->

## Change log

| Time | Change | Source |
|---|---|---|
