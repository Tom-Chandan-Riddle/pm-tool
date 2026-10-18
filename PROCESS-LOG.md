# PROCESS-LOG.md

A running record of how this work is done. FEATURES.md says what is built. This file records how: what was read, assumed and decided, how AI was used, where it was wrong, and what changed as a result.

Entries are appended, never edited. Times are IST. Each entry goes into the same commit as the work it describes.

## Setup

| Item | Value |
|---|---|
| Engineer | Chandan Sushma Shankar |
| AI coding tool | Claude Code in VS Code. Model and effort: Sonnet 5.5 (claude-sonnet-5-5), low effort |
| Base commit | 8b83388 |
| Repo state at start | Greenfield. Docs and workflow files only, no package.json, no code. |

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
00:19 · RULE · — · Questions to the engineer go through the AskUserQuestion picker with a marked recommendation and an Other option last. Added to CLAUDE.md on request.
00:21 · START · — · Base commit 8b83388. Scope is Phase 1 of PM-TOOL-SPEC.md (F01–F05, no AI), React and TypeScript with a Node server.
00:21 · READ · — · Greenfield repo with workflow docs only. Spec decisions D1–D6 and answers Q1–Q3 are fixed. Gaps found: log time has no date, review accepted/rejected has no field, status fallback unstated. Risks: Windows file watching, loose parser format, no slack in an all-Must scope.
00:21 · DECISION · D1 · No database. Projects in projects.json behind one store module. SQLite and Drizzle were the alternative, but the spec names the file.
00:21 · DECISION · D2 · npm workspaces with apps/server, apps/web and packages/shared, so parser and schemas are shared.
00:21 · DECISION · D3 · chokidar v4 watches the folder. Plain fs.watch was the alternative, but chokidar handles Windows renames better.
00:21 · DECISION · D4 · Plain SVG for charts. A chart library was rejected for the few charts needed.
00:21 · DECISION · D5 · concurrently for npm run dev, as the spec wants one command.
00:21 · DECISION · D6 · No cache beyond the in-memory snapshot per watched project.
00:21 · ASSUME · A1–A10 · Ten assumptions approved: projects.json location, write scope of read-only, status fallback, metadata line format, current feature, actual-time rule, review keywords, single watcher, no pagination, path rules. Reasons are in FEATURES.md.
00:21 · PLAN · F00–F05 · Six features, 200 minutes of Must work against 6 hours available. F02 comes before F03 because the watcher publishes parsed snapshots.
00:50 · DECISION · D7 · TypeScript 6.0.3 instead of 7. npm resolved it as the version typescript-eslint supports; fallback was pre-approved at F00.1.
00:50 · TASK · F00.1 · Workspaces, strict config, Fastify app with correlation ID, problem+json errors, zod config, health routes and Scalar in development. 14 tests, verify green.
01:05 · TASK · F00.2 · Vite React app with TanStack Query, root error boundary, proxy to the server, and a concurrently dev script. 4 web tests, 18 in total, verify green.
01:08 · REVIEW · F00 · Two agents: 1 Must fix, 4 Should fix, 3 Notes after merging. All four fixes accepted as F00.3 to F00.6, including the shutdown and fatal-flush note. Rejected: config edge-case tests, since the schema already rejects those inputs.
01:12 · TASK · F00.3 · Fastify 4xx errors (bad JSON, 415, 413) now return problem+json with the correct status instead of 500. 4 new tests, 22 in total.
01:51 · TASK · F00.4 · NODE_ENV defaults to production with development set through .env.development. Inbound correlation IDs limited to 1-128 characters of [w.-], otherwise replaced. Unknown routes logged at warn. 25 server tests.
01:56 · TASK · F00.5 · Log capture for tests, working redact paths, and 6 tests for correlation ID on every log line, redaction, one error-level entry per unexpected error, and a warn entry for unknown routes. 30 server tests. Correction to the F00.4 entry: its pattern is [\w.-], the backslash was lost when writing the log.
01:59 · TASK · F00.6 · Process handlers moved to lifecycle.ts: single shutdown, 10 s force-exit timeout, error exit when close fails, fatal handlers. Dev pretty logs now a synchronous in-process stream so the last fatal line is written. 36 server tests.
02:00 · SHIP · F00 · Merged to main with a merge commit. 40 tests passing (36 server, 4 web), verify green. Actual time about 1 h 40 min against a 25 min estimate, mostly review fixes F00.3 to F00.6.
02:07 · ASSUME · A11–A14 · File status on the project list, corrupt projects.json left untouched until the next write, duplicate paths allowed, path re-checked on edit only when it changed.
02:07 · TASK · F01.1 · Projects store, service and routes with problem+json errors, PROJECTS_FILE config and a .http file. 20 new tests, 56 server tests in total. Schemas stay in the server for now because packages/shared resolves through dist, which typecheck runs before. A relative featuresPath is stored as typed.
02:15 · ASSUME · A15–A16 · Selected project remembered in localStorage, and removal asks for confirmation on the row.
02:15 · TASK · F01.2 · Web projects list, add/edit form, remove with confirmation and a switcher, with loading, empty, error and file-not-found states. 16 new web tests against a stubbed fetch, 20 web tests in total. Types are plain interfaces in the web feature until F02 settles the shared package build order.
02:18 · REVIEW · F01 · Two agents: 0 Must fix, 5 Should fix, 8 Notes after merging. All accepted as F01.3 to F01.6: hand-edited file protection, path rules and 422 reasons, web stale state, logging and cleanup. Rejected: duplicate-path check (A13 allows it), double-submit test (button is disabled while pending), size cap, abort signal and a version column, as not worth it for one local user.
02:21 · ASSUME · A17 · A projects.json the server cannot fully read is never overwritten: add, edit and remove return 409 until it is fixed by hand. Supersedes A12.
02:21 · TASK · F01.3 · BOM ignored, entries validated one by one with bad ones logged at warn, and writes refused with 409 over an unreadable file. 5 new server tests, 61 in total. The tests caught PUT returning 404 instead of 409 on a corrupt file, fixed with a strict read for edits.
02:26 · ASSUME · A18 · Project paths must be absolute and end in .md, with length limits on name and path. Unreadable paths return 422 naming the cause. Tightens A10.
02:26 · TASK · F01.4 · Input schema enforces A18 with field errors, and the 422 says whether the file is missing, unreadable or a folder, with the error code logged at warn. 8 new server tests, 68 passing and 1 skipped on Windows (the permission case). Stored entries are read with a looser schema so hand-edited paths still list.
02:30 · TASK · F01.5 · The edit form now follows the project id and closes when its project disappears, and starting an edit clears an old add error. 4 new web tests, 24 in total. The stale selection case already behaved correctly from F01.2, so its test only pins it. The stored id is left in localStorage by choice.
02:33 · TASK · F01.6 · A bad projects.json is logged once per distinct content, a failed write removes its temp file, and a path that became a folder lists as missing. 8 new server tests, 75 passing and 1 skipped. The cleanup test fails when the cleanup is removed. Only rename is mocked, since a late rename failure cannot be provoked on a real disk.
02:34 · SHIP · F01 · Merged to main with a merge commit. 100 tests passing and 1 skipped on Windows (75 server, 24 web, 1 skipped permission test), verify green. Actual time about 45 min against a 35 min estimate, with the overrun in review fixes F01.3 to F01.6.
02:48 · ASSUME · A19–A21 · Outline kept as raw markdown, snapshot types live in packages/shared, and a parse warning is {section, line, message} with a 1-based line.
02:48 · TASK · F02.1 · Snapshot schemas and parseFeaturesFile for header, outline, assumptions, decisions, features and change log, with warnings instead of exceptions. 21 new shared tests, including a hand-counted real sample. A missing section warns, and only the first table of a section is read cleanly.
02:55 · ASSUME · A22–A24 · A struck span marks a criterion superseded, a repeated feature ID is kept with a warning, and CR or Fix headings give kind and amends with a clean name.
02:55 · TASK · F02.2 · Parser reads feature and task kinds, amends links and superseded criteria, and keeps going past a malformed heading. 9 new shared tests, 30 in total. Tests caught a lost word boundary in the amends regex and a missing allowance for spaces inside the parentheses.
03:04 · ASSUME · A25–A26 · A log SHA is a hex word after the last separator and a dash ID means none. Only lines under the Log heading are entries, and commented blocks are skipped.
03:04 · TASK · F02.3 · parseProcessLog turns entries into typed events with time, type, id, text, sha and line, and warns on bad times, unknown types and stray lines. 24 new shared tests, 54 in total, with the type counts checked against a copy of this log.
03:16 · REVIEW · F02 · Two agents: 0 Must fix, 6 Should fix, 6 Notes. All six Should fix accepted as F02.4 to F02.7: fenced lines, log comments and spacing, table robustness, feature body metadata and approach. Notes left as they are, since they are rare or already give a visible warning: fence marker length, duplicate sections, criteria label variants, amends with trailing text, nested bullets and the ProjectSnapshot wording in the Approach. About a dozen strictness items were dropped as speculative.
03:24 · ASSUME · A27–A28 · Fences follow the CommonMark rule and an unclosed one warns at its opening line. Fenced lines never create items, are kept in an Approach, and are ignored in the log.
03:24 · TASK · F02.4 · readSourceLines matches fence marker type and length and reports an unclosed fence, and feature bodies and the log skip fenced lines. 17 new shared tests, 71 in total. Removing the feature-body skip made two tests fail, so they do catch it.
03:34 · ASSUME · A29–A30 · Log comment spans are removed and the rest of the line is parsed, with an unclosed comment hiding the rest and warning. Fields may have any whitespace around the separator and the text is kept as written.
03:34 · TASK · F02.5 · The log parser keeps entries with a trailing or leading comment, warns on an unclosed comment and accepts tabs and extra spaces around the separator. 10 new shared tests, 81 in total. A test caught a greedy SHA pattern that left a trailing space. An empty ID field now warns instead of reading as none.
03:47 · ASSUME · A31–A32 · A backslash-escaped pipe stays in a table cell. Only the first table in a section is read, a later table warns, and a table with no separator row warns and reads no rows.
03:47 · TASK · F02.6 · Table reading handles escaped pipes, warns about a missing separator row and ignores later tables with a warning. 7 new shared tests, 88 in total. A pipe inside a code span still needs the backslash, as on GitHub.
03:52 · ASSUME · A33–A34 · An Approach runs to the next label with blank lines kept, and only the first Priority line of a feature is its metadata, with a later one ignored and warned about.
03:52 · TASK · F02.7 · The feature body keeps the first Priority line, warns about a duplicate, and reads an approach across blank lines to the next label. 7 new shared tests, 95 in total. My first edit script failed on an escape and applied nothing, so the new tests ran red before the change.
03:54 · SHIP · F02 · Merged to main with a merge commit. 194 tests passing and 1 skipped on Windows (95 shared, 75 server, 24 web, 1 skipped permission test), verify green. Actual time about 60 min against a 40 min estimate, with the overrun in review fixes F02.4 to F02.7.
04:09 · ASSUME · A35–A37 · Watching a missing folder fails with a clear error. A file that keeps changing for over 5 seconds is skipped with a warning. A missing features file is emitted as null and a missing log is never an error.
04:09 · TASK · F03.1 · chokidar watcher on the project folder with debounce, stable-size wait, recreate handling and an idempotent close, plus readProjectFiles. 25 new server tests, 100 in total, run five more times without a failure. The stable-wait timeout is tested on its pure function, since real file events always supersede it.

## Summary

_Written by /wrap-up from the entries above. Counts and facts only._
