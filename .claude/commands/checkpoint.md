---
description: Progress check against the plan's estimates, with a scope recommendation.
argument-hint: [minutes left, optional]
---

Minutes left: $ARGUMENTS

1. Read FEATURES.md and PROCESS-LOG.md. Using the log's timestamps and `date +%H:%M`, work out how long each finished feature took against its estimate.
2. Say plainly whether we're ahead, on track or behind the plan, and by how many minutes.
3. List what's left: unmerged work, open tasks in Must features, Stretch features, and the estimate for each.
4. If minutes left were given and the remaining Must work plus review, hardening and docs won't fit, recommend what to cut or simplify so every Must feature still ships with tests and error handling. Cutting a Stretch feature beats shipping a Must feature without tests. Unmerged work isn't done, so a feature that can't be merged in time should be cut cleanly, not left half-finished.
5. Ask me for the current `/cost` figure and include it. Append a CHECKPOINT entry to PROCESS-LOG.md, and a CUT entry for anything I agree to drop. Update FEATURES.md statuses. Commit as `docs: checkpoint` and push.
