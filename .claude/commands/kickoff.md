---
argument-hint: [where the requirements are, scope limits]
description: Run once at the start of a piece of work. Records the start, reads the brief and repo, then plans.
---

Notes from me: $ARGUMENTS

If the notes name the requirements files or limit the scope, those override what you'd otherwise infer.

Be fast and thorough, in that order of priority for steps 1–3.

1. **Record the base.**
   - `git checkout main && git pull`.
   - Record the base commit (short SHA of `main`) in the Setup table of PROCESS-LOG.md and the header of FEATURES.md, with the model and effort level you are running as. Fill only the Setup table. Never pre-fill the Log or Summary sections with anything that hasn't happened yet.

2. **Inventory the repo.** Don't change anything yet.
   - Find the brief (README, docs/, *.md) and read all of it.
   - List workspaces, packages, scripts in each `package.json`, frameworks, and test setup.
   - Find any checker, test harness or script the brief provides (look for `*.py`, `*.sh`, `Makefile`, `docker-compose*`, `scripts/`, and instructions in the brief). Read how to run it. Include it in the baseline run below, and record the exact command in PROCESS-LOG.md so later steps can run it.
   - Check the toolchain against the repo: `.nvmrc` and `engines` against `node --version`, and the lockfile (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`) to know which package manager to use. If the Node version or package manager is missing, stop and tell me exactly what to install. Don't change `.nvmrc`, `engines` or the lockfile type to work around it.
   - Install with the repo's package manager (`npm ci` when there's a `package-lock.json`). Run `npm run verify` if it exists, otherwise the repo's lint, typecheck, test and build scripts. Record the baseline: does it build, how many tests, how many pass.
   - Decide the repo state: existing code or greenfield. For existing code, note the conventions in use (frameworks, module system, data access, test framework, lint and format rules, naming).

3. **Report to me** in this shape, nothing longer:
   - Brief in five lines: what's asked, required versus stretch, any explicit acceptance or evaluation criteria.
   - Repo state and build/test baseline.
   - Numbered list of ambiguities, each with your recommended answer.
   - Top three delivery risks.
   - **Fit check.** Use the "Override when" column of DEFAULTS.md. A short table of the CLAUDE.md defaults that don't fit this brief or repo, each with what you propose instead and why. Cover at least: project structure and architecture style, server framework (Fastify or the repo's), front-end framework and data library, whether a database is needed and which one, ORM or query approach, whether caching is needed, test framework and test approach, package manager and workspace layout, libraries already in use, and anything the brief explicitly asks for or forbids. If everything fits, say so in one line.

4. **Wait for my answers.** Then, in two approvals:

   **4a. Solution outline.** Write the Solution outline section of FEATURES.md and show it to me:
   - the domain model: main entities, their key rules and relationships
   - how a request flows: endpoint, validation, handler, domain, persistence, response
   - where cross-cutting concerns live: errors, logging, correlation ID, validation
   - project and folder structure, after any fit-check overrides
   - the main variation points the brief signals, if any
   Keep it to about 15 lines. Wait for my approval or changes.

   **4b. Feature plan.**
   - F00 Foundation is always first. Estimate 25 minutes at most, only what the features will use.
     - New repo: `.gitignore` first (`node_modules/`, `dist/`, `coverage/`, `.env`), `.nvmrc`, root `package.json` with workspaces and a `verify` script (format check, lint, typecheck, test, build), `tsconfig.base.json`, ESLint and Prettier config, Vitest. Server: `app.ts` and `server.ts`, zod-validated config, pino logging with redaction, correlation ID, global error handler returning problem+json, process-level fatal handlers, graceful shutdown, `/health` and `/health/ready`, OpenAPI with Scalar. Web (if in scope): Vite React app with TanStack Query and a root error boundary. One passing test per app: an `inject()` test against `/health`, and a component render test.
     - Existing repo: characterisation tests around the code the features will change, plus only the missing cross-cutting pieces I approve.
   - Then fill FEATURES.md: brief summary, assumptions, features in build order with priority (Must/Stretch), an estimate in minutes, testable acceptance criteria including unhappy paths, and tasks of about 20 minutes each. Ask me how much time I have for this piece of work, and size the Must features to fit in about half of it, leaving the rest for review, hardening and docs. Hardening (validation, error handling, logging, health) is either inside each feature's criteria or its own feature.
   - Record each approved override from the fit check as a decision in FEATURES.md, and update the relevant section of CLAUDE.md so later tasks follow it.
   - Append to PROCESS-LOG.md: START, READ, one DECISION per approved override, one ASSUME per assumption, one PLAN.
   - Show me the feature list for approval. Wait.

5. After I approve, commit on main: `chore: plan and AI workflow setup`, including CLAUDE.md, DEFAULTS.md, .claude/, FEATURES.md and PROCESS-LOG.md. Push. If the brief came with its own CLAUDE.md or README, merge ours into theirs rather than overwriting.

Write no production code in this command.
