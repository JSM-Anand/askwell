# Plan

The build order for Askwell. `docs/project.md` describes each feature in detail.

## Rules

- Build phases in this order. Don't add, remove, or reorder phases.
- Every phase after Phase 0 has two parallel lanes, one per developer, so nobody waits.
- Each phase is one board in JSM HQ. The lead creates the board and its tasks there, with the product owner, before the phase starts. The next phase can be broken down while the current one is being built.
- Tasks and their status live only in JSM HQ. This file never lists tasks.
- A phase is done when all its tasks are merged and its "Done when" checks pass on the latest Vercel preview. Production goes live only once, in Phase 6.
- Each phase lists the keys it needs. When an agent reaches a step that needs one, it stops and asks (see `CLAUDE.md`), and the product owner adds it. Agents never create accounts or handle raw keys in chat.
- Keep JSM HQ's "Export plan to docs/plan.md" off. It would overwrite this file.

---

## Phase 0 — Setup

**Goal:** an empty app that builds and deploys. This is the only phase with one lane, because everything else builds on it.

**Lanes:** one. The lead plans it like any other phase, and gives every task to one developer.

**Keys needed:** none at the start. The product owner connects Vercel during this phase, before its last task: imports the repo (automatic promotion off), allows `*.vercel.app` in each developer's sandbox, and adds `VERCEL_AUTOMATION_BYPASS_SECRET` to each developer's env file (Vercel → Deployment Protection → Protection Bypass for Automation). The lead plans the Vercel check as the last task.

| Includes                                                                  | project.md |
| ------------------------------------------------------------------------- | ---------- |
| Monorepo with `apps/web`, `apps/widget`, `packages/shared`, `packages/db` | §10        |
| Next.js app with TypeScript and Tailwind                                  | §3         |
| Vercel project: a preview per PR, production from `main` (automatic promotion off) | §3, §4 |
| `.env.example` with every variable                                        | §11        |

**Done when:** a PR gets a Vercel preview URL, and the home page loads on it.


---

## Phase 1 — Foundation

**Goal:** the shared contract, the database, sign-in, and the public face of the app.

**Keys needed:** the Supabase dev project (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`), the Supabase MCP connected to each developer and scoped to the dev project, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and Clerk set up as a third-party auth provider in Supabase

| Lane                        | Includes                                                                                                                                                | project.md |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **A — Contract + database** | Supabase migrations for all tables, pgvector, RLS policies and grants, the owner and service clients, generated types. Shared types for every API route. Plan limits.           | §5, §7, §8 |
| **B — Auth + shells**       | Clerk sign in / sign up, middleware, `accounts` row on first sign-in, empty dashboard layout with navigation, landing page (static, no live widget yet) | §6.1, §6.2, §13 |

**Done when:** migrations run on dev; a new user signs up and lands on an empty dashboard; the landing page is live.


---

## Phase 2 — Projects + widget

**Goal:** an owner can create a project and see the widget on any website. Replies are fake for now.

**Keys needed:** `NEXT_PUBLIC_APP_URL` (no new services)

| Lane             | Includes                                                                                                    | project.md     |
| ---------------- | ----------------------------------------------------------------------------------------------------------- | -------------- |
| **A — Projects** | Projects CRUD + Free/Pro limit, `public_key`, default widget config, Install page, `GET /api/widget/config` | §6.3, §6.9, §8 |
| **B — Widget**   | Loader script (button, iframe, `postMessage`), `/embed` panel UI with mock replies, visitor ID              | §6.5           |

**Done when:** create a project → copy the snippet → a plain HTML page on another origin shows the button → the panel opens and shows a mock reply.


---

## Phase 3 — Knowledge + chat

**Goal:** the bot answers real questions from the owner's documents.

**Keys needed:** `OPENAI_API_KEY`, `ARCJET_KEY` (the `knowledge` Storage bucket is created by a migration)

| Lane              | Includes                                                                                                                              | project.md |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **A — Knowledge** | Paste text + upload PDF/MD/TXT straight to Supabase Storage with signed URLs, text extraction, chunking, embeddings, Knowledge page with source status, delete, file limit | §6.4       |
| **B — Chat**      | Arcjet rate limit + prompt injection detection, `POST /api/widget/chat`: quota, retrieval, answer, save, count. Connect the `/embed` panel to it.                         | §6.6       |

Lane B tests retrieval with seeded chunks until Lane A is merged.

**Done when:** upload a PDF → ask about it on the plain HTML page → correct answer; an unrelated question → "I don't know"; the 21st message in a minute is refused.


---

## Phase 4 — Conversations + analytics

**Goal:** the owner sees what visitors ask, and we see how the product is used.

**Keys needed:** `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`. The wizard needs a browser sign-in, so the product owner runs it in the developer's sandbox (HQ's Bash tab). The developer then reviews its changes and builds the rest of the lane.

| Lane                          | Includes                                                                                             | project.md  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- | ----------- |
| **A — Conversations + usage** | Conversations list + thread, usage display per project                                               | §6.7, §6.12 |
| **B — Analytics**             | PostHog wizard, product events, funnel, session replay, error tracking, AI tracing in the chat route | §6.11       |

**Done when:** a widget chat appears in Conversations after refresh; the usage count goes up; PostHog shows the events and an AI trace with its cost.


---

## Phase 5 — Billing + customize

**Goal:** Free vs Pro works end to end.

**Keys needed:** `CLERK_WEBHOOK_SIGNING_SECRET`. In the Clerk dashboard: Billing on with the Clerk payment gateway (test mode), plans `free` and `pro`, and a webhook to `/api/clerk/webhook` with the subscription events.

| Lane              | Includes                                                                                                                       | project.md |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| **A — Billing**   | Clerk webhook → `accounts.plan`, billing page with Clerk's pricing table and account portal | §6.10      |
| **B — Customize** | Customize page with live preview, `PATCH /api/projects/:id/config` with 402 for Free, plan-applied config in the widget, badge | §6.8       |

Lane B builds the 402 path first, then tests Pro by setting `accounts.plan` by hand until Lane A is merged.

**Done when:** Free save → 402 → upgrade with a test card → save works → the widget shows the new color on reload.


---

## Phase 6 — Harden + launch

**Goal:** the core flow works on `main`, with no open security issues.

**Keys needed:** `LANDING_WIDGET_KEY` (the public key of a project about Askwell itself, created in the app). At the end, the product owner creates the Supabase prod project and sets Vercel's production variables.

| Lane             | Includes                                                                                                    | project.md |
| ---------------- | ----------------------------------------------------------------------------------------------------------- | ---------- |
| **A — Security** | Fix open review findings, security headers (`frame-ancestors`), CORS check, final pass on every rule in §9  | §9         |
| **B — Launch**   | Landing page runs the app's own widget, responsive and empty-state polish, run the full core flow on `main` | §2, §6.1   |

**Done when:** the product owner creates the Supabase prod project, applies every migration to it, sets Vercel's production variables and promotes the build; then all nine steps of the core flow (§2) pass on the production URL.

