# CLAUDE.md

Instructions for Claude Code in this repository. Read this fully before any task.

## Delivery

`main` is the single source of truth. Work isn't done until it's merged to `main`, builds and passes. Nothing important lives only on a branch or a laptop. The commit history is part of the deliverable: it shows how the work was done, not only the result.

## Sources of truth

After a `/clear`, re-read FEATURES.md and the last 15 lines of PROCESS-LOG.md before doing anything. They hold all the state.

- `FEATURES.md`: what we build. Features, tasks, acceptance criteria, status.
- `PROCESS-LOG.md`: how we worked. Append only.
- `README.md`: how to run it, assumptions, trade-offs, what's left. Written at wrap-up.
- The brief or requirements, wherever they are in the repo. If the brief and FEATURES.md disagree, stop and ask me.
- Any checker, test harness or script the brief provides (Python, shell, Docker). If one exists, it is part of every verify step alongside `npm run verify`.

## Commands

| Command | When |
|---|---|
| `/kickoff` | Once, right after the content lands |
| `/pm-drill <text>` | New requirement, change, or anything unclear |
| `/next-task` | Build the next task: one task, one commit |
| `/review` | After a feature's last task. Required before `/ship-feature` |
| `/ship-feature` | Merge a finished feature to main |
| `/feedback <text>` | When I correct you |
| `/checkpoint [minutes left]` | Progress against estimates, and a scope call |
| `/wrap-up` | To close out: freeze code, finish docs, final push |

## What wins when sources disagree

1. The brief. Explicit instructions in it override everything below.
2. The existing repo's conventions, when there is existing code.
3. Decisions I approve during the session, recorded in FEATURES.md.
4. The defaults in this file.

The Node, TypeScript, React, structure and testing rules below are defaults. DEFAULTS.md gives the reason, strength and override condition for each. /kickoff checks each against the brief and repo, and I approve any override. A new default added during the session needs a row in DEFAULTS.md too. Git rules, approval gates and the no-silent-assumptions rule are not defaults: they always apply.

## Git rules

- One feature per branch: `feature/F0X-short-name`, cut from the latest `main`.
- One task per commit. Message format: `F0X.Y: imperative summary`.
- Push after every commit, including on branches.
- Ship each feature to `main` as soon as its tasks pass, with a merge commit (never squash). Never more than one unmerged branch.
- `main` always builds and passes tests.
- Never create, move or delete tags. Never force-push. Never rewrite pushed history. Never delete branches.
- FEATURES.md and PROCESS-LOG.md changes go in the same commit as the work they describe.

## If the repo has existing code

- Read the structure, conventions and tests before writing anything. Follow existing conventions even where I'd choose differently, and note the disagreement in README instead of rewriting.
- Before changing untested existing code, add characterisation tests that pin its current behaviour.
- No mass reformatting, renaming or moving files. Diffs stay small and on-task.
- If the existing build or tests are broken at the start, log it in PROCESS-LOG.md before touching anything.

## If the repo is greenfield

```
package.json              npm workspaces, root scripts (verify, dev, test, build)
tsconfig.base.json        strict settings shared by every package
eslint.config.js          flat config with typescript-eslint
.prettierrc
.nvmrc                    the Node version
apps/
  server/
    src/
      app.ts              builds the Fastify app: plugins, error handler, logging, routes
      server.ts           starts it (the only file that listens on a port)
      features/<feature>/ routes, schemas, handler, service per use case
      shared/             config, errors, clock, cross-cutting plugins
    test/                 integration tests through app.inject()
  web/
    src/
      features/<feature>/ components, hooks, API calls per feature
      shared/             UI primitives, API client, error boundary
packages/
  shared/                 schemas and types used by both server and web
```

Organise by feature, not by technical layer. Create only the packages the brief needs: a server-only or web-only brief has one app and no `packages/shared`.

## Node and TypeScript conventions

