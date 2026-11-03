# Launch check: core flow on production

Run on 2026-11-03 against **https://askwell-lilac.vercel.app**, in headless Chromium, with a throwaway Clerk test user. The database is shared with the product owner's real account (decision of the product owner), so my test only created, changed and deleted its own rows (the product owner's own account is shown separately in section 4, and was changed by their own actions, not by this test); they are deleted (section 5).

**Result: eight of the nine §2 steps pass; step 3 is partial.** Step 3 passes except for the sign-up form itself, which this run did not exercise (Clerk's bot protection blocks it in the sandbox, so I signed in with a ticket): the product owner should sign up once by hand. Step 8 failed at first because of Clerk endpoint and signing-secret configuration, and passed once the product owner fixed it (section 3). The server events reached PostHog (section 4).

## 1. What was running

| | |
|---|---|
| Production deployments (all commit `0128baa`, merge of #56, includes #55) | `dpl_CQGYk318…` created 06:45:15 UTC, current until 07:16: served steps 3 to 7 and the first payment (07:00 to 07:05 UTC). `dpl_BZL8S8JG…` created 07:16:06, after `LANDING_WIDGET_KEY` was set (07:14:59): served steps 1 and 2. `dpl_26md6Nu7…` created 07:23:22, after the last variable change (`CLERK_WEBHOOK_SIGNING_SECRET`, 07:23:06): served the replay, step 9, cancel, end and the fresh upgrade (07:33 onward). All three have the same code; the variable changes between them only affect the landing widget (step 1 and 2) and the webhook (step 8). |
| Production variables (names and targets, read through the Vercel API) | `LANDING_WIDGET_KEY` [production], `NEXT_PUBLIC_APP_URL` [preview, production], `GEMINI_API_KEY`, `ARCJET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `CLERK_SECRET_KEY` and the Supabase variables [production, preview]; `OPENAI_API_KEY` is gone |
| Database | The dev Supabase project (the product owner's decision: production and dev share it) |
| Sign-in | Clerk sign-in **ticket** (not the sign-up form: Clerk's bot protection blocks the form in the sandbox). Used for every signed-in step: 3 to 9. |

## 2. The nine §2 steps

| # | Step | Result | Evidence |
|---|---|---|---|
| 1 | Open the landing page; the widget is in the corner | **Pass** | Real widget button "Ask us" in the corner at 1280 and 375 px, no overflow with the panel open. The demo section says "Open the chat button in the corner…". Run as a visitor, after the deployment above. |
| 2 | Ask it a product question | **Pass** | "How much is Pro?" → "Pro costs $19 per month." "What is the capital of France?" → "I don't know. I can only help with questions about the product." (uses 2 messages of the landing project's monthly quota) |
| 3 | Sign up, create a project, upload a product PDF | **Partial**: the sign-up form was not exercised; the rest passed (signed in by ticket) | Signed in, created the project in the dashboard (public key shown), uploaded a one-page PDF on the Knowledge page: source reached **Ready**. |
| 4 | Copy the script tag from Install, paste it in a plain HTML page; the widget appears | **Pass** | The Install page showed `<script src="https://askwell-lilac.vercel.app/widget.js" data-key="pk_…" defer>`. Pasted into a plain HTML page served from `http://localhost:8080` (another origin): the button appeared. |
| 5 | Ask a question there; the answer comes from the PDF | **Pass** | "What is the signature blend called and how much is it?" → "Our signature blend is called Midnight Ember and costs 14 euros per bag." An unrelated question → "I don't know…". |
| 6 | Open Conversations; the chat is there | **Pass** | The conversation (4 messages) was listed, and its thread showed the question and the answer. |
| 7 | Open Customize; paywall | **Pass** | On Free: the form is locked and shows "Customize is a Pro feature. Upgrade to Pro". |
| 8 | Upgrade to Pro with a Clerk test card; Customize unlocks | **Pass, after a configuration fix** | See section 3. |
| 9 | Change the button color; reload the HTML page; the new color shows | **Pass** | Customize unlocked on Pro; saved `#ff0000`; reloading the plain HTML page showed the button as `rgb(255, 0, 0)`. |

## 3. Step 8 in detail (the production webhook)

| Time (UTC) | What happened |
|---|---|
| 07:02:28 | Test user paid in Clerk's checkout drawer with "Pay with test card" (dev gateway, Visa 4242, $19): "Payment was successful". Clerk showed an active Pro item. |
| 07:02 to 07:05 | `accounts.plan` stayed `free`; the Billing page went from "Updating your plan…" to its stalled message ("Your plan still shows as Free… refresh in a minute"), as designed. An unsigned POST to the production webhook returned 400, so the route and secret were live; Clerk was not delivering this event to a matching endpoint. |
| 07:23 | The product owner fixed the Clerk endpoint URL and the signing secret (`CLERK_WEBHOOK_SIGNING_SECRET` updated 07:23:06) and redeployed (07:23:22). |
| 07:33:04 | The replayed 07:02 delivery applied (PostHog `upgraded` at 07:33:04): my test user was `pro` in the database. The Billing page showed "Pro plan" and Customize unlocked (step 9 ran here). |
| 07:35:26 | Cancel at period end (Clerk API): the plan stayed `pro`, as the spec says. |
| ~07:36 | End now (Clerk API): the row went to `free` within about 20 seconds. |
| 07:37:42 | **Fresh event:** subscribed again with the test card. Clerk created the Pro item at 07:37:42; the database row was `pro` when I read it a few seconds later. |
| 07:37:59 | Ended again; the row went to `free`. |

This also confirms Clerk's 200 responses for `subscriptionItem.active` and `subscriptionItem.ended` that the product owner saw on the production endpoint, and that the webhook handles active, canceled and ended items as in §6.10.

Cause of the first failure: configuration, not code. The product owner pointed the Clerk endpoint at the production URL and set `CLERK_WEBHOOK_SIGNING_SECRET` to that endpoint's signing secret (a secret belongs to one endpoint); after that, the same code worked. I could not see Clerk's endpoint settings, so I can't say whether the old URL or the old secret was the wrong part.

## 4. Other checks

| Check | Result | Evidence |
|---|---|---|
| Security headers on production | **Pass** | `/` and `/widget.js`: `Content-Security-Policy: frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN`. `/embed`: `frame-ancestors *`, no `X-Frame-Options`. All routes: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, microphone, geolocation off), HSTS from Vercel. |
| CORS | **Pass** | `/api/widget/config` and `/widget.js` send `access-control-allow-origin: *`; `/api/projects` answers 401 with no `access-control-*` header. |
| `/embed` framed from a plain HTML page on another origin | **Pass** | Steps 4 and 5 ran through the widget's `/embed` iframe from `http://localhost:8080`. |
| PostHog (browser) | **Pass** | `/api/posthog-config` returns the public key and host; PostHog scripts and `POST /flags` load with 200 on the landing page and the dashboard; `/embed` makes no PostHog request. |
| PostHog (server events) | **Pass** | Alice queried project 704738 for my test user (UTC): `signed_up` 07:00:45, `project_created` 07:00:50 (plan free), `knowledge_added` 07:01:00 (pdf), `$ai_generation` and `first_chat` 07:01:16, `$ai_generation` 07:01:20, `upgraded` 07:33:04 (plan pro, the replay) and `upgraded` 07:37:44 (plan pro, the fresh test-card upgrade at 07:37:42, 2 seconds later). The product owner's own account also shows `upgraded` at 07:24:33. No `snippet_copied` for my user: my script clicked Copy in an automated browser, and PostHog's browser SDK drops events from automated browsers, so that client-side event is not evidence either way (Phase 4's check covered it). |

## 5. Cleanup

Deleted: the Clerk test user, its account row (which cascades to the project, chunks, conversations and messages), and the uploaded PDF (through the app's delete, so the file left Storage). Verified by query: 0 rows left for the test user, 0 files under the project's Storage prefix. This test did not touch the other two accounts in the database. Their plans changed during the same window through their owners' own actions, not through this test: the product owner's own account has an `upgraded` event at 07:24:33Z (the product owner upgraded their own account, per the lead), and a third account has one at 07:36:06Z (not mine; its owner's action).

## 6. Notes for the product owner

- **Signed-out `/dashboard`:** on this Clerk development instance, a signed-out visitor sees a plain 404 page (Clerk's protect rewrite, "dev-browser-missing") instead of a redirect to sign-in. Signed-in use is fine, and `/sign-in` works. Worth a look at launch if it confuses visitors.
- **Create project button:** greyed until a name is typed (by design). It worked for a fresh user on production.
- **Clerk checkout is in "Development mode"** ("Pay with test card"), as expected for the vercel.app launch.
- **Shared records:** the Supabase variables and `NEXT_PUBLIC_APP_URL` are single records for Preview and Production, so previews and production share the same database. `CLERK_WEBHOOK_SIGNING_SECRET` is also shared, but a Clerk signing secret belongs to one endpoint, so a preview endpoint and the production endpoint cannot both verify with it. Use the production endpoint only for live traffic.
