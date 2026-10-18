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
| A11 | `GET /projects` returns each project with `fileStatus` of `ok` or `missing`. | The web shows "file not found" without an error page. | 19 Oct |
| ~~A12~~ | ~~A corrupt `projects.json` is logged and read as an empty list. It is left untouched until the next successful write replaces it. | Never destroy a hand-edited file on a read.~~ Superseded by A17. | 19 Oct |
| A13 | Two projects may share the same `featuresPath`. | Nothing in the brief forbids it. | 19 Oct |
| A14 | Editing a project checks the features file again only when the path changed. | A rename must work while the file is missing. | 19 Oct |
| A15 | The selected project id is remembered in the browser's localStorage. If it is unavailable or the project is gone, nothing is selected. | A reload should keep the user's project. | 19 Oct |
| A16 | Removing a project asks for confirmation on the row first. | It is an easy click to make by mistake. | 19 Oct |
| A17 | A projects.json that is not valid JSON, is not an array, or has any invalid entry is never overwritten. Reads list the valid entries and log the rest. Add, edit and remove return 409 until the file is fixed by hand. A leading byte order mark is ignored. | A hand-edited file must not be lost. Supersedes A12. | 19 Oct |
| A18 | A project path must be absolute and end in `.md` (any case), at most 1024 characters. A name is at most 200. Breaking a rule returns 400 with a field error. A path that cannot be read returns 422 naming the cause: missing, no permission, or a folder. Tightens A10. | Stops arbitrary files being probed and avoids paths that depend on where the server started. | 19 Oct |
| A19 | The solution outline is kept as one raw markdown string in the snapshot. | The board only shows it as text. | 19 Oct |
| A20 | Snapshot types and schemas live in `packages/shared` and are exported from its `index.ts`. | Server and web both need them. | 19 Oct |
| A21 | A parse warning is `{section, line, message}` with a 1-based line number in the source file. | The user can find the bad line. | 19 Oct |

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
Priority: Must · Status: Done · Branch: feature/F00-foundation · Estimate: 25 min

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
- [x] F00.3 fix: map Fastify 4xx errors (bad JSON, 415, 413) to problem+json instead of 500
- [x] F00.4 fix: default NODE_ENV to production, validate inbound correlation IDs, log unknown routes at warn
- [x] F00.5 fix: test that logs carry the correlation ID and redact secrets, with working redact paths
- [x] F00.6 fix: guard repeated shutdown signals, add a close timeout, flush the fatal log before exit

### F01 Projects
Priority: Must · Status: Done · Branch: feature/F01-projects · Estimate: 35 min

Approach: `apps/server/src/features/projects` is one Fastify plugin: `projects.store.ts` (reads and writes `projects.json` at an injected path), `projects.service.ts` (add, edit, remove, list, validates the features file), `projects.routes.ts` and `projects.http`. A new `PROJECTS_FILE` env var sets the store path. `Project` and its zod schemas go in `packages/shared` because the web uses them too. Failures are `ProblemError` subclasses: `ProjectNotFoundError` 404, `InvalidProjectFileError` 422 (A1, A2, A10). The web feature (`features/projects`) has a list, add/edit form and switcher on TanStack Query. Tested with `app.inject()` against real temp folders and a real `projects.json`.

Acceptance criteria:
- [x] Adding a project with a valid features path returns 201 and the project survives a server restart
- [x] Adding a path that doesn't exist, is unreadable, or has no `### F` heading returns 422 with a clear message
- [x] Adding with an empty name or empty path returns 400 with field errors
- [x] Editing and removing a project works; an unknown id returns 404
- [x] A project whose file is later missing shows a "file not found" state, not an error page
- [x] A hand-edited or empty `projects.json` loads; a corrupt one fails with a clear log message and an empty list
- [x] The web app lists, adds, edits, removes and switches projects, with loading, empty and error states

Tasks:
- [x] F01.1 Projects store, service and routes with tests and `.http` file
- [x] F01.2 Web projects list, form and switcher
- [x] F01.3 fix: stop a hand-edited projects.json being overwritten (strip BOM, keep valid entries, refuse to write over an unparseable file)
- [x] F01.4 fix: require an absolute .md path (A10), name the cause in the 422, test the unreadable case
- [x] F01.5 fix: close the edit form when its project is removed, clear a selection that vanishes after a refetch, clear a stale add error
- [x] F01.6 fix: log a corrupt projects.json once, remove the temp file when a write fails and test the 500, report a folder as missing

### F02 Parser
Priority: Must · Status: Todo · Branch: feature/F02-parser · Estimate: 40 min

Approach: pure functions in `packages/shared/src/parser`, no I/O and no framework imports, one file per concern: `snapshot.ts` (zod schemas and `z.infer` types for `ProjectSnapshot`, `Feature`, `Criterion`, `Task`, `LogEvent`, `ParseWarning`), `features.parser.ts` (splits FEATURES.md into sections by `##` and `###` headings, then header, outline, assumptions, decisions, features and change log), `log.parser.ts` (F02.3). Each section parser returns `{ value, warnings }`, and a thin `parseFeaturesFile(text)` merges them, so a malformed section costs only itself. Metadata follows A3 and A4. The package keeps building to `dist`, so the server and web import the parser from `@pm-tool/shared` once it is exported from `index.ts`. Tests sit next to the package, run against this repo's own FEATURES.md and PROCESS-LOG.md copied into `test/fixtures`, plus malformed variants. Risk: the format is only defined by the template, so the parser reads headings and line shapes loosely and warns instead of throwing.

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
| 19 Oct | Added F00.3–F00.6 (fixes) to F00 after review of the branch | /review |
| 19 Oct | Added F01.3–F01.6 (fixes) to F01 after review of the branch | /review |
