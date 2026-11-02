# Askwell

An AI support chat widget for any website: a Next.js app plus a small embeddable script.

## Prerequisites

- Node, the version in `.nvmrc` (`nvm use`)
- pnpm (the version is pinned in `package.json` under `packageManager`; `corepack enable` picks it up)

## Getting started

```bash
pnpm install
cp .env.example .env
pnpm dev
```

`.env` is never committed. `.env.example` stays empty: it only lists the variable names. Nothing needs a value yet. When a later phase needs one, the product owner provides it for your local `.env`, so a copied `.env` is not configured until then. The app runs at http://localhost:3000.

## Checks

Run all four before opening a PR. CI runs the same ones.

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Repo layout

```
apps/
  web/            # Next.js: landing, dashboard, /embed, /api
  widget/         # vanilla TS loader -> dist/widget.js
packages/
  shared/         # contract: types, API shapes, plan limits (today: APP_NAME only; the rest lands in Phase 1)
  db/             # generated Supabase types (types.ts) + pglite test helper (today: a placeholder; Phase 1 fills it in)
supabase/
  migrations/     # SQL migrations (Supabase CLI)
docs/
  project.md      # what we build
  plan.md         # phases
```

`supabase/` arrives in Phase 1. See `docs/project.md` for features, data model and security rules, and `CLAUDE.md` for team rules.
