# FEATURES.md

The plan for this work and its single source of truth. Every requirement, assumption and change lands here before any code. PROCESS-LOG.md records how the plan was carried out.

Base commit: 8b83388 · Repo state: greenfield · Model: Sonnet 5.5, low effort

## How this file works

- Features are numbered in build order. Each has a priority, a status, a branch, and testable acceptance criteria.
- Tasks are numbered `F0X.Y`. One task is one commit, about 20 minutes of work.
- A feature is Done when every criterion has a passing test (or a written reason why not) and it's merged to `main`.
- Statuses: `Todo`, `In Progress`, `Done`, `Cut`. A cut feature stays listed with the reason.
- Done work is never unticked or rewritten. Changes are added as new tasks (`(CR)` or `fix:`) or new features (`CR:` or `Fix:`, with `amends F0X`). Replaced criteria are struck through and marked `superseded`.

## Brief summary

A personal dashboard that reads a project's FEATURES.md and PROCESS-LOG.md from their original location, shows progress live while a Claude Code session edits them, and adds analytics. Source: PM-TOOL-SPEC.md v0.2.
Phase 1 only, no AI: F01 Projects, F02 Parser, F03 Live updates, F04 Board, F05 Analytics. All Must. F06–F08 (AI) are out of scope for this plan.
Node (Fastify) server, React + TypeScript front end, SSE for pushes, read-only on the watched files.
Done when each ticked task shows within a second with no missed update across a session, and analytics match a hand count on a sample file.
Time available: about 6 hours. Must work is sized at about 200 minutes, the rest is for review, hardening and docs.

## Solution outline

**Domain.** A `Project` is `{id, name, featuresPath}`; its log path is derived from the same folder. The parser turns the two files into one `ProjectSnapshot`: header, outline, assumptions, decisions, features (criteria and tasks with ticked state, amends link, superseded flag), change log, log events, and `warnings[]`. The parser is a set of pure functions with no I/O. Analytics are pure functions over a snapshot.

**Request flow.** `GET/POST/PUT/DELETE /projects` (zod-validated, path checked on add) and `GET /projects/:id/snapshot`. `GET /projects/:id/events` is an SSE stream. Flow: route schema, handler, feature service, `projects.json` store or watcher, response. Expected failures (bad path, not a features file, unknown id, file missing) are typed errors mapped to problem+json.

**Live updates.** One watcher per selected project, on the folder, filtered by filename. Debounce 300 ms, then wait for stable file size (200 ms), then parse and push a `snapshot` event. An empty or unparseable result keeps the last good snapshot and sends a warning. Switching projects closes the old watcher. The browser's `EventSource` updates the TanStack Query cache and drives the Live/Reconnecting indicator.

**Cross-cutting.** Fastify plugins and hooks for correlation ID, pino logging with redaction, and the single error handler. Config is zod-validated env. Scalar docs in development only. No database, no cache; `projects.json` sits behind one store module with an injected path.

**Structure.** `apps/server/src/features/{projects,snapshot,watch}`, `shared/`; `apps/web/src/features/{projects,board,analytics,live}`, `shared/`; `packages/shared` holds the snapshot zod schemas and the pure parser and analytics functions, so server and web share them and they test without a server. Parsing runs on the server; analytics are computed in the browser from the snapshot.

**Variation points.** None in Phase 1. The AI provider interface comes in Phase 2.

## Assumptions

Only assumptions I approved. Code that depends on one cites its ID.

| ID | Assumption | Reason | Approved |
|---|---|---|---|
| A1 | Projects are stored in `apps/server/projects.json` (gitignored) as `{id, name, featuresPath}`. It is created empty on first run. | The spec asks for a hand-editable file next to the server. | 19 Oct |
| A2 | Read-only (D6 in the spec) covers FEATURES.md and PROCESS-LOG.md only. The server may write `projects.json`. | The tool must save projects it adds. | 19 Oct |
| A3 | An unknown status value becomes `Todo` with a parse warning. | One bad line should not hide a feature. | 19 Oct |
| A4 | Feature metadata is read from the line `Priority: X · Status: Y · Branch: Z · Estimate: N min`. A part that doesn't match gives a warning and an empty value. | That is the format in the FEATURES.md template. | 19 Oct |
| A5 | The current feature is the one with status In Progress. If none, nothing is highlighted. | The simplest rule that matches the workflow. | 19 Oct |
| A6 | Actual time per feature runs from its first TASK log entry to its SHIP entry. Log times have no date, so a time earlier than the previous entry is treated as the next day. A feature with no SHIP shows "in progress". | The log format carries only `HH:MM`. | 19 Oct |
| A7 | Review findings accepted and rejected are read from keywords in REVIEW entry text (accepted/fixed, rejected/skipped). When absent, the split shows "unknown" and only the REVIEW count is shown. | The log has no structured field for it. | 19 Oct |
| A8 | Only the selected project is watched. Switching closes the previous watcher. | One user, one open project. | 19 Oct |
| A9 | No pagination. The project list is small, and a snapshot returns all features and events because analytics need them. | A bounded list by nature. | 19 Oct |
| A10 | A project path may be any readable `.md` file with at least one `### F` heading. PROCESS-LOG.md is looked up in the same folder and is optional. | The spec requires the heading check, not the filename. | 19 Oct |

