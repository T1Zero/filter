import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import type {
  CollectionAnalysis,
  ProductForAnalysis,
  ProposedFacet,
} from "./gemini.server";

export const METAFIELD_NAMESPACE = "ai_filters";
export const FACETS_KEY = "facets";
export const PRODUCT_VALUES_KEY = "values";

export interface CollectionSummary {
  id: string;
  numericId: string;
  title: string;
  handle: string;
  productsCount: number;
  hasFacets: boolean;
}

export interface CollectionDetail {
  id: string;
  numericId: string;
  title: string;
  handle: string;
  existingFacets: ProposedFacet[];
  products: ProductForAnalysis[];
}

export function numericIdFromGid(gid: string): string {
  const parts = gid.split("/");
  return parts[parts.length - 1];
}

export function gidFromNumericCollectionId(numericId: string): string {
  return `gid://shopify/Collection/${numericId}`;
}

export async function listCollections(
  admin: AdminApiContext,
): Promise<CollectionSummary[]> {
  const response = await admin.graphql(
    `#graphql
      query ListCollections {
        collections(first: 100, sortKey: TITLE) {
          edges {
            node {
              id
              title
              handle
              productsCount { count }
              facetsMetafield: metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${FACETS_KEY}") {
                id
              }
            }
          }
        }
      }`,
  );
  const json = (await response.json()) as {
    data: {
      collections: {
        edges: Array<{
          node: {
            id: string;
            title: string;
            handle: string;
            productsCount: { count: number };
            facetsMetafield: { id: string } | null;
          };
        }>;
      };
    };
  };

  return json.data.collections.edges.map(({ node }) => ({
    id: node.id,
    numericId: numericIdFromGid(node.id),
    title: node.title,
    handle: node.handle,
    productsCount: node.productsCount.count,
    hasFacets: !!node.facetsMetafield,
  }));
}

export async function loadCollectionDetail(
  admin: AdminApiContext,
  numericId: string,
): Promise<CollectionDetail | null> {
  const gid = gidFromNumericCollectionId(numericId);
  const response = await admin.graphql(
    `#graphql
      query CollectionDetail($id: ID!) {
        collection(id: $id) {
          id
          title
          handle
          facetsMetafield: metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${FACETS_KEY}") {
            value
          }
          products(first: 100) {
            edges {
              node {
                id
                title
                productType
                vendor
                tags
                description
                options(first: 10) {
                  name
                  values
                }
              }
            }
          }
        }
      }`,
    { variables: { id: gid } },
  );
  const json = (await response.json()) as {
    data: {
      collection: {
        id: string;
        title: string;
        handle: string;
        facetsMetafield: { value: string } | null;
        products: {
          edges: Array<{
            node: {
              id: string;
              title: string;
              productType: string | null;
              vendor: string | null;
              tags: string[];
              description: string | null;
              options: Array<{ name: string; values: string[] }>;
            };
          }>;
        };
      } | null;
    };
  };

  const c = json.data.collection;
  if (!c) return null;

  let existingFacets: ProposedFacet[] = [];
  if (c.facetsMetafield?.value) {
    try {
      const parsed = JSON.parse(c.facetsMetafield.value);
      if (Array.isArray(parsed)) existingFacets = parsed;
    } catch {
      // ignore — treat as none
    }
  }

  const products: ProductForAnalysis[] = c.products.edges.map(({ node }) => ({
    id: node.id,
    title: node.title,
    productType: node.productType,
    vendor: node.vendor,
    tags: node.tags,
    description: node.description,
    variantOptions: node.options.map((o) => ({
      name: o.name,
      values: o.values,
    })),
  }));

  return {
    id: c.id,
    numericId: numericIdFromGid(c.id),
    title: c.title,
    handle: c.handle,
    existingFacets,
    products,
  };
}

export async function saveCollectionAnalysis(
  admin: AdminApiContext,
  collectionGid: string,
  analysis: CollectionAnalysis,
): Promise<{ errors: string[] }> {
  const errors: string[] = [];

  // 1. Save facets onto the collection.
  const facetsRes = await admin.graphql(
    `#graphql
      mutation SaveFacets($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors { field message }
        }
      }`,
    {
      variables: {
        metafields: [
          {
            ownerId: collectionGid,
            namespace: METAFIELD_NAMESPACE,
            key: FACETS_KEY,
            type: "json",
            value: JSON.stringify(analysis.facets),
          },
        ],
      },
    },
  );
  const facetsJson = (await facetsRes.json()) as {
    data: { metafieldsSet: { userErrors: Array<{ message: string }> } };
  };
  for (const e of facetsJson.data.metafieldsSet.userErrors ?? []) {
    errors.push(`Collection facets: ${e.message}`);
  }

  // 2. Save per-product values in batches of 25 (metafieldsSet hard limit).
  const productMetafields = analysis.products
    .filter((p) => Object.keys(p.values).length > 0)
    .map((p) => ({
      ownerId: p.productId,
      namespace: METAFIELD_NAMESPACE,
      key: PRODUCT_VALUES_KEY,
      type: "json",
      value: JSON.stringify(p.values),
    }));

  for (let i = 0; i < productMetafields.length; i += 25) {
    const batch = productMetafields.slice(i, i + 25);
    const res = await admin.graphql(
      `#graphql
        mutation SaveProductValues($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            userErrors { field message }
          }
        }`,
      { variables: { metafields: batch } },
    );
    const json = (await res.json()) as {
      data: { metafieldsSet: { userErrors: Array<{ message: string }> } };
    };
    for (const e of json.data.metafieldsSet.userErrors ?? []) {
      errors.push(`Product values: ${e.message}`);
    }
  }

  return { errors };
}
