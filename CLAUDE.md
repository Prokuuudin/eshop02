# CLAUDE.md — eshop02

## Project

`eshop02` is a production B2B e-commerce application for professional hair, beauty and nail products.

Internal repository/project name: `eshop02`.
Do not rename it.

Stack:

* Next.js
* React
* TypeScript
* Prisma
* PostgreSQL / Neon
* shadcn/ui
* Zustand
* Vercel

The application is multilingual.

## Working principles

Prefer the simplest safe solution.

Do not introduce new abstractions, dependencies, architectural layers, or infrastructure unless they solve a concrete problem.

Before changing code:

1. Inspect only the files relevant to the task.
2. Understand the existing implementation.
3. Reuse existing patterns where reasonable.
4. Avoid repository-wide investigation unless the task genuinely requires it.

Do not refactor unrelated code.

Do not fix unrelated issues unless they are critical security or data-integrity problems. Report them separately instead.

## Context and token efficiency

Keep investigation focused.

Do not read large parts of the repository preemptively.

Do not repeatedly inspect files already understood unless the implementation has changed.

Prefer targeted searches for symbols, routes, imports, types and usages over broad repository scans.

Do not produce long explanations of routine actions.

Do not repeat information already established during the current task.

If the task becomes substantially different from the original task, recommend starting a fresh session rather than accumulating unrelated context.

## Subagents

Default: work directly in the main agent.

Do NOT spawn subagents for routine tasks such as:

* localized bug fixes;
* component changes;
* small API changes;
* TypeScript errors;
* lint fixes;
* styling;
* translation/UI text changes;
* adding or modifying a small feature;
* investigating a bug with a reasonably narrow scope.

Use subagents only when independent parallel investigation provides clear value.

Examples:

* repository-wide security audit;
* large architectural analysis;
* several genuinely independent subsystems;
* complex root-cause investigation with multiple plausible areas;
* large refactoring impact analysis.

Do not use subagents merely to verify work that can be verified directly.

If subagents are useful, use the minimum number necessary.

Prefer specialized, narrowly scoped subagent prompts over `general-purpose`.

## Planning

Do not create an extensive implementation plan for small or obvious tasks.

For small tasks:
inspect → implement → verify.

Use a written plan when:

* multiple subsystems are affected;
* database/schema changes are involved;
* authentication/security architecture changes;
* ERP synchronization changes;
* payment logic changes;
* migration or destructive operations are involved;
* implementation has significant architectural choices.

Do not brainstorm when the requested implementation is already clear.

## Git / worktrees

Do not create a Git worktree for routine fixes or small features.

Use a worktree only when isolation is genuinely useful for a substantial branch of work.

Do not create unnecessary branches, commits, or worktrees merely as part of a generic workflow.

Never perform destructive Git operations unless explicitly requested.

## Verification

Verification is required, but it should be proportional to the change.

### Small/local change

Run only relevant checks:

* TypeScript for affected code where practical;
* lint for changed files;
* relevant unit tests.

Do not run a full repository audit.

### Medium change

Run:

* relevant tests;
* TypeScript;
* lint where appropriate.

### High-risk or release-level change

For changes involving:

* authentication;
* authorization;
* payments;
* checkout;
* database schema;
* ERP synchronization;
* inventory;
* pricing;
* security;
* deployment configuration;

perform broader verification appropriate to the affected system.

Run a full production build when the change can affect build/runtime behavior or before declaring a major workstream complete.

Do not repeatedly run the same expensive checks when nothing relevant has changed since the previous successful run.

## Security

Treat security findings seriously, but distinguish between:

* exploitable vulnerability;
* architectural weakness;
* defense-in-depth improvement;
* code-quality issue.

Do not label something critical without explaining a realistic attack or failure path.

Never weaken existing authentication, authorization, CSRF protection, rate limiting, validation, security headers, payment verification or data protection to simplify implementation.

Server-side authorization is authoritative. UI restrictions alone are never considered security controls.

## Money

Never use floating-point arithmetic for monetary calculations.

Preserve the project's Decimal/integer-safe money handling.

Do not expose restricted B2B prices through public API responses, metadata, JSON-LD, server-rendered HTML or other unauthenticated surfaces.

## Authentication

Authentication and authorization must be enforced server-side.

A UI guard or modal is not sufficient.

Onboarding or forced-password-change users must not automatically receive unrestricted access to protected operations.

Do not change authentication/session semantics without tracing affected server APIs.

## ERP / synchronization

The external ERP/live database is the authoritative source for ERP-owned data unless explicitly defined otherwise.

Do not invent synchronization behavior.

Before changing sync logic, identify:

* source of truth;
* field ownership;
* direction of synchronization;
* conflict behavior;
* idempotency requirements;
* stock consistency implications;
* failure/retry behavior.

Never assume last-write-wins is safe.

Do not enable production synchronization or write-back without explicit instruction and appropriate safeguards.

Do not use placeholder stock values as real inventory.

## Database

Do not make destructive schema or data changes without explicit approval.

For migrations:

1. explain what changes;
2. identify compatibility/data risks;
3. preserve rollback or recovery options where practical;
4. verify the migration before treating it as production-ready.

Do not run production migrations merely to test an idea.

## Dependencies

Do not install a new dependency when the task can reasonably be solved with the existing stack.

Before adding one, explain:

* why it is needed;
* why existing dependencies are insufficient;
* maintenance/security implications if material.

## Scope control

When given a task, first determine its actual scope.

Do not turn:
"fix this bug"

into:
"audit and redesign this subsystem."

If you discover adjacent problems:

1. finish the requested task;
2. report the additional findings;
3. do not implement unrelated changes without permission.

Exception: stop and report immediately if continuing would risk security, production data, payments, or irreversible damage.

## Completion report

At the end of a task, keep the report concise.

Report:

1. what was changed;
2. important files affected;
3. verification performed and result;
4. unresolved risks or decisions, if any.

Do not provide a long narrative of every action performed.

Do not claim success unless the relevant verification actually passed.

## Default workflow

For normal tasks use:

UNDERSTAND
→ inspect relevant code

IMPLEMENT
→ make the smallest correct change

VERIFY
→ run targeted checks

REPORT
→ concise result

Do not automatically expand this into:

brainstorm
→ multiple subagents
→ extensive plan
→ worktree
→ implementation
→ multiple verification agents
→ repository-wide review

unless the complexity or risk of the task actually justifies it.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
