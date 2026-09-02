import { getShopifyClient, ShopifyApiError, type ShopifyClient } from './client.js';
import {
  mapBarcodeVariants,
  type ShopifyBarcodeVariant,
} from './barcodes.logic.js';

type ProductVariantsResponse = {
  productVariants: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: Array<{ node: ShopifyBarcodeVariant }>;
  };
};

function sendError(res: any, status: number, error: string, message: string) {
  return res.status(status).json({ error, message });
}

async function getAllBarcodeVariants(shopify: ShopifyClient): Promise<ShopifyBarcodeVariant[]> {
  const variants: ShopifyBarcodeVariant[] = [];
  let cursor: string | null = null;

  while (true) {
    const response: ProductVariantsResponse = await shopify.gql<ProductVariantsResponse>(
      `query BarcodeVariants($cursor: String) {
        productVariants(first: 250, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              sku
              barcode
              selectedOptions { name value }
              product { title }
            }
          }
        }
      }`,
      { cursor }
    );

    variants.push(...response.productVariants.edges.map((edge) => edge.node));

    if (!response.productVariants.pageInfo.hasNextPage) break;
    cursor = response.productVariants.pageInfo.endCursor;
    if (!cursor) {
      throw new ShopifyApiError('Shopify returned a next page without an end cursor.', 502);
    }
  }

  return variants;
}

export default async function handler(req: any, res: any) {
  res.setHeader?.('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader?.('Allow', 'GET');
    return sendError(res, 405, 'method_not_allowed', 'Use GET for this endpoint.');
  }

  try {
    const shopify = await getShopifyClient();
    const variants = await getAllBarcodeVariants(shopify);
    const rows = mapBarcodeVariants(variants);

    return res.status(200).json({
      syncedAt: new Date().toISOString(),
      count: rows.length,
      rows,
    });
  } catch (error) {
    console.error('shopify barcode sync error', error);
    const message = error instanceof Error ? error.message : 'Unknown Shopify error';
    const status = error instanceof ShopifyApiError && error.status ? error.status : 500;
    return sendError(res, status, 'shopify_request_failed', message);
  }
}
