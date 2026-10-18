# DEFAULTS.md

Why each default in CLAUDE.md exists, how strong the reason is, and when to drop it. CLAUDE.md holds the rules. This file holds the reasoning, so the rules stay short for the AI and the reasons stay available for review.

Strength:
- **Strong**: backed by platform guidance, correctness, or the delivery rules of the repo. Override only if the brief or repo demands it.
- **Preference**: a sound choice among several good ones. Override freely for a fitting reason.

## Process

| Default | Reason | Strength | Override when |
|---|---|---|---|
| Merge each feature to main as soon as it passes; one open branch at a time | `main` is the single source of truth. Long-lived branches drift, conflict, and hide unfinished work. | Strong | Never. |
| Merge commits, never squash; no force-push, rebase or amend | The full history shows how the work was done. Squashing or rewriting erases that record. | Strong | Never. |
| Never create tags | Tags belong to the release process, not to feature work. | Strong | Never. |
| Push after every commit | Unpushed work is invisible to everyone else and lost if the machine fails. | Strong | Never. |
| One task per commit, about 20 minutes each | Small commits make the history readable and each step reviewable. Twenty minutes keeps each step small enough to review in a minute or two. | Preference | A task that can't be split without leaving a broken build. |
| FEATURES.md as the single plan, PROCESS-LOG.md as the record | One place for scope prevents drift between chat, code and docs, and lets anyone see the plan and its status. | Strong | Never. |
| Two approval gates per task: approach, then audited diff | Catches wrong direction before code is written and wrong code before it's committed. A third gate costs more time than it saves. | Preference | Trivial changes such as a typo can share one gate. |
| Done work is never unticked or rewritten; changes are new tasks or new `CR:` features | The history must show what changed and why. Unticking hides that a requirement moved, which is exactly what anyone reading the history needs to see. | Strong | Never. |
| No silent assumptions | An unapproved assumption is a requirement nobody agreed to and I can't defend. | Strong | Never. |
| Running a command approves its mechanical steps; content changes need a gate | Approving every log update and push would double the gates without adding judgement. Code, scope and rules are where judgement matters. | Preference | Never loosen it for code. |
| Provided checkers run with every verify step | If the brief ships a test harness, it's probably the definition of done. Finding a failure at the end is too late. | Strong | None. |
| Plain writing in all docs and commits | Other engineers read FEATURES.md, PROCESS-LOG.md and README.md. Specific, unpadded writing reads as considered work. Template language reads as generated. | Strong | None. |
| `.gitignore` before the first build | Committed `bin/` and `obj/` folders bloat the repo and look careless in the history. | Strong | Repo already has one. |
| Clear the AI's context after each feature | State lives in files, so nothing is lost. A fresh context costs fewer tokens and drifts less. | Preference | Mid-feature, never. |
| Solution outline approved before features; F00 Foundation first, capped at 25 minutes | Agreeing the big picture first stops each feature inventing its own structure. Building cross-cutting concerns once means every feature gets them for free. The cap stops setup from eating feature time. | Strong | Existing repo already has the foundation. F00 shrinks to characterisation tests. |
| `/review` of all branch commits required before merge | Per-task audits miss problems that only show across tasks: inconsistency, duplication, untested criteria. Independent agents haven't seen the work being produced. | Strong | F00 Foundation, where it's recommended but optional. |
| Regular progress checks against estimates, with cuts agreed early | Scope decisions are cheap early and expensive late. Comparing actuals with estimates shows drift while there's still room to act. | Preference | Very short pieces of work. |


## Structure

