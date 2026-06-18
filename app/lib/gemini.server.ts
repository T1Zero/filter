import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const MODEL = "gemini-2.5-flash";

export interface ProductForAnalysis {
  id: string;
  title: string;
  productType?: string | null;
  vendor?: string | null;
  tags?: string[];
  description?: string | null;
  variantOptions?: Array<{ name: string; values: string[] }>;
}

export interface ProposedFacet {
  key: string;
  label: string;
  values: string[];
}

export interface ProductFacetValues {
  productId: string;
  values: Record<string, string[]>;
}

export interface CollectionAnalysis {
  facets: ProposedFacet[];
  products: ProductFacetValues[];
}

const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    facets: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          key: { type: SchemaType.STRING },
          label: { type: SchemaType.STRING },
          values: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
        },
        required: ["key", "label", "values"],
      },
    },
    products: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          productId: { type: SchemaType.STRING },
          values: {
            type: SchemaType.OBJECT,
            properties: {},
          },
        },
        required: ["productId", "values"],
      },
    },
  },
  required: ["facets", "products"],
};

function buildPrompt(
  collectionTitle: string,
  products: ProductForAnalysis[],
): string {
  return `You are analyzing a Shopify collection to design product filters for shoppers.

Collection: "${collectionTitle}"
Number of products: ${products.length}

Look at the products below and decide which filter facets shoppers of THIS collection would actually use.
Pick 3-6 facets. Use facet keys that fit the products (e.g. for chairs: "material", "color", "style", "room"; for lamps: "bulb_type", "finish", "style", "placement"). Do NOT force generic facets — choose what makes sense for these products.

Rules:
- "key" must be lowercase snake_case (e.g. "material", "wood_type").
- "label" is the human-facing name (e.g. "Material", "Wood Type").
- "values" is the complete list of allowed values for that facet. Use Title Case (e.g. "Solid Oak", not "solid oak").
- For each product, return its facet values keyed by the same facet keys. A value MUST be one of the facet's allowed values. If you cannot determine a value confidently, OMIT the key (don't guess).
- A product can have multiple values for a facet (e.g. a chair available in Wood + Metal); return them as an array.

PRODUCTS:
${products
  .map((p, i) =>
    [
      `[${i + 1}] id=${p.id}`,
      `title: ${p.title}`,
      p.productType ? `type: ${p.productType}` : null,
      p.vendor ? `vendor: ${p.vendor}` : null,
      p.tags && p.tags.length ? `tags: ${p.tags.join(", ")}` : null,
      p.variantOptions && p.variantOptions.length
        ? `variant options: ${p.variantOptions
            .map((o) => `${o.name}=[${o.values.join(", ")}]`)
            .join("; ")}`
        : null,
      p.description ? `description: ${p.description.slice(0, 500)}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  )
  .join("\n\n")}

Return JSON matching the response schema. Use the product ids exactly as given.`;
}

export async function analyzeCollection(
  apiKey: string,
  collectionTitle: string,
  products: ProductForAnalysis[],
): Promise<CollectionAnalysis> {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  if (products.length === 0) {
    return { facets: [], products: [] };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: responseSchema as never,
      temperature: 0.2,
      // Disable "thinking" — for structured categorization it adds latency/tokens without quality gains.
      thinkingConfig: { thinkingBudget: 0 },
    } as never,
  });

  const result = await model.generateContent(
    buildPrompt(collectionTitle, products),
  );
  const text = result.response.text();

  let parsed: CollectionAnalysis;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Gemini returned invalid JSON: ${(err as Error).message}\nBody: ${text.slice(0, 500)}`,
    );
  }

  return normalize(parsed);
}

function normalize(raw: CollectionAnalysis): CollectionAnalysis {
  const facets = (raw.facets ?? [])
    .filter((f) => f && f.key && f.label && Array.isArray(f.values))
    .map((f) => ({
      key: f.key.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
      label: f.label,
      values: Array.from(new Set(f.values.filter(Boolean))),
    }));

  const facetKeys = new Set(facets.map((f) => f.key));

  const products = (raw.products ?? [])
    .filter((p) => p && p.productId && p.values)
    .map((p) => {
      const cleaned: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(p.values)) {
        const key = k.toLowerCase().replace(/[^a-z0-9_]/g, "_");
        if (!facetKeys.has(key)) continue;
        const arr = Array.isArray(v) ? v : [v as unknown as string];
        const filtered = arr.filter((x): x is string => typeof x === "string" && !!x);
        if (filtered.length) cleaned[key] = filtered;
      }
      return { productId: p.productId, values: cleaned };
    });

  return { facets, products };
}
