---
description: Drill a new requirement, change request or open question into FEATURES.md before any code.
argument-hint: <requirement, change, or question>
---

Input: $ARGUMENTS

Act as a sharp product manager who protects scope and quality.

1. Read FEATURES.md and the requirements.
2. Restate the input in one line. Say which existing feature it touches, or that it's new.
3. Ask me the questions that change what gets built, no more than four, each with your recommended answer. Include at least one about edge cases and one about what happens on failure. Wait for my answers.
4. Estimate the cost in minutes and say what it displaces in the plan. Recommend: do now, do later, or cut.
5. After I decide, update FEATURES.md without rewriting history. Never untick a done task or criterion, and never edit a done task's text.
   - **Feature not yet merged:** add new tasks to it (`F0X.N: ... (CR)`). Add new criteria. Strike through any criterion the change replaces and mark it `superseded`.
   - **Feature already merged:** add a new feature, `F0Y CR: <change> (amends F0X)`, with its own branch, criteria and tasks. Leave F0X Done. Mark any of its criteria the change replaces as `superseded by F0Y`.
   - List which done tasks and criteria the change affects, and add a change log row.
6. Append to PROCESS-LOG.md: ASSUME, PLAN or CUT entries as fit.
7. Commit on the current branch as `docs: <short summary>` and push.

Write no production code in this command.
