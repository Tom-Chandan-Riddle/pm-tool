# PM-TOOL-SPEC.md

A personal project dashboard that reads a project's FEATURES.md and PROCESS-LOG.md, shows progress live as the files change, adds analytics, and uses AI for status summaries, risk flags and questions about the plan.

Version 0.2, 19 Oct 2026. For personal use on one machine.

Built in two phases. **Phase 1 (MVP): F01–F05, no AI.** A live view of a FEATURES.md file in its original location while an AI coding session updates it. **Phase 2: F06–F08**, the AI features.

## Decisions already made

| ID | Decision | Reason |
|---|---|---|
| D1 | React + TypeScript front end, with a small local server | Browsers can't read a file by path. The server reads and watches the files and pushes changes. |
| D2 | Server pushes changes over Server-Sent Events | One-way server-to-browser updates are all that's needed. SSE is simpler than WebSockets and reconnects on its own. |
| D3 | A deterministic parser, not AI, turns the files into data | The file format is fixed and known. A parser is exact, instant and free. AI is only for interpretation. |
| D4 | AI behind one provider interface: Anthropic first, Gemini possible | The provider is an external boundary with two real candidates. Switching is a configuration change. |
| D5 | The dashboard works fully without AI | No key configured means no AI panel, nothing broken. |
| D6 | Read-only | The tool never writes to FEATURES.md or PROCESS-LOG.md. Those files belong to the workflow that produces them. |

## Answered questions

| ID | Question | Answer |
|---|---|---|
| Q1 | Server in Node or .NET? | Node |
| Q2 | Where are projects remembered between restarts? | A `projects.json` file next to the server, editable by hand |
| Q3 | Which model for phase 2? | Sonnet 5.5 |

## Features

### F01 Projects
Priority: Must · Phase 1

- Add a project with a name and the full path to its FEATURES.md. PROCESS-LOG.md is looked up in the same folder and is optional.
- The path is validated on add: the file exists, is readable, and looks like a features file (has at least one `### F` heading). Otherwise a clear error is shown.
- Edit, remove and switch between projects. Projects persist across restarts.
- A missing or moved file shows a clear "file not found" state on that project, not a crash.

### F02 Parser
Priority: Must · Phase 1

- Parses FEATURES.md into: header (base commit, repo state), solution outline, assumptions, decisions, features (ID, name, priority, status, branch, estimate, approach, criteria with ticked state, tasks with ticked state), and the change log.
- Recognises change requests and fixes (`CR:`, `Fix:`, `amends F0X`, `(CR)`, `fix:`) and superseded criteria.
- Parses PROCESS-LOG.md entries (`HH:MM · TYPE · ID · text`, optional SHA) into typed events.
- Tolerant: a malformed section is reported as a parse warning and skipped. The rest still renders.
- Unit tests built from real sample files, including malformed ones.

### F03 Live updates
Priority: Must · Phase 1

- The server watches both files. A change is re-parsed and pushed to the browser within one second.
- Watch the **folder**, not the file, and filter by filename. Editors and AI tools often save by writing a temp file and renaming it over the original, and a watcher bound to the file can silently stop after the first rename, especially on Windows.
- Read only once the write has finished (file size stable for about 200 ms), so a half-written file is never parsed.
- If the file is deleted and recreated, the watch carries on without a restart.
- Tested with real save patterns: in-place write, temp-file-and-rename, delete-and-recreate, and ten saves in two seconds.
- Rapid successive saves are debounced (about 300 ms) so a burst of writes causes one update.
- The browser reconnects automatically if the server restarts, and shows a "Live" or "Reconnecting" indicator.
- An editor writing the file in two steps (truncate, then write) must not show an empty board in between: if a parse yields nothing, keep the last good state and show a warning.

### F04 Board
Priority: Must · Phase 1

- Features grouped by status (Todo, In Progress, Done, Cut), with priority, estimate, and task progress (ticked of total).
- Expand a feature to see its approach, criteria and tasks.
- The current feature and branch are highlighted.
- Change requests and fixes show which feature they amend.

### F05 Analytics
Priority: Must · Phase 1

- Completion: tasks and criteria done against total, overall and for Must features only.
- Estimate against actual per feature, with actual taken from the first TASK entry to the SHIP entry in the log.
- Activity over time: tasks per hour, from log timestamps.
- Quality signals: AI-FIX count and the RULEs they produced, review findings accepted against rejected, assumptions, cuts and change requests.
- All analytics degrade gracefully when PROCESS-LOG.md is missing: show only what FEATURES.md supports.

### F06 AI status summary
Priority: Should · Phase 2

- A short plain-English status: where things stand, what's next, what's slipping.
- Generated when the files change, at most once every 2 minutes, and cached by a hash of both files so unchanged content never triggers a call.
- Shows when it was generated, and a "Refresh" button.

### F07 AI risk flags
Priority: Should · Phase 2

- Flags such as: a feature over its estimate, criteria with no tasks, a Must feature not started late in the plan, repeated AI-FIX entries of one kind with no RULE yet, a branch open a long time.
- Rules that can be computed exactly are computed in code (F05). AI adds only the judgement calls, each with its reason.

### F08 Ask the plan
Priority: Should · Phase 2

- A question box: "What's left before I can demo check-in?". The answer uses only the two files, and cites feature and task IDs.
- Answers that can't be grounded in the files say so instead of guessing.

## Non-functional

- API key in an environment variable or local config file, never in the front-end bundle or the repo.
- A monthly spend limit set in the provider's console. The tool also counts its own calls and shows usage.
- Structured server logs. Errors from the AI provider are shown as a notice in the AI panel, never as a broken dashboard.
- Runs with one command, for example `npm run dev`, starting both server and front end.

## Phase 1 done when

- The dashboard, pointed at a FEATURES.md that a Claude Code session is updating, shows each ticked task within a second, with no restart and no missed update across a whole session.
- Analytics match a hand count on a sample file.

## Out of scope

- Editing the files from the tool
- Multiple users, authentication, hosting
- Projects not in the FEATURES.md format
