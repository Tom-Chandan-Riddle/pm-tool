# PROCESS-LOG.md

A running record of how this work is done. FEATURES.md says what is built. This file records how: what was read, assumed and decided, how AI was used, where it was wrong, and what changed as a result.

Entries are appended, never edited. Times are IST. Each entry goes into the same commit as the work it describes.

## Setup

| Item | Value |
|---|---|
| Engineer | Chandan Sushma Shankar |
| AI coding tool | Claude Code in VS Code. Model and effort: _filled by /kickoff_ |
| Base commit | _filled by /kickoff_ |
| Repo state at start | _filled by /kickoff_ |

## Working agreement

How I work with AI on this repo. The log below records how closely the work followed it, and the summary at the end reports the result.

- AI drafts code, tests and docs from tasks defined in FEATURES.md.
- I approve each task's approach before code is written, and each diff before it is committed.
- Requirements, assumptions and trade-offs are my decisions. AI proposes options with a recommendation.
- Corrections to AI output are logged as AI-FIX. A correction that repeats becomes a rule in CLAUDE.md, logged as RULE.
- One model and effort level for the whole piece of work, chosen for correctness on edge cases over speed or token cost. Any change is logged with the reason.
- State lives in FEATURES.md and this file, not in the chat, so the AI's context can be cleared between features without losing anything.
- The AI's instructions are in CLAUDE.md and .claude/, so the setup can be reproduced.

## Entry types

| Type | When |
|---|---|
| START | Work begins: base commit and scope |
| READ | First pass of the requirements and repo: scope, gaps, risks |
| ASSUME | An ambiguity resolved by assumption, with the reason |
| PLAN | Features and tasks created or re-planned |
| DECISION | A design choice and the alternatives considered |
| TASK | A task completed and committed |
| AI-FIX | AI output was wrong or weak, and what I corrected |
| RULE | A repeated correction turned into a rule in CLAUDE.md |
| REVIEW | Findings from a review pass and what was done about them |
| SHIP | A feature merged to main |
| CHECKPOINT | Progress against estimates and any scope call |
| CUT | Scope dropped or deferred to protect quality |
| FREEZE | Code freeze, docs only from here |
| RETRO | What went well, what didn't, what I'd change |

Format: `HH:MM · TYPE · ID · one or two sentences`. Add the short commit SHA where there is one.

<!--
Expected depth:
09:12 · START · — · Base commit a1b2c3d. Requirements ask for an order intake API on the existing solution.
09:24 · ASSUME · A1 · Orders with zero quantity rejected with 422. An order line must request at least one unit.
10:05 · AI-FIX · F01.2 · AI wrapped the handler in an empty catch and returned 500. Replaced with a domain error mapped to 422.
-->

## Log

## Summary

_Written by /wrap-up from the entries above. Counts and facts only._
