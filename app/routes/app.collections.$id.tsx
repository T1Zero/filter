import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Card,
  Button,
  Banner,
  Text,
  BlockStack,
  InlineStack,
  Tag,
  Badge,
  EmptyState,
  Box,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  gidFromNumericCollectionId,
  loadCollectionDetail,
  saveCollectionAnalysis,
} from "../lib/shopify-data.server";
import { analyzeCollection } from "../lib/gemini.server";
import type { CollectionAnalysis } from "../lib/gemini.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const detail = await loadCollectionDetail(admin, params.id!);
  if (!detail) {
    throw new Response("Collection not found", { status: 404 });
  }
  return { detail };
};

type ActionResult =
  | { ok: true; intent: "analyze"; analysis: CollectionAnalysis }
  | { ok: true; intent: "save"; saved: true }
  | { ok: false; error: string };

export const action = async ({
  request,
  params,
}: ActionFunctionArgs): Promise<ActionResult> => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "analyze") {
    const detail = await loadCollectionDetail(admin, params.id!);
    if (!detail) return { ok: false, error: "Collection not found" };
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        error:
          "GEMINI_API_KEY is not set. Add it to your .env file and restart the dev server.",
      };
    }
    try {
      const analysis = await analyzeCollection(
        apiKey,
        detail.title,
        detail.products,
      );
      return { ok: true, intent: "analyze", analysis };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  if (intent === "save") {
    const payload = form.get("analysis");
    if (typeof payload !== "string") {
      return { ok: false, error: "Missing analysis payload" };
    }
    let analysis: CollectionAnalysis;
    try {
      analysis = JSON.parse(payload);
    } catch {
      return { ok: false, error: "Invalid analysis payload" };
    }
    const collectionGid = gidFromNumericCollectionId(params.id!);
    const { errors } = await saveCollectionAnalysis(
      admin,
      collectionGid,
      analysis,
    );
    if (errors.length) {
      return { ok: false, error: errors.join("; ") };
    }
    return { ok: true, intent: "save", saved: true };
  }

  return { ok: false, error: `Unknown intent: ${intent}` };
};

export default function CollectionDetail() {
  const { detail } = useLoaderData<typeof loader>();
  const analyzeFetcher = useFetcher<ActionResult>();
  const saveFetcher = useFetcher<ActionResult>();

  const analyzing =
    analyzeFetcher.state !== "idle" &&
    analyzeFetcher.formData?.get("intent") === "analyze";
  const saving =
    saveFetcher.state !== "idle" &&
    saveFetcher.formData?.get("intent") === "save";

  // Show fresh analysis if available, else existing facets.
  const freshAnalysis: CollectionAnalysis | null =
    analyzeFetcher.data?.ok && analyzeFetcher.data.intent === "analyze"
      ? analyzeFetcher.data.analysis
      : null;

  const facetsToShow = freshAnalysis?.facets ?? detail.existingFacets;
  const justSaved =
    saveFetcher.data?.ok && saveFetcher.data.intent === "save";

  const analyzeError =
    analyzeFetcher.data && !analyzeFetcher.data.ok
      ? analyzeFetcher.data.error
      : null;
  const saveError =
    saveFetcher.data && !saveFetcher.data.ok ? saveFetcher.data.error : null;

  const handleAnalyze = () => {
    analyzeFetcher.submit({ intent: "analyze" }, { method: "POST" });
  };

  const handleSave = () => {
    if (!freshAnalysis) return;
    saveFetcher.submit(
      {
        intent: "save",
        analysis: JSON.stringify(freshAnalysis),
      },
      { method: "POST" },
    );
  };

  return (
    <Page
      backAction={{ content: "Collections", url: "/app" }}
      title={detail.title}
      subtitle={`${detail.products.length} products`}
    >
      <TitleBar title={detail.title} />
      <BlockStack gap="400">
        {analyzeError && (
          <Banner tone="critical" title="Analysis failed">
            <p>{analyzeError}</p>
          </Banner>
        )}
        {saveError && (
          <Banner tone="critical" title="Save failed">
            <p>{saveError}</p>
          </Banner>
        )}
        {justSaved && (
          <Banner tone="success" title="Filters saved">
            <p>
              Facets are now stored on the collection and each analyzed product.
              Add the AI Filters block to your collection template to display
              them on the storefront.
            </p>
          </Banner>
        )}

        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  AI-generated filters
                </Text>
                <Text as="p" tone="subdued">
                  Gemini reads your products and picks the filters shoppers of
                  this collection would actually use.
                </Text>
              </BlockStack>
              <InlineStack gap="200">
                <Button onClick={handleAnalyze} loading={analyzing} variant="primary">
                  {detail.existingFacets.length || freshAnalysis
                    ? "Re-analyze"
                    : "Analyze with AI"}
                </Button>
                {freshAnalysis && (
                  <Button
                    onClick={handleSave}
                    loading={saving}
                    disabled={!freshAnalysis}
                  >
                    Save to store
                  </Button>
                )}
              </InlineStack>
            </InlineStack>

            {detail.products.length === 0 && (
              <EmptyState heading="No products in this collection" image="">
                <p>Add some products to the collection, then come back here.</p>
              </EmptyState>
            )}

            {facetsToShow.length === 0 && detail.products.length > 0 && (
              <Text as="p" tone="subdued">
                No filters yet. Click "Analyze with AI" to generate them.
              </Text>
            )}

            {facetsToShow.length > 0 && (
              <BlockStack gap="300">
                {freshAnalysis && (
                  <Badge tone="info">Preview — not saved yet</Badge>
                )}
                {facetsToShow.map((facet) => (
                  <Box
                    key={facet.key}
                    background="bg-surface-secondary"
                    padding="300"
                    borderRadius="200"
                  >
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm">
                        {facet.label}{" "}
                        <Text as="span" tone="subdued" variant="bodySm">
                          ({facet.key})
                        </Text>
                      </Text>
                      <InlineStack gap="100" wrap>
                        {facet.values.map((v) => (
                          <Tag key={v}>{v}</Tag>
                        ))}
                      </InlineStack>
                    </BlockStack>
                  </Box>
                ))}
              </BlockStack>
            )}
          </BlockStack>
        </Card>

        {freshAnalysis && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Per-product preview
              </Text>
              <Text as="p" tone="subdued">
                First {Math.min(10, freshAnalysis.products.length)} of{" "}
                {freshAnalysis.products.length} products with assigned values.
              </Text>
              <Divider />
              {freshAnalysis.products.slice(0, 10).map((p) => {
                const product = detail.products.find((dp) => dp.id === p.productId);
                if (!product) return null;
                return (
                  <Box key={p.productId} paddingBlockEnd="200">
                    <BlockStack gap="100">
                      <Text as="span" fontWeight="semibold">
                        {product.title}
                      </Text>
                      <InlineStack gap="200" wrap>
                        {Object.entries(p.values).map(([k, vals]) => (
                          <Text as="span" key={k} variant="bodySm" tone="subdued">
                            {k}: {vals.join(", ")}
                          </Text>
                        ))}
                      </InlineStack>
                    </BlockStack>
                  </Box>
                );
              })}
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
