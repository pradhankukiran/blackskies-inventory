import { getShopifyClient, ShopifyApiError, type ShopifyClient } from './client.js';
import {
  applyProductUpdateResults,
  prepareSalePriceUpdate,
  type SalePriceInputRow,
  type ShopifySalePriceVariant,
} from './sale-prices.logic.js';

const MAX_SALE_PRICE_ROWS = 500;
const METAFIELDS_SET_BATCH_SIZE = 25;
const TARGET_STATUS = 'ZABLO_01';
const METAFIELD_NAMESPACE = 'custom';
const METAFIELD_KEY = 'attr5';

type RequestAction = 'preview' | 'update';

type RawRequestRow = Record<string, unknown>;

type ProductMetafieldDefinitionResponse = {
  metafieldDefinitions: {
    nodes: Array<{
      id: string;
      name: string;
      type: { name: string };
    }>;
  };
};

type ProductVariantsResponse = {
  productVariants: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: Array<{ node: ShopifySalePriceVariant }>;
  };
};

type MetafieldsSetResponse = {
  metafieldsSet: {
    metafields: Array<{ id: string }>;
    userErrors: Array<{
      field: string[] | null;
      message: string;
      code: string | null;
    }>;
  };
};

function header(req: any, name: string): string | null {
  const value = req.headers?.[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === 'string' ? value : null;
}

function parseBody(body: unknown): unknown {
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function sendError(res: any, status: number, error: string, message: string) {
  return res.status(status).json({ error, message });
}

function isRequestAction(value: unknown): value is RequestAction {
  return value === 'preview' || value === 'update';
}

function stringOrNumberOrNull(value: unknown): string | number | null {
  return typeof value === 'string' || typeof value === 'number' || value === null
    ? value
    : null;
}

function toInputRows(rows: RawRequestRow[]): SalePriceInputRow[] {
  return rows.map((row) => ({
    rowNumber: typeof row.rowNumber === 'number' ? row.rowNumber : undefined,
    sku: stringOrNumberOrNull(row.sku ?? row.partner_variant_size),
    ean: stringOrNumberOrNull(row.ean),
    regularPrice: stringOrNumberOrNull(row.regularPrice ?? row.regular_price),
    statusDetail:
      typeof (row.statusDetail ?? row.status_detail) === 'string'
        ? String(row.statusDetail ?? row.status_detail)
        : null,
  }));
}

function hasSameOrigin(req: any): boolean {
  const origin = header(req, 'origin');
  if (!origin) return true;

  const requestHost = header(req, 'x-forwarded-host') ?? header(req, 'host');
  if (!requestHost) return false;

  try {
    return new URL(origin).host === requestHost.split(',')[0].trim();
  } catch {
    return false;
  }
}

async function getProductMetafieldDefinition(shopify: ShopifyClient) {
  const response = await shopify.gql<ProductMetafieldDefinitionResponse>(
    `query SalePriceMetafieldDefinition(
      $namespace: String!
      $key: String!
    ) {
      metafieldDefinitions(
        first: 1
        ownerType: PRODUCT
        namespace: $namespace
        key: $key
      ) {
        nodes {
          id
          name
          type { name }
        }
      }
    }`,
    { namespace: METAFIELD_NAMESPACE, key: METAFIELD_KEY }
  );

  return response.metafieldDefinitions.nodes[0] ?? null;
}

async function getAllVariants(
  shopify: ShopifyClient
): Promise<ShopifySalePriceVariant[]> {
  const variants: ShopifySalePriceVariant[] = [];
  let cursor: string | null = null;

  while (true) {
    const response: ProductVariantsResponse =
      await shopify.gql<ProductVariantsResponse>(
        `query SalePriceVariants($cursor: String) {
          productVariants(first: 250, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            edges {
              node {
                id
                sku
                barcode
                product { id title }
              }
            }
          }
        }`,
        { cursor }
      );

    variants.push(...response.productVariants.edges.map((edge) => edge.node));

    if (!response.productVariants.pageInfo.hasNextPage) break;
    cursor = response.productVariants.pageInfo.endCursor;
  }

  return variants;
}

function chunks<T>(values: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

async function updateProductMetafields(
  shopify: ShopifyClient,
  products: Array<{ productId: string; salePrice: string | null }>
) {
  const outcomes = new Map<string, { updated: boolean; message: string | null }>();

  for (const batch of chunks(products, METAFIELDS_SET_BATCH_SIZE)) {
    try {
      const response = await shopify.gql<MetafieldsSetResponse>(
        `mutation SetZalandoSalePrices($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields { id }
            userErrors { field message code }
          }
        }`,
        {
          // Type is deliberately omitted. Shopify applies the verified PRODUCT
          // definition for custom.attr5 instead of this endpoint guessing one.
          metafields: batch.map((product) => ({
            ownerId: product.productId,
            namespace: METAFIELD_NAMESPACE,
            key: METAFIELD_KEY,
            value: product.salePrice,
          })),
        }
      );

      const { userErrors, metafields } = response.metafieldsSet;
      if (userErrors.length > 0 || metafields.length !== batch.length) {
        const message =
          userErrors
            .map((error) =>
              error.code ? `${error.code}: ${error.message}` : error.message
            )
            .join(' ') || 'Shopify did not confirm every metafield update.';
        for (const product of batch) outcomes.set(product.productId, { updated: false, message });
        continue;
      }

      for (const product of batch) outcomes.set(product.productId, { updated: true, message: null });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Shopify rejected the metafield update.';
      for (const product of batch) outcomes.set(product.productId, { updated: false, message });
    }
  }

  return outcomes;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader?.('Allow', 'POST');
    return sendError(res, 405, 'method_not_allowed', 'Use POST for this endpoint.');
  }

  const body = parseBody(req.body);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return sendError(res, 400, 'invalid_body', 'Request body must be a JSON object.');
  }

  const { action, rows } = body as { action?: unknown; rows?: unknown };
  if (!isRequestAction(action)) {
    return sendError(res, 400, 'invalid_action', 'Action must be either "preview" or "update".');
  }

  if (!Array.isArray(rows) || rows.length === 0 || !rows.every((row) => row && typeof row === 'object' && !Array.isArray(row))) {
    return sendError(res, 400, 'invalid_rows', 'Rows must be a non-empty array of objects.');
  }

  if (rows.length > MAX_SALE_PRICE_ROWS) {
    return sendError(
      res,
      413,
      'too_many_rows',
      `At most ${MAX_SALE_PRICE_ROWS} rows can be processed at once.`
    );
  }

  if (action === 'update') {
    if (!hasSameOrigin(req)) {
      return sendError(res, 403, 'invalid_origin', 'Update requests must come from this application.');
    }
  }

  try {
    const shopify = await getShopifyClient();
    const definition = await getProductMetafieldDefinition(shopify);
    if (!definition) {
      return sendError(
        res,
        422,
        'metafield_not_configured',
        'Shopify product metafield definition custom.attr5 is required. Create or restore it before using this tool.'
      );
    }

    const variants = await getAllVariants(shopify);
    const preparation = prepareSalePriceUpdate(toInputRows(rows as RawRequestRow[]), variants);
    const metafield = {
      namespace: METAFIELD_NAMESPACE,
      key: METAFIELD_KEY,
      definitionType: definition.type.name,
    };

    if (action === 'preview') {
      return res.status(200).json({
        action,
        targetStatus: TARGET_STATUS,
        metafield,
        summary: preparation.summary,
        rows: preparation.rows,
        products: preparation.products,
      });
    }

    const readyProducts = preparation.products.filter((product) => product.status === 'ready');
    const outcomes = await updateProductMetafields(shopify, readyProducts);
    const result = applyProductUpdateResults(preparation, outcomes);
    const updatedProducts = result.products.filter((product) => product.status === 'updated').length;
    const failedProducts = result.products.filter(
      (product) => product.status === 'update_failed'
    ).length;

    return res.status(200).json({
      action,
      targetStatus: TARGET_STATUS,
      metafield,
      summary: { ...result.summary, updatedProducts, failedProducts },
      rows: result.rows,
      products: result.products,
    });
  } catch (error) {
    console.error('shopify sale-price update error', error);
    const message = error instanceof Error ? error.message : 'Unknown Shopify error';
    const status = error instanceof ShopifyApiError && error.status ? error.status : 500;
    return sendError(res, status, 'shopify_request_failed', message);
  }
}
