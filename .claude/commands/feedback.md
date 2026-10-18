---
description: Record my correction of your work, and turn repeated corrections into rules.
argument-hint: <what you got wrong>
---

Feedback: $ARGUMENTS

1. Say in one line what you got wrong and why it was wrong. No apology, no padding.
2. Where the mistake is decides where the fix goes. Never untick or rewrite a done task.
   - **In the current, uncommitted task:** fix it in this task. It goes in with the task's commit.
   - **In a committed task of the feature in progress:** add a task `F0X.N fix: <what> (from F0X.Y)` to this feature.
   - **In a feature already merged:** add a task to the feature in progress if it's small and related, or a new feature `F0Y Fix: <what> (amends F0X)` if not. Ask me which.
3. Append an AI-FIX entry to PROCESS-LOG.md with `date +%H:%M` and the task ID.
4. Look through earlier AI-FIX entries in PROCESS-LOG.md. If this correction matches an earlier one in substance (same kind of mistake, not just the same file), it's a pattern:
   - Propose a one-line rule for the "Rules learned during this session" section of CLAUDE.md, numbered R1, R2...
   - On my approval, add it, add a row with its reason to DEFAULTS.md, append a RULE entry to PROCESS-LOG.md, and check the code already written on this branch for the same mistake.
5. If the feedback is about scope or requirements rather than code, say so and suggest `/pm-drill` instead.
