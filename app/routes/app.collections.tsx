import type { LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import {
  Page,
  Card,
  IndexTable,
  Text,
  Badge,
  EmptyState,
  BlockStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { listCollections } from "../lib/shopify-data.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const collections = await listCollections(admin);
  return { collections };
};

export default function CollectionsPage() {
  const { collections } = useLoaderData<typeof loader>();

  if (collections.length === 0) {
    return (
      <Page>
        <TitleBar title="AI Filters" />
        <Card>
          <EmptyState
            heading="No collections yet"
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>
              Create a collection in your Shopify admin first, then come back to
              generate AI filters for it.
            </p>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  const rows = collections.map((c, i) => (
    <IndexTable.Row id={c.numericId} key={c.numericId} position={i}>
      <IndexTable.Cell>
        <Link to={`/app/collections/${c.numericId}`}>
          <Text as="span" fontWeight="semibold">
            {c.title}
          </Text>
        </Link>
      </IndexTable.Cell>
      <IndexTable.Cell>{c.productsCount}</IndexTable.Cell>
      <IndexTable.Cell>
        {c.hasFacets ? (
          <Badge tone="success">Filters generated</Badge>
        ) : (
          <Badge>Not analyzed</Badge>
        )}
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page>
      <TitleBar title="AI Filters" />
      <BlockStack gap="400">
        <Card padding="0">
          <IndexTable
            resourceName={{ singular: "collection", plural: "collections" }}
            itemCount={collections.length}
            headings={[
              { title: "Collection" },
              { title: "Products" },
              { title: "Status" },
            ]}
            selectable={false}
          >
            {rows}
          </IndexTable>
        </Card>
      </BlockStack>
    </Page>
  );
}
