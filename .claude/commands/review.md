---
description: Audit every commit on the current feature branch before the PR, using two independent agents. Required before /ship-feature.
---

1. Identify the current feature branch and its feature in FEATURES.md.
2. Run two subagents in parallel on `git diff main...HEAD`:
   - `reviewer`: correctness, error handling, security, observability, adherence to CLAUDE.md.
   - `edge-case-hunter`: acceptance criteria without tests, and edge cases nobody handled.
3. Merge their findings into one list, ranked: Must fix, Should fix, Note. Drop anything speculative or stylistic. Show me the list.
4. For each item I accept, create a task in FEATURES.md (`F0X.N: fix ...`). We fix them with `/next-task`.
5. Append a REVIEW entry to PROCESS-LOG.md: counts by rank, what I accepted, what I rejected and why.
6. Commit as `docs: review F0X` and push.