## Decisions

| ID | Decision | Alternatives considered | Reason |
|---|---|---|---|
| D1 | No database. Projects live in `projects.json` behind one store module. | SQLite with Drizzle (CLAUDE.md default). | The spec names the file (Q2). Nothing else needs persisting. |
| D2 | npm workspaces: `apps/server`, `apps/web`, `packages/shared`. | Two packages with duplicated types. | Shared zod schemas, parser and analytics are used by both sides. |
| D3 | `chokidar` v4 watches the folder, with debounce and size-stable checks on top. | Node `fs.watch` directly. | Handles Windows rename and recreate cases better. Fewer hand-rolled edge cases. |
| D4 | Charts are plain SVG and CSS. | A chart library. | A few simple charts. Avoids a dependency and bundle size. |
| D5 | `concurrently` runs server and Vite for `npm run dev`. | Two terminals. | The spec asks for one command. |
| D6 | No caching beyond the in-memory current snapshot per watched project. | A cache layer. | Files are small and re-parsed on change. |

## Features

### F00 Foundation
Priority: Must · Status: In Progress · Branch: feature/F00-foundation · Estimate: 25 min

Approach: only what the features use. Workspaces, strict TypeScript, ESLint and Prettier, Vitest. Server: `app.ts`, `server.ts`, zod config, pino with redaction, correlation ID, error handler, process fatal handlers, graceful shutdown, health, Scalar in development. Web: Vite React, TanStack Query, root error boundary. `npm run dev` starts both.

Acceptance criteria:
- [x] `npm run verify` passes with no warnings
- [x] `GET /health` returns 200 and `GET /health/ready` returns 200 (inject test)
- [x] An unhandled error returns 500 problem+json with the correlation ID and no stack trace
- [x] Every response carries `X-Correlation-ID`, taken from the request header when given, and logs include it
- [x] Invalid environment config stops startup before listening
- [x] Scalar UI is served in development only
- [x] The web app renders and a root error boundary shows a fallback when a child throws

Tasks:
- [x] F00.1 Root scaffold and server foundation with /health test
- [x] F00.2 Web scaffold, error boundary, render test, `npm run dev`

### F01 Projects
Priority: Must · Status: Todo · Branch: feature/F01-projects · Estimate: 35 min

Approach: `features/projects` plugin on the server with a `projects.json` store (injected path), a service for add/edit/remove/validate, and routes. Web feature has a project list, add/edit form and switcher using TanStack Query. Typed errors for invalid path, not a features file and unknown id (A1, A2, A10).

Acceptance criteria:
- [ ] Adding a project with a valid features path returns 201 and the project survives a server restart
- [ ] Adding a path that doesn't exist, is unreadable, or has no `### F` heading returns 422 with a clear message
- [ ] Adding with an empty name or empty path returns 400 with field errors
- [ ] Editing and removing a project works; an unknown id returns 404
- [ ] A project whose file is later missing shows a "file not found" state, not an error page
- [ ] A hand-edited or empty `projects.json` loads; a corrupt one fails with a clear log message and an empty list
- [ ] The web app lists, adds, edits, removes and switches projects, with loading, empty and error states

Tasks:
- [ ] F01.1 Projects store, service and routes with tests and `.http` file
- [ ] F01.2 Web projects list, form and switcher

### F02 Parser
Priority: Must · Status: Todo · Branch: feature/F02-parser · Estimate: 40 min

Approach: pure functions in `packages/shared/src/parser`, one per section, each returning `{value, warnings}`. Fixtures are this repo's FEATURES.md and PROCESS-LOG.md plus malformed copies. Metadata rules from A3 and A4.