- Node: the current Active LTS (check with `node --version`), pinned in `.nvmrc` and `engines`. In an existing repo, use its version.
- ES modules (`"type": "module"`), `node:` prefix for built-ins (`node:fs/promises`).
- TypeScript `strict`, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. No `any`: use `unknown` and narrow. No non-null assertions (`!`) outside tests.
- Named exports only. No default exports, no barrel files that re-export whole folders.
- Async with `async`/`await` everywhere. No floating promises: every promise is awaited, returned, or explicitly handled. Pass an `AbortSignal` through long-running or outbound work.
- Never block the event loop: no `fs.*Sync`, no CPU-heavy loops in request handlers.
- Inject a clock (`now: () => Date`) where time matters. Never call `Date.now()` or `new Date()` directly in business logic. Store and compare times in UTC (ISO 8601).
- Configuration from environment variables, parsed and validated with zod at startup. Bad config fails the process before it listens.
- Money is never a JavaScript `number` with fractions. Use integer minor units (cents) or a decimal library, wrapped in a small value type.
- Domain rules live in plain functions or small classes with no framework imports, so they test without a server.

## Server: Fastify

- Fastify for the HTTP server: built-in pino logging, schema validation, encapsulated plugins, and `app.inject()` for tests without a port.
- Request and response schemas in zod, through `fastify-type-provider-zod`, so validation, TypeScript types and OpenAPI come from one definition.
- `app.ts` builds and returns the app. Tests import it. Only `server.ts` calls `listen`.
- Graceful shutdown: close the server and open resources on SIGINT and SIGTERM.

## Web: React

- React with Vite and TypeScript. Function components and hooks only.
- Server data through TanStack Query: caching, loading and error states, refetching. No hand-rolled fetch-in-useEffect for server data.
- Local UI state in `useState` or `useReducer`. A global store only when two distant parts of the UI share state that isn't server data.
- Don't use `useEffect` to derive state. Compute it during render. Every effect that subscribes (timers, EventSource, sockets, listeners) returns a cleanup.
- Every view that loads data handles loading, empty and error states explicitly.
- An error boundary at the app root and around each feature.
- Accessible by default: real buttons and links, labels on inputs, alt text, keyboard reachable.
- CSS Modules for styling unless the repo already uses something else.

## Modern TypeScript

Use a modern feature when it makes the code clearer, never just because it exists. In an existing repo, stay within its TypeScript version and settings.

Use by default:
- `satisfies` to check a value against a type without widening it.
- Discriminated unions for states and results (`{ status: 'loading' } | { status: 'error', error } | ...`), with exhaustive `switch` checked by `never`.
- `as const` objects or string literal unions instead of `enum`.
- `readonly` arrays and properties for data that shouldn't change.
- Optional chaining and nullish coalescing over manual checks.
- `structuredClone` over JSON round-trips. `Object.groupBy` and `Array.prototype.toSorted` where they read better.
- Type inference from zod schemas (`z.infer`) instead of writing types twice.

Use when it fits:
- `using` declarations for resources that must be released.
- Top-level `await` in entry points and scripts.

Avoid:
- Clever type gymnastics. If a type takes more than a few seconds to read, simplify it.
- New syntax in a file that otherwise uses the old style. Consistency within a file wins.

If you're not sure a feature is supported by the target TypeScript or Node version, check by running the typecheck, don't guess.

## API documentation and manual testing

- OpenAPI generated from the zod route schemas with `@fastify/swagger`, served through Scalar (`@scalar/fastify-api-reference`). Development only.
- Every route declares a summary, its success response schema, and an error response schema for each error status it can return. The OpenAPI document must match real behaviour.
- Each server feature folder has a `<feature>.http` file with runnable requests: the happy path and the main failure cases, using a `@baseUrl` variable.
- Scalar and `.http` files are for exploring and demonstrating. Automated tests remain the proof.
- Prettier formats everything. ESLint with `typescript-eslint` (strict, type-checked rules) lints everything. In an existing repo, use its formatting and lint rules.

