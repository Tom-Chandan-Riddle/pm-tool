---
description: Merge the finished feature to main with a merge commit and record it.
---

0. Confirm `/review` has run on this feature: a REVIEW entry for it exists in PROCESS-LOG.md, every accepted Must-fix task is ticked, and the only code commits after the REVIEW entry are those accepted fix tasks. If not, stop and tell me to run `/review` first. F00 Foundation is the one exception: a review is recommended but not required.
1. Confirm every task and acceptance criterion for the current feature is ticked in FEATURES.md. If any are not, list them and ask whether to finish them or cut them with a reason.
2. `npm run verify` and any checker the brief provides, on the branch. Stop on any failure.
3. Set the feature to Done in FEATURES.md. Append a SHIP entry to PROCESS-LOG.md with test count and `date +%H:%M`. Commit as `F0X: mark done` and push.
4. Merge to main, keeping every commit:
   - If `gh auth status` succeeds: `gh pr create --base main --fill`, with a body listing the acceptance criteria and the test result, then `gh pr merge --merge`. Do not pass `--delete-branch` and do not squash.
   - Otherwise: `git checkout main && git pull && git merge --no-ff feature/F0X-... -m "Merge F0X: <name>"` and `git push`.
5. `git checkout main && git pull`, then `npm ci` and `npm run verify` on main. If main is red, fix it immediately on main as `F0X: fix main after merge` before anything else.
6. Tell me the short SHA now on main, the next feature, and the feature's actual time against its estimate. Then remind me to run `/cost`, note the figure, and run `/clear` before the next feature. All state is in FEATURES.md and PROCESS-LOG.md, so nothing is lost.

Never create tags. Never delete the branch.