Acceptance criteria:
- [ ] Header, outline, assumptions, decisions, features and change log are parsed from a real sample file
- [ ] Each feature has ID, name, priority, status, branch, estimate, approach, criteria and tasks with ticked state
- [ ] `CR:`, `Fix:`, `amends F0X`, `(CR)` and `fix:` are recognised, and a superseded criterion is flagged
- [ ] PROCESS-LOG entries `HH:MM · TYPE · ID · text` with an optional SHA become typed events
- [ ] An unknown log type or malformed line becomes a warning and the rest still parses
- [ ] A malformed feature section is skipped with a warning; other features still render
- [ ] An unknown status becomes Todo with a warning (A3)
- [ ] An empty file returns an empty snapshot with a warning, not an exception

Tasks:
- [ ] F02.1 Snapshot types and FEATURES.md parser for the core sections
- [ ] F02.2 Change requests, fixes, superseded criteria and tolerance for malformed sections
- [ ] F02.3 PROCESS-LOG.md event parser

### F03 Live updates
Priority: Must · Status: Todo · Branch: feature/F03-live-updates · Estimate: 45 min

Approach: `features/watch` on the server. A watcher on the folder filters by filename, debounces 300 ms, waits for a stable size for 200 ms, then parses and publishes. Keeps the last good snapshot (A8). Snapshot route plus SSE route. Web hook subscribes with `EventSource`, updates the Query cache and shows the indicator. Tested with real files in temp folders.

Acceptance criteria:
- [ ] A change to either file is parsed and pushed within one second
- [ ] In-place write, temp-file-and-rename, delete-and-recreate and ten saves in two seconds each end in the correct final state
- [ ] A burst of writes causes one update
- [ ] A half-written file is never parsed (read waits for stable size)
- [ ] Deleting and recreating the file continues without a restart
- [ ] A parse that yields nothing keeps the last good snapshot and sends a warning
- [ ] A missing PROCESS-LOG.md is not an error
- [ ] The browser reconnects after a server restart and shows Live or Reconnecting
- [ ] Switching projects closes the previous watcher; nothing leaks after shutdown

Tasks:
- [ ] F03.1 Folder watcher with debounce, stable-size read and recreate handling, tested on real files
- [ ] F03.2 Snapshot and SSE routes with keep-last-good
- [ ] F03.3 Web live hook and Live/Reconnecting indicator

### F04 Board
Priority: Must · Status: Todo · Branch: feature/F04-board · Estimate: 25 min

Approach: `features/board` in the web app. Columns for Todo, In Progress, Done and Cut, cards with priority, estimate and task progress. Expansion shows approach, criteria and tasks. Current feature per A5.

Acceptance criteria:
- [ ] Features appear in the column matching their status
- [ ] Each card shows priority, estimate and ticked of total tasks
- [ ] Expanding a feature shows its approach, criteria and tasks with ticked state
- [ ] The In Progress feature and its branch are highlighted
- [ ] A change request or fix shows the feature it amends
- [ ] Superseded criteria are shown struck through
- [ ] Loading, empty, file-not-found and warning states are shown, never a blank screen
- [ ] A ticked task appears on screen after a live update without a reload

Tasks:
- [ ] F04.1 Board columns and cards
- [ ] F04.2 Expandable detail, current-feature highlight and amends links

### F05 Analytics
Priority: Must · Status: Todo · Branch: feature/F05-analytics · Estimate: 30 min

Approach: pure analytics functions in `packages/shared/src/analytics`, tested against a hand-counted sample. A web view renders them with plain SVG. Rules from A6 and A7.

Acceptance criteria:
- [ ] Tasks and criteria done against total are correct overall and for Must features only
- [ ] Estimate against actual per feature uses first TASK to SHIP; an unshipped feature shows "in progress" (A6)
- [ ] A log time earlier than the previous entry is treated as the next day (A6)
- [ ] Tasks per hour are counted from log timestamps
- [ ] AI-FIX count, RULE count, review accepted against rejected, assumptions, cuts and change requests are shown (A7)
- [ ] With PROCESS-LOG.md missing, only FEATURES.md-based analytics show, with a notice
- [ ] Totals match a hand count on a sample file
- [ ] Superseded criteria are excluded from the totals

Tasks:
- [ ] F05.1 Analytics functions with hand-counted tests
- [ ] F05.2 Analytics view with graceful degradation

## Change log

| Time | Change | Source |
|---|---|---|
| 19 Oct | Plan created for Phase 1 (F00–F05) | /kickoff |