## Data access and caching

The brief and the existing repo decide first. These defaults apply only when neither does, and /kickoff proposes them in the fit check for my approval.

**Database**
- No database needed: none. Files or in-memory state are fine when the brief allows, behind one small module.
- No database named but one is needed: SQLite through `better-sqlite3` with Drizzle ORM. No install, no Docker, so anyone can clone and run it.
- The brief needs real concurrency, JSON querying or several services sharing data: propose PostgreSQL in Docker, with Testcontainers in tests.

**Access**
- Drizzle for schema, migrations and typed queries. Raw SQL through Drizzle's `sql` template only for queries the query builder can't express cleanly, with parameters, never string concatenation.
- Reads select only the columns returned. No loading whole rows to return three fields. No query inside a loop.

**Schema**
- Migrations generated and committed. Applied automatically at startup in development only. Note in README that production would apply them as a deployment step.
- Uniqueness and required fields enforced in the database, not only in code.
- An index for every column used in a lookup or filter.

**Lists**
- Every list endpoint is bounded. Propose pagination (page size with a maximum) at kickoff as an ambiguity, not as a silent choice.

**Caching**
- No cache by default. Add one only when the brief signals read-heavy data, an expensive external call, or a latency target. Name it in the feature's Approach, with expiry and invalidation on write.

**Seed data**
- Development-only seed data so the app has something to show. Never seeded in tests; tests arrange their own data.

## Readable code

- Names say what something is or does in the domain's language: `orderTotal`, `archiveClient`, `isWithinCoverPeriod`. No `data`, `temp`, `obj`, `mgr`, `helper`, `util`, `Process()`, or single letters outside short lambdas.
- Methods are verbs, booleans read as questions (`isArchived`, `hasExpired`), collections are plural.
- One level of abstraction per method. Extract a well-named function rather than writing a comment that explains a block.
- Short methods, early returns, no nesting deeper than two levels.
- No magic numbers or strings. Use named constants or config.
- Comments explain why, never what. Assumption references (`// A2: ...`) are the exception.
- Code should read top to bottom like the acceptance criteria it implements.

## Extensibility

Extensibility comes from structure, not from abstractions added in advance.

- Adding a feature means adding a feature folder plus one registration line. It must not require editing other features.
- On the server, each feature is one Fastify plugin (`app.register(clientRoutes, { prefix: '/clients' })`). `app.ts` stays a short list of these registrations.
- On the web, each feature owns its components, hooks and API calls. Shared UI lives in `shared/` only once two features use it.
- Cross-cutting concerns (errors, logging, correlation ID, validation) live in Fastify hooks, plugins and the error handler, so new features get them for free.
- Configuration through validated environment variables, so behaviour changes without code changes where the brief hints at it.
- Introduce an interface or strategy only where the brief signals real variation (several providers, rule sets, formats). Name that variation point in the feature's Approach.

## Errors

- Expected failures (validation, not found, conflict, business rule broken) are typed: a discriminated-union result or a small set of domain error classes. They map to 400, 404, 409 or 422 with an `application/problem+json` body (RFC 9457).
- Unexpected failures throw. One Fastify `setErrorHandler` logs them with the request ID and returns a 500 problem body with no stack trace or internals.
- Never `catch` and ignore. Never `catch (e) {}`. Catch only where you can handle or translate the error.
- `process.on('unhandledRejection')` and `uncaughtException` log at fatal level and exit, so the process manager restarts a clean process.
- In React, an error boundary catches render errors, and every query shows its error state. Never a blank screen.
- Validate every input at the boundary with zod. Reject bad input with a clear message, don't silently correct it.

## Observability

Comprehensive means every event that matters, with context. It doesn't mean logging every function.

