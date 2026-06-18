# Deploying AI Filters for free (Render + Neon)

This puts the app's backend on a free always-on host so you can install it on a real store.
The storefront filters are served by Shopify itself, so they keep working even when the free
backend is asleep — the backend only needs to wake up when you open the admin to analyze a collection.

You'll create three free accounts (no credit card): **Neon** (database), **GitHub** (code), **Render** (hosting).

---

## Stage 1 — Database (Neon)

1. Go to https://neon.tech → **Sign up** (use "Continue with GitHub" — no card).
2. Create a project (accept all defaults).
3. On the project dashboard, find **Connection string**. Copy the one that starts with
   `postgresql://...` (the default/pooled one is fine). Keep it somewhere safe — this is your
   `DATABASE_URL`.

---

## Stage 2 — Code on GitHub

1. Go to https://github.com/new → create a **new empty repository**
   (name it e.g. `shopify-ai-filters`, can be Private, do NOT add a README/.gitignore).
2. On your PC, in `C:\Users\teoma\Desktop\filter`, run (replace YOURNAME/REPO):

   ```sh
   git remote add origin https://github.com/YOURNAME/REPO.git
   git branch -M main
   git push -u origin main
   ```

   A browser window will pop up to log in to GitHub the first time — approve it.

---

## Stage 3 — Hosting (Render)

1. Go to https://render.com → **Get Started** → sign up with GitHub (no card for free web services).
2. **New +** → **Blueprint**.
3. Connect your GitHub and pick the `shopify-ai-filters` repo. Render reads `render.yaml` automatically.
4. It will ask you to fill in the secret environment variables. Enter:

   | Variable               | Value                                                                 |
   |------------------------|-----------------------------------------------------------------------|
   | `DATABASE_URL`         | the Neon connection string from Stage 1                               |
   | `GEMINI_API_KEY`       | your Google AI Studio key                                             |
   | `SHOPIFY_API_KEY`      | `de4b14ec67e34726e9af9d1f91a499e2` (your app's Client ID)            |
   | `SHOPIFY_API_SECRET`   | from Partner Dashboard → Apps → Filter → **Client credentials**       |
   | `SHOPIFY_APP_URL`      | put `https://REPLACE_ME` for now — you'll fix it in Stage 4           |

5. **Apply**. Render builds and deploys (~3-5 min). When done, it shows your app URL, e.g.
   `https://shopify-ai-filters.onrender.com`. Copy it.

---

## Stage 4 — Point Shopify at the deployed URL

1. In Render → your service → **Environment** → set `SHOPIFY_APP_URL` to your real Render URL
   (e.g. `https://shopify-ai-filters.onrender.com`). Save — it redeploys.
2. On your PC, edit `shopify.app.toml`:
   - `application_url = "https://shopify-ai-filters.onrender.com"`
   - under `[auth]`, `redirect_urls = [ "https://shopify-ai-filters.onrender.com/auth/callback" ]`
   (Claude can do this edit for you — just paste your Render URL into the chat.)
3. Push the config + theme extension to Shopify:

   ```sh
   npm run deploy
   ```

   This registers the production URL and uploads the storefront filter block to Shopify.

---

## Stage 5 — Install on a store

- **Test store first:** Partner Dashboard → Apps → Filter → **Test your app** → install on
  `testski-e9wp5idx`. Open it under the store's **Apps** menu. Analyze a collection.
- **Main store:** Partner Dashboard → Apps → Filter → **Distribution** → choose
  **Custom distribution** → generate the one-time install link for your main store's domain →
  open it → Install.
- **Storefront block:** in the store's theme editor, add the **AI Filters** section to the
  Collection template (use a duplicate/unpublished theme to preview on your live store first).

---

## Notes

- The free Render backend sleeps after ~15 min idle and takes ~30s to wake. That only affects
  opening the admin app — your shoppers' filters are unaffected.
- Free Neon has no time limit; it may auto-suspend the DB when idle and resume on next query.
- If a deploy fails, open Render → your service → **Logs** and paste the error to Claude.