| Default | Reason | Strength | Override when |
|---|---|---|---|
| Follow existing conventions in an existing repo | Consistency beats personal preference in a shared codebase. Rewriting style is noise in the diff. | Strong | The brief asks for a refactor. |
| Characterisation tests before changing untested code | Without them, there's no proof a change preserved existing behaviour. | Strong | The code being changed is being deleted. |
| Organise by feature, not by technical layer | A feature's code lives together, so adding or changing one touches one folder. The same idea as vertical slices, applied to both server and web. | Preference | The repo already uses a layered layout. |
| npm workspaces with `apps/server`, `apps/web`, `packages/shared` only as needed | One install, one lockfile, shared types without publishing. Extra packages add ceremony a small scope can't repay. | Preference | The repo uses pnpm, Yarn or Nx. Use theirs. |
| Each server feature is one Fastify plugin | Fastify's encapsulation model is built for this. `app.ts` stays a short list and features stay independent. | Strong | The repo uses Express or another framework. Follow its routing pattern. |
| Cross-cutting concerns in Fastify hooks, plugins and the error handler | New features get error handling, logging and correlation without extra code. | Strong | None in practice. |
| `app.ts` builds the app, `server.ts` listens | Tests can build the app and call it with `inject()` without opening a port. | Strong | None. |
| Interfaces only at real boundaries or real variation | An interface with one implementation adds indirection without flexibility. Boundaries (database, clock, network, filesystem) need them for testing. | Strong | The brief signals multiple implementations. |
| Extract on the third duplicate, not the second | Martin Fowler's rule of three. Two similar pieces of code often turn out to differ. | Preference | The duplication is a business rule that must stay identical. Extract it immediately. |

## Node and TypeScript

| Default | Reason | Strength | Override when |
|---|---|---|---|
| Current Node Active LTS, pinned in `.nvmrc` and `engines` | Supported, stable, and everyone runs the same version. | Strong | The repo pins another version. Match it. |
| ES modules and `node:` imports | The standard module system for Node and browsers. `node:` makes built-ins unambiguous. | Strong | The repo is CommonJS. Don't convert it as a side effect. |
| `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` | Catches null, missing-index and optional-property bugs at compile time. | Strong | Existing repo with looser settings. Don't tighten it as a side effect of feature work. |
| No `any`, no non-null assertions | Both switch the type checker off exactly where it's needed. `unknown` with narrowing keeps it on. | Strong | Tests, for `!` only. |
| Named exports, no barrels | Named exports rename safely and show up in search. Barrels hide dependencies and slow tooling. | Preference | The repo uses default exports or barrels. |
| No floating promises | An unawaited promise loses its errors and its ordering. | Strong | None. |
| No synchronous I/O in request paths | Node serves every request on one thread. A sync call blocks everyone. | Strong | Startup code and scripts. |
| Injected clock | Makes time-dependent logic testable without fake timers leaking across tests. | Strong | None. |
| Environment config validated with zod at startup | Bad configuration fails before the server listens, not on the first request. | Strong | None. |
| Money as integer minor units or a decimal library | A JavaScript number can't represent most decimal fractions exactly, so sums drift. | Strong | None. |

## Server and web

| Default | Reason | Strength | Override when |
|---|---|---|---|
| Fastify over Express | Built-in schema validation, pino logging, plugin encapsulation and `inject()` for tests, with no extra packages. Express needs each of those added by hand. | Preference | The repo uses Express or the brief names a framework. |
| zod schemas through `fastify-type-provider-zod` | One definition gives runtime validation, TypeScript types and the OpenAPI document. | Preference | The repo uses TypeBox or JSON Schema. |
| React with Vite | Vite is the standard build tool for new React apps: fast dev server, simple config. | Preference | The repo uses Next.js or another framework. |
| TanStack Query for server data | Handles caching, loading, errors and refetching, which hand-rolled `useEffect` fetching gets wrong. | Strong | The repo uses another data library. |
| No `useEffect` for derived state; cleanup on every subscribing effect | Derived state in effects causes extra renders and stale values. Missing cleanup leaks connections and timers. | Strong | None. |
| Loading, empty and error states on every data view | A blank screen is the commonest UI bug, and the most visible. | Strong | None. |
| Error boundaries at root and per feature | One component's crash shouldn't take down the whole app. | Strong | None. |
| CSS Modules | Scoped styles with no runtime and no extra tooling. | Preference | The repo uses Tailwind or another approach. |

## Data access and caching

