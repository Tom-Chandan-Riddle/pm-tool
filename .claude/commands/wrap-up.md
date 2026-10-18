---
description: Close out a piece of work. Freeze code, finish docs, final push.
---

From here, no production code changes.

1. If a feature branch is unmerged: if its tests pass, ship it now with the `/ship-feature` steps. If they don't, leave it unmerged, mark its feature Cut in FEATURES.md with the reason, and say so in README.
2. On main, write or update README.md with these sections, short and concrete:
   - **What this is**: one paragraph.
   - **How to run**: prerequisites (Node version), install, verify, run in development. Where to find the Scalar UI and the `.http` files.
   - **What's done**: features shipped, linking to FEATURES.md.
   - **Assumptions**: the important ones, linking to FEATURES.md.
   - **Design decisions and trade-offs**: the three or four that matter, with the alternative you didn't choose.
   - **Quality**: test counts, what's covered, error handling, logging, health checks.
   - **What I'd do next**: honest, prioritised, including anything cut. Include CI (build and test on every pull request) if the repo doesn't have it.
   - **How I worked**: two lines pointing to FEATURES.md, PROCESS-LOG.md and CLAUDE.md.
   If the repo already had a README, add these as a clearly marked section instead of replacing it.
3. Make sure every feature in FEATURES.md has a final status.
4. Append FREEZE to PROCESS-LOG.md. Ask me for the RETRO in my own words and append it as I give it.
5. Write the Summary section of PROCESS-LOG.md from the log entries only. Counts and facts, no claims the entries don't support:
   - tasks committed, features shipped, features cut
   - assumptions made and decisions recorded
   - AI-FIX corrections and the rules they produced
   - review findings: raised, accepted, rejected
   - model and effort used, and any change during the work with its reason
   - AI usage, from the `/cost` figure I give you
   - where the work departed from the working agreement, if anywhere
6. `npm ci`, `npm run verify` and any provided checker on main one last time. Commit as `docs: README and final status`, push, and confirm `git status` is clean and `git log origin/main -1` matches local.
7. Tell me to stop pushing. Never create tags.
