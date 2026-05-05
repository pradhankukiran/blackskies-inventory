// Vercel serverless function: pulls inventory + variants from Shopify
// using client_credentials grant, returns data shaped for the existing
// internalStockProcessor and skuEanProcessor in the React app.

const API_VERSION = '2025-04';
const DEFAULT_LOCATION_NAME = 'Lager';

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(
  shop: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const res = await fetch(
    `https://${shop}.myshopify.com/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token request failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

async function gql(
  shop: string,
  token: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<any> {
  const res = await fetch(
    `https://${shop}.myshopify.com/admin/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  const data = (await res.json()) as { data?: any; errors?: any };
  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }
  return data.data;
}

export default async function handler(_req: any, res: any) {
  const shop = process.env.SHOPIFY_SHOP_DOMAIN;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  const locationName = process.env.SHOPIFY_LOCATION_NAME || DEFAULT_LOCATION_NAME;

  if (!shop || !clientId || !clientSecret) {
    return res.status(500).json({
      error:
        'Missing one of: SHOPIFY_SHOP_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET',
    });
  }

  try {
    const token = await getAccessToken(shop, clientId, clientSecret);

    // 1. Find the target location by name
    const locationsResp = await gql(
      shop,
      token,
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
      const variantsResp: any = await gql(
        shop,
        token,
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
