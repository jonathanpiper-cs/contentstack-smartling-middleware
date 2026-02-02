# ⚠️ DISCLAIMER — READ THIS FIRST ⚠️

**THIS PROJECT IS A PROOF OF CONCEPT.**

- It **HAS NOT** passed any quality assurance processes.
- It **HAS NOT** been security-reviewed, load-tested, or audited.
- It **SHOULD NOT** be used in a production environment.
- Use at your own risk. No warranties, no guarantees.

**Do not deploy this to production. Treat it as experimental / demo code only.**

## What this project does

This app **automates part of the translation and localization workflow between Contentstack and Smartling**. When an entry in Contentstack is moved to a workflow stage that triggers the webhook (e.g. “Send for Translation”), the app:

1. Determines **what content changed** (draft vs published).
2. Sends **only the changed text** to **Smartling’s Machine Translation (MT)** API for each target locale.
3. Writes the **translations back into Contentstack** as localized entries and moves those entries to a **“Translation Review”** workflow stage.

So: Contentstack (workflow trigger) → this app (diff + orchestration) → Smartling (MT) → Contentstack (localized entries + workflow update).

---

## API calls and data flow

1. **Contentstack → this app**  
   Contentstack sends a **Workflow Stage Change** webhook to `POST /webhook` with `data.workflow.content_type.uid`, `data.workflow.entry.uid`, and locale.

2. **This app → Contentstack (read)**  
   The app calls **Contentstack Management API (CMA)** to fetch the **draft** entry and **Contentstack Delivery API (CDA)** to fetch the **published** entry for that content type, entry, and locale (calls are in parallel).

3. **Diff**  
   The app compares draft vs published entry (leaf-level fields only; system fields like `uid`, `_version`, `updated_at`, etc. are ignored). The result is a list of **changed fields** with their draft values. If this list is **empty**, Smartling is not called.

4. **This app → Smartling**  
   If `SMARTLING_TARGET_LOCALE_IDS` is set and the diff is non-empty, the app authenticates with Smartling (OAuth2), then calls **Smartling’s MT Router API** (synchronous) once per target locale, sending the changed string values. Smartling returns translated strings keyed by the same field paths.

5. **This app → Contentstack (write)**  
   For each target locale, the app:
   - **Localizes the entry**: `PUT` to CMA to update the entry for that locale with the translated values (and original values for non-string fields).
   - **Updates workflow**: `POST` to CMA to set the localized entry’s workflow stage to **“Translation Review”** (UID configurable via `CONTENTSTACK_TRANSLATION_REVIEW_STAGE_UID`), with a comment that includes the date and draft version.

6. **Optional callback**  
   If `SMARTLING_CALLBACK_URL` is set, the app `POST`s a summary of the translation result (and context) to that URL after each locale; this is for your own logging or integration, not a Smartling feature.

---

## Project setup

- **Runtime**: Plain Node.js (no Express or other framework). Uses built-in `http` and `fetch`.
- **Entry point**: `server.js` — loads `.env`, starts the HTTP server, and routes requests.
- **Libraries** (under `lib/`):
  - `env.js` — load and read environment variables.
  - `utils.js` — JSON responses, truncation, headers redaction, locale conversion, `fetch` wrapper.
  - `webhook.js` — parse Contentstack workflow webhook and extract content type UID, entry UID, locale.
  - `diff.js` — strip system fields and diff draft vs published (leaf values only).
  - `entryPatch.js` — convert changed fields to Smartling “items” and build Contentstack entry payload from translations.
  - `contentstack.js` — CMA/CDA requests (draft, published, localize entry, set workflow stage).
  - `smartling.js` — Smartling auth and MT Router API.
- **Configuration**: All config is via environment variables. Copy `.env.example` to `.env` and set Contentstack API key, management token, delivery token, environment, and Smartling account/user credentials; see `.env.example` for the full list.
- **Scripts**: `npm run dev` (run with `--watch`), `npm start` (run once).

---

# webhook-listener

Minimal Node.js webhook listener (no frameworks).

## Run

```bash
cp .env.example .env
# fill in Contentstack + Smartling env vars
npm run dev
```

## Endpoints

- `GET /healthz`
- `POST /webhook` (logs headers + body + parsed JSON)
  - If the payload matches a **Contentstack Workflow Stage Change** webhook, it also extracts:
    - `data.workflow.content_type.uid`
    - `data.workflow.entry.uid`
  - Then it fetches:
    - **draft** entry via **Contentstack Management API (CMA)**
    - **published** entry via **Contentstack Delivery API (CDA)**
  - Then it diffs leaf fields (published → draft) and returns `changedFields`
  - If `SMARTLING_TARGET_LOCALE_IDS` is set, it will also send the diff values to Smartling MT and log translations per locale
- `POST /smartling/callback` (optional) logs translation results if you set `SMARTLING_CALLBACK_URL` to this URL

Example:

```bash
curl -X POST http://localhost:3000/webhook \
  -H 'content-type: application/json' \
  -d '{"hello":"world"}'
```

