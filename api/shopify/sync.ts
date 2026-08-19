// Vercel serverless function: pulls inventory + variants from Shopify
// using client_credentials grant, returns data shaped for the existing
// internalStockProcessor and skuEanProcessor in the React app.

import { getShopifyClient } from './client.js';

const DEFAULT_LOCATION_NAME = 'Lager';

export default async function handler(_req: any, res: any) {
  const locationName = process.env.SHOPIFY_LOCATION_NAME || DEFAULT_LOCATION_NAME;

  try {
    const shopify = await getShopifyClient();

    // 1. Find the target location by name
    const locationsResp = await shopify.gql<any>(
      `query Locations { locations(first: 25) { edges { node { id name } } } }`
    );

    const lager = locationsResp.locations.edges
      .map((e: any) => e.node)
      .find((l: any) => l.name === locationName);

    if (!lager) {
      return res.status(404).json({
        error: `Location "${locationName}" not found in Shopify`,
        availableLocations: locationsResp.locations.edges.map(
          (e: any) => e.node.name
        ),
      });
    }

    // 2. Paginate productVariants pulling sku, barcode, title, available qty at the location
    type Variant = { sku: string; barcode: string | null; title: string; available: number };
    const variants: Variant[] = [];
    let cursor: string | null = null;

    while (true) {
      const variantsResp = await shopify.gql<any>(
        `query Variants($cursor: String, $locationId: ID!) {
          productVariants(first: 100, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            edges {
              node {
                sku
                barcode
                product { title }
                inventoryItem {
                  inventoryLevel(locationId: $locationId) {
                    quantities(names: ["available"]) { name quantity }
                  }
                }
              }
            }
          }
        }`,
        { cursor, locationId: lager.id }
      );

      for (const edge of variantsResp.productVariants.edges) {
        const v = edge.node;
        const sku = v.sku ? String(v.sku).trim() : '';
        if (!sku) continue;
        const qty =
          v.inventoryItem?.inventoryLevel?.quantities?.find(
            (q: any) => q.name === 'available'
          )?.quantity ?? 0;
        variants.push({
          sku,
          barcode: v.barcode || null,
          title: v.product?.title ?? '',
          available: qty,
        });
      }

      if (!variantsResp.productVariants.pageInfo.hasNextPage) break;
      cursor = variantsResp.productVariants.pageInfo.endCursor;
    }

    // Shape data for the existing parsers
    const internal = variants.map((v) => ({
      SKU: v.sku,
      Title: v.title,
      Lager: v.available,
    }));
    const skuEanMapper = variants
      .filter((v) => v.barcode)
      .map((v) => ({ SKU: v.sku, EAN: v.barcode! }));

    return res.status(200).json({
      syncedAt: new Date().toISOString(),
      locationName,
      counts: { internal: internal.length, skuEanMapper: skuEanMapper.length },
      internal,
      skuEanMapper,
    });
  } catch (err: any) {
    console.error('shopify sync error', err);
    return res.status(500).json({ error: err?.message || 'Unknown error' });
  }
}
