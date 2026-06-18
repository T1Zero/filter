# AI Filters — Shopify app

Custom Shopify app that uses Google Gemini to auto-generate collection-specific filter facets, then renders them on the storefront via a theme app extension.

## What it does

1. Lists your store's collections in the embedded admin UI.
2. For a collection you pick (e.g. *Chairs*), Gemini reads the products and proposes filter facets that fit those products (e.g. Material, Color, Style, Room). It also assigns per-product values.
3. You review and save. Facets get stored as a metafield on the collection; per-product values get stored as metafields on each product.
4. The theme app extension renders a filter UI on collection pages, reading from those metafields.

## One-time setup

### 1. Prerequisites

- Node.js 20.19+ (you have 24, fine).
- A free [Shopify Partner account](https://partners.shopify.com/signup).
- A development store (create one inside the Partner dashboard).
- A free [Google AI Studio API key](https://aistudio.google.com/apikey) — Gemini 2.0 Flash has a free tier of ~1,500 requests/day, plenty for this.

### 2. Configure environment

```sh
cp .env.example .env
```

Open `.env` and paste your Gemini key into `GEMINI_API_KEY=`.

### 3. Install deps (already done if you've gotten this far)

```sh
npm install
```

## Run it

```sh
npm run dev
```

The Shopify CLI will:
- Prompt you to log in to your Partner account.
- Create the app on Shopify's side and write its API key/secret into a local `.env` (merged with the Gemini key).
- Open a tunnel and give you an install URL.

Open the install URL, install the app on your dev store, and you'll land in the embedded admin. You'll see your collections listed — click one, hit **Analyze with AI**, review the proposed facets, then **Save to store**.

## Show filters on the storefront

After saving facets for at least one collection:

1. In your Shopify admin, go to **Online Store → Themes → Customize**.
2. Open the **Collection** template (or **Default collection**).
3. Click **+ Add section** and pick **AI Filters** (it appears under "App sections").
4. Drop the section above the product grid. Save.

If your theme isn't Dawn-based, you may need to adjust the **Product card CSS selector** setting in the block. The default (`li.grid__item, .product-card, .card-wrapper`) covers Dawn, Sense, Studio, Refresh, Craft.

## Files of note

- `app/lib/gemini.server.ts` — Gemini call + response schema.
- `app/lib/shopify-data.server.ts` — Admin GraphQL queries + metafield writes.
- `app/routes/app.collections.tsx` — list of collections.
- `app/routes/app.collections.$id.tsx` — analyze + save UI for one collection.
- `extensions/ai-filters/` — theme app extension (Liquid + JS + CSS).

## Costs

- Gemini 2.0 Flash free tier (no charge for typical usage).
- Shopify dev store is free.

## Known limitations

- Filtering is client-side and only filters products on the current paginated page. If your collections have hundreds of products with pagination, increase products-per-page or switch to URL-driven filters later.
- Analysis runs synchronously and can take 10–30 seconds for collections with 50+ products. The button shows a loading state.
- The first 100 products of a collection are analyzed (Admin API page size). Larger collections will need pagination — feel free to extend `loadCollectionDetail`.
