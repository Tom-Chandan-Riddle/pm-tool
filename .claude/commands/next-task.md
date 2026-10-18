---
description: Build exactly one task from FEATURES.md, with an approved approach and an audited diff.
argument-hint: [task ID, optional]
---

Task: $ARGUMENTS (if empty, take the first unchecked task of the first feature that isn't Done).

0. **Orient.** Read FEATURES.md and the last 15 lines of PROCESS-LOG.md. Run `git status`: if the tree isn't clean, stop and ask me what the uncommitted changes are.

1. **Branch.** If the feature has no branch yet:
   - If another feature branch is still unmerged, stop and tell me. It has to ship first.
   - `git checkout main && git pull`, create `feature/F0X-short-name`, push with upstream.
   - Write the feature's **Approach** in FEATURES.md: design in three to five lines, where the code goes, the key types, how it's tested, and any risks. Wait for my approval.

2. **Approach gate.** For this task, tell me:
   - what changes and in which files
   - the tests that prove it, including unhappy paths
   - edge cases it must handle
   - anything unclear, as questions with your recommended answer
   Then stop and wait. Don't write code until I approve. If I approve an assumption, record it per CLAUDE.md before coding.

3. **Build.** Write the failing tests first where it's cheap, then the smallest implementation that passes, following CLAUDE.md. Nothing beyond this task.

4. **Verify.** `npm run verify`: format check, lint with no warnings, typecheck, all tests green, build. Plus any checker the brief provides (command recorded in PROCESS-LOG.md). For a new or changed endpoint, update its metadata and the feature's `.http` file. If something unrelated fails, stop and tell me.

5. **Stage and audit.** `git add` the task's files, then audit `git diff --staged` yourself against this list. Fix what you find before showing me, and report what you changed.
   - **Correctness:** matches the acceptance criteria. Nulls, boundaries, time zones, rounding.
   - **Readability:** names a newcomer understands without context, methods doing one thing, no magic values.
   - **Modern TypeScript:** older patterns where a modern feature from CLAUDE.md would be clearer, and modern syntax used where it makes the code harder to read.
   - **Simplicity:** anything that can be removed, merged or made plainer. Abstractions with one implementation. Dead code.
   - **Extensibility:** the feature is self-contained in its folder and registration. Nothing in other features had to change.
   - **Observability:** business events, handled failures and dependency calls logged with structured properties per CLAUDE.md.
   - **Design:** single responsibility, dependencies pointing inward, no hidden coupling, easy to extend at the obvious seam.
   - **Errors and validation:** per CLAUDE.md. Nothing swallowed, nothing leaked.
   - **Performance:** queries in loops, loading whole tables, missing indexes for new lookups, sync I/O or CPU-heavy work on the event loop, needless React re-renders, effects that refetch on every render, heavy imports in the web bundle.
   - **Security:** injection, missing authorisation, secrets or personal data in logs.
   - **Assumptions:** any behaviour not traceable to the brief, an acceptance criterion or an approved assumption.

6. **Commit gate.** Show me: changed files, a short diff summary, test results, and the audit (findings fixed, plus anything you chose not to fix and why). Stop and wait for approval.

7. **Record.** Tick the task in FEATURES.md, set the feature to In Progress. Append a TASK entry to PROCESS-LOG.md with `date +%H:%M`. If I corrected you during this task, add an AI-FIX entry per correction.

8. **Commit and push.** One commit, `F0X.Y: imperative summary`, including FEATURES.md and PROCESS-LOG.md. Then `git push`.

9. Tell me the next task, and how long this feature has taken so far against its estimate.