| Default | Reason | Strength | Override when |
|---|---|---|---|
| No database unless the brief needs one | Files or memory behind one module are enough for many tools, and avoid setup. | Preference | The brief needs persistence, queries or concurrency. |
| SQLite through `better-sqlite3` and Drizzle when one is needed | Zero install, real SQL, typed queries and migrations. | Preference | The brief or repo names a database, or needs real concurrency. |
| PostgreSQL in Docker with Testcontainers when SQLite won't do | Full relational behaviour and tests against the same engine as the app. | Preference | Docker isn't available. |
| Parameterised queries only | String-built SQL is how injection happens. | Strong | None. |
| Committed migrations, auto-applied in development only | The app runs on first launch for anyone who clones it. Production applies migrations as a deployment step. | Strong | The repo has its own approach. |
| Constraints and indexes in the database | Application checks can race. A unique index can't. | Strong | None. |
| Bounded list endpoints, pagination agreed at kickoff | Unbounded lists fail as data grows. The page size is a product decision, so it's asked, not assumed. | Strong | The brief defines it. |
| No caching unless the brief signals a need | Caching brings stale data and invalidation bugs. | Strong | Read-heavy data, slow dependencies or latency targets. |

## Modern TypeScript

| Default | Reason | Strength | Override when |
|---|---|---|---|
| `satisfies`, discriminated unions, `as const` over `enum` | Safer types with less code. Enums emit runtime code and behave oddly; literal unions don't. | Strong | The repo uses enums consistently. |
| Types inferred from zod schemas | One source of truth, so types and validation can't drift apart. | Strong | None. |
| No clever type gymnastics | Types are read far more often than they're written. | Strong | None. |

## API documentation

| Default | Reason | Strength | Override when |
|---|---|---|---|
| OpenAPI from route schemas, served with Scalar, development only | The document is generated from the code, so it can't drift. Exposing docs in production widens the attack surface. | Preference | The repo already uses another docs setup. |
| Full response schemas on every route | Without them, the generated document misleads its readers. | Strong | None. |
| A `.http` file per server feature | Runnable, version-controlled examples that double as a demo script. | Preference | The repo uses another request collection format. |
| Prettier and typescript-eslint strict type-checked rules | Consistent formatting keeps diffs about behaviour. Type-aware lint rules catch floating promises and unsafe `any`. | Strong for new code | The repo has its own rules. |
| No CI workflow added | Existing Actions workflows may run the repo owner's automation. Adding workflows uninvited risks interfering with it. | Strong | The brief asks for CI. |

## Errors and observability

| Default | Reason | Strength | Override when |
|---|---|---|---|
| `application/problem+json` (RFC 9457) for every error response | One consistent, standard error shape for clients. | Strong | The brief specifies another format. |
| Typed expected failures, thrown unexpected ones | Expected failures are part of the contract and belong in types. Exceptions hide control flow. | Preference, defensible | The repo throws mapped errors. Follow it. |
| One `setErrorHandler`; never catch and ignore | One place to log and shape unexpected errors. Swallowed errors hide bugs. | Strong | None. |
| Exit on unhandled rejection or uncaught exception | A process in an unknown state is worse than a restart. | Strong | None. |
| pino structured logs, redaction, correlation ID on every line | Logs stay queryable, secrets stay out, and one request's lines tie together. | Strong | None. |
| `/health` and `/health/ready` | The standard liveness and readiness split. | Strong | The brief names other endpoints. |

## Resilience

| Default | Reason | Strength | Override when |
|---|---|---|---|
| Timeout on every outbound call | A call without a timeout can hang a request forever. | Strong | No outbound calls. |
| Retries only for idempotent calls, with backoff and jitter | Retrying a non-idempotent call can duplicate its effect. | Strong | None. |
| Idempotency for retryable writes | Retries happen. Without idempotency they create duplicates. | Strong where relevant | Naturally idempotent writes. |

## Tests

| Default | Reason | Strength | Override when |
|---|---|---|---|
| Every acceptance criterion has a test | Proves the feature does what was agreed. | Strong | Untestable criteria, with the reason written down. |
| Unhappy paths first | Bugs live in edges and failures. | Strong | None. |
| Vitest | Fast, TypeScript-native, same config style as Vite. | Preference | The repo uses Jest. |
| Server tests through `app.inject()` against a real database | Tests the real pipeline without a port, and real SQL behaviour. | Strong | No HTTP layer. |
| React Testing Library, tested by what the user sees | Tests survive refactors and catch real user-facing bugs. | Strong | None. |
| Mock only at real boundaries | Mocking your own modules tests the mocks. | Strong | None. |
| `npm run verify` before every commit | Format, lint, typecheck, tests and build in one command keeps main green. | Strong | None. |