- pino through Fastify's logger. Structured objects, never string concatenation: `log.info({ clientId }, 'client archived')`.
- Log every business event at info, with the entity ID as a field.
- Log every handled failure at warn, with the reason and the input that caused it (minus personal data).
- Log every unexpected failure once, in the error handler, at error, with the error object.
- Log every outbound call with its duration and outcome.
- Fastify's request logging for every request: method, URL, status, duration.
- A correlation ID on every request, taken from the `X-Correlation-ID` header or generated (`requestIdHeader`, `genReqId`), echoed in the response header, included in every log line and problem body.
- pino `redact` for secrets and personal fields.
- `/health` for liveness and `/health/ready` for dependencies.
- Pretty logs in development (`pino-pretty`), JSON in every other environment.

## Resilience

Only where there's an outbound dependency:
- A timeout on every outbound call (`AbortSignal.timeout`).
- Retry with exponential backoff and jitter only for idempotent calls, a small fixed number of times.
- A circuit breaker only if the dependency is called often enough for one to matter.
- Idempotency keys or natural keys for any write a client might retry.
- Optimistic concurrency (a version column) on records two people could edit at once.

## Tests

- Every acceptance criterion in FEATURES.md has at least one test, named after the behaviour.
- Unhappy paths first: invalid input, missing data, not found, duplicates, boundaries, concurrency where relevant.
- Vitest for everything.
- Server integration tests through `app.inject()`, against a real SQLite file in a temp folder or Testcontainers. Never mock the database layer you own.
- React components tested with React Testing Library, by what the user sees and does, not by implementation details.
- End-to-end tests with Playwright only if the brief asks for them.
- Don't mock what you own. Mock only at real boundaries (network, clock, filesystem when it's the subject's dependency).
- Test names read as sentences: `it('rejects an end date before the start date')`.
- `npm run verify` runs format check, lint, typecheck, tests and build. Run it before every commit. Never commit red. Run the typecheck after any multi-file change before moving on, so errors surface early.

## No silent assumptions

- You never decide a requirement, business rule, default value, error behaviour or design choice on your own.
- When something is unclear, stop and ask. Offer your recommended answer so I can approve it quickly.
- An assumption exists only after I approve it. Then it goes into FEATURES.md (Assumptions) and PROCESS-LOG.md (ASSUME).
- In code, every approved assumption that shapes behaviour is referenced by its ID in a short comment, e.g. `// A2: negative amounts rejected`.
- If you notice code relying on something nobody approved, flag it.

## Human approval

Nothing changes without my approval. There are two gates per task, and no more:

1. **Approach gate**, before any code: the approach, files, tests and risks. I approve or correct.
2. **Commit gate**, before committing: the audited diff. I approve or ask for changes.

A new feature also gets an approach, written into FEATURES.md and approved, before its first task.

When I run a command, that's my approval for its mechanical steps: updating FEATURES.md and PROCESS-LOG.md, committing them, pushing, merging. Any change to code, scope, assumptions or rules still goes through a gate.

## Working style

- A task is about 20 minutes. If it's bigger, split it and update FEATURES.md first.
- When I correct you, I'll use `/feedback`. Repeated corrections become rules in this file.

## Simplicity over abstraction

- Write the simplest code that meets the acceptance criteria and is easy to extend at the obvious seams.
- No interface with one implementation unless it's a real boundary (database, clock, HTTP, external service).
- No pattern, base class or layer the current features don't need. Duplication twice is fine. Extract on the third.
- Apply SOLID to keep modules and classes small and focused, not as a reason to add indirection.

## Writing style for docs

FEATURES.md, PROCESS-LOG.md, README.md and commit messages are read by other engineers. Write them like a careful engineer, not like a template.
- Plain, specific sentences. Vary their length. Say the concrete thing: "rejects end dates before start dates", not "robust validation".
- No filler openers, no hype words (robust, seamless, comprehensive, leverage), no summaries of what was just said.
- Few dashes. Use full stops and commas.
- Log entries: one or two sentences, facts first, then the reason.
- Record only what has happened. Never write a log entry, summary or README claim before the work it describes is done.

## Rules learned during this session

<!-- /feedback appends rules here as R1, R2... -->
