import { getShopifyClient, ShopifyApiError, type ShopifyClient } from './client.js';
import {
  applyProductUpdateResults,
  isValidSalePriceDiscountPercentage,
  MAXIMUM_SALE_PRICE_DISCOUNT_PERCENTAGE,
  MINIMUM_SALE_PRICE,
  MINIMUM_SALE_PRICE_DISCOUNT_PERCENTAGE,
  prepareSalePriceUpdate,
  SALE_PRICE_TARGET_STATUS,
  type SalePriceInputRow,
  type ShopifySalePriceVariant,
} from './sale-prices.logic.js';

const MAX_SALE_PRICE_ROWS = 500;
const MAX_SALE_PRICE_PRODUCTS = 500;
const METAFIELDS_SET_BATCH_SIZE = 25;
const TARGET_STATUS = SALE_PRICE_TARGET_STATUS;
const METAFIELD_NAMESPACE = 'custom';
const METAFIELD_KEY = 'attr5';

type RequestAction = 'preview' | 'update';

type RawRequestRow = Record<string, unknown>;

export type SalePriceUpdateApproval = {
  productId: string;
  compareDigest: string | null;
  salePrice: string;
};

export type SalePriceUpdateSelection = {
  mode: 'selected';
  products: SalePriceUpdateApproval[];
};

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

export function parseDiscountPercentage(
  value: unknown
): { discountPercentage: number } | { error: string } {
  if (typeof value !== 'number' || !isValidSalePriceDiscountPercentage(value)) {
    return {
      error:
        `Discount percentage must be a number between ${MINIMUM_SALE_PRICE_DISCOUNT_PERCENTAGE} and ${MAXIMUM_SALE_PRICE_DISCOUNT_PERCENTAGE}.`,
    };
  }

  return { discountPercentage: value };
}

/**
 * Validates one parent approval, the metafield digest, and the proposed price.
 * These values bind the approval to exactly what the user reviewed.
 */
export function parseUpdateSelection(
  value: unknown
): { selection: SalePriceUpdateSelection } | { error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      error:
        'Update requests must include one selected parent product.',
    };
  }

  const selection = value as {
    mode?: unknown;
    products?: unknown;
    // Kept for one-at-a-time requests from an already-open application tab.
    productId?: unknown;
    compareDigest?: unknown;
    salePrice?: unknown;
  };
  if (selection.mode !== 'selected') {
    return {
      error: 'Only explicitly selected parent product approvals are supported.',
    };
  }

  const rawProducts = Array.isArray(selection.products)
    ? selection.products
    : selection.productId !== undefined
      ? [selection]
      : null;

  if (!rawProducts || rawProducts.length === 0) {
    return {
      error: 'Select at least one Shopify parent product.',
    };
  }

  if (rawProducts.length > MAX_SALE_PRICE_PRODUCTS) {
    return {
      error: `At most ${MAX_SALE_PRICE_PRODUCTS} parent products can be approved at once.`,
    };
  }

  const products: SalePriceUpdateApproval[] = [];
  const productIds = new Set<string>();

  for (const rawProduct of rawProducts) {
    if (!rawProduct || typeof rawProduct !== 'object' || Array.isArray(rawProduct)) {
      return { error: 'Every selected parent product must be an object.' };
    }

    const product = rawProduct as {
      productId?: unknown;
      compareDigest?: unknown;
      salePrice?: unknown;
    };
    if (typeof product.productId !== 'string' || !product.productId.trim()) {
      return { error: 'Every selected parent product must include its Shopify product ID.' };
    }

    const productId = product.productId.trim();
    if (productIds.has(productId)) {
      return { error: `Shopify parent product ${productId} was selected more than once.` };
    }
    productIds.add(productId);

    if (product.compareDigest !== null && typeof product.compareDigest !== 'string') {
      return {
        error: `Selected parent product ${productId} must include its preview compare digest.`,
      };
    }

    if (
      typeof product.salePrice !== 'string'
      || !/^\d+\.\d{2}$/.test(product.salePrice.trim())
    ) {
      return {
        error: `Selected parent product ${productId} must include a price with exactly two decimal places.`,
      };
    }

    const salePrice = Number(product.salePrice);
    if (!Number.isFinite(salePrice) || salePrice < MINIMUM_SALE_PRICE) {
      return {
        error: `Selected parent product ${productId} must have a price of at least €${MINIMUM_SALE_PRICE.toFixed(2)}.`,
      };
    }

    products.push({
      productId,
      compareDigest: product.compareDigest,
      salePrice: salePrice.toFixed(2),
    });
  }

  return {
    selection: {
      mode: 'selected',
      products,
    },
  };
}

function stringOrNumberOrNull(value: unknown): string | number | null {
  return typeof value === 'string' || typeof value === 'number' || value === null
    ? value
    : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
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
    country: stringOrNull(row.country),
    currency: stringOrNull(row.currency),
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
        `query SalePriceVariants($cursor: String, $namespace: String!, $key: String!) {
          productVariants(first: 250, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            edges {
              node {
                id
                sku
                barcode
                product {
                  id
                  title
                  salePriceMetafield: metafield(namespace: $namespace, key: $key) {
                    value
                    compareDigest
                  }
                }
              }
            }
          }
        }`,
        { cursor, namespace: METAFIELD_NAMESPACE, key: METAFIELD_KEY }
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
  products: Array<{
    productId: string;
    salePrice: string | null;
    compareDigest: string | null;
  }>
) {
  const outcomes = new Map<
    string,
    { updated: boolean; conflict?: boolean; message: string | null }
  >();

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
            compareDigest: product.compareDigest,
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
        const conflict = userErrors.some(
          (error) =>
            error.code === 'STALE_OBJECT' ||
            /compare\s*digest|stale|changed since/i.test(error.message)
        );
        for (const product of batch) {
          outcomes.set(product.productId, { updated: false, conflict, message });
        }
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

  const { action, rows, selection, discountPercentage: rawDiscountPercentage } = body as {
    action?: unknown;
    rows?: unknown;
    selection?: unknown;
    discountPercentage?: unknown;
  };
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

  let updateSelection: SalePriceUpdateSelection | null = null;
  if (action === 'update') {
    if (!hasSameOrigin(req)) {
      return sendError(res, 403, 'invalid_origin', 'Update requests must come from this application.');
    }

    const parsedSelection = parseUpdateSelection(selection);
    if ('error' in parsedSelection) {
      return sendError(res, 400, 'invalid_selection', parsedSelection.error);
    }

    updateSelection = parsedSelection.selection;
  }

  const parsedDiscountPercentage = parseDiscountPercentage(rawDiscountPercentage);
  if ('error' in parsedDiscountPercentage) {
    return sendError(
      res,
      400,
      'invalid_discount_percentage',
      parsedDiscountPercentage.error
    );
  }
  const { discountPercentage } = parsedDiscountPercentage;

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
    const preparation = prepareSalePriceUpdate(
      toInputRows(rows as RawRequestRow[]),
      variants,
      discountPercentage
    );
    const metafield = {
      namespace: METAFIELD_NAMESPACE,
      key: METAFIELD_KEY,
      definitionType: definition.type.name,
    };

    if (action === 'preview') {
      return res.status(200).json({
        action,
        targetStatus: TARGET_STATUS,
        discountPercentage,
        metafield,
        summary: preparation.summary,
        rows: preparation.rows,
        products: preparation.products,
      });
    }

    const readyProductsById = new Map(
      preparation.products
        .filter((product) => product.status === 'ready')
        .map((product) => [product.productId, product])
    );
    const staleProductIds = updateSelection!.products
      .filter((approval) => {
        const product = readyProductsById.get(approval.productId);
        return !product || product.compareDigest !== approval.compareDigest;
      })
      .map((approval) => approval.productId);

    if (staleProductIds.length > 0) {
      return res.status(409).json({
        error: 'selection_stale',
        message:
          'One or more selected parent products changed after preview. No products were updated. Review the refreshed values before approving again.',
        invalidProductIds: staleProductIds,
        action,
        targetStatus: TARGET_STATUS,
        discountPercentage,
        metafield,
        summary: preparation.summary,
        rows: preparation.rows,
        products: preparation.products,
      });
    }

    const productsToUpdate = updateSelection!.products.map((approval) => {
      const product = readyProductsById.get(approval.productId)!;
      product.minimumPriceApplied =
        product.minimumPriceApplied && approval.salePrice === product.salePrice;
      product.salePrice = approval.salePrice;
      return product;
    });
    const outcomes = await updateProductMetafields(shopify, productsToUpdate);
    const result = applyProductUpdateResults(preparation, outcomes);
    const updatedProducts = result.products.filter((product) => product.status === 'updated').length;
    const failedProducts = result.products.filter(
      (product) => product.status === 'update_failed'
    ).length;
    const conflictedProducts = result.products.filter(
      (product) => product.status === 'update_conflict'
    ).length;

    return res.status(200).json({
      action,
      targetStatus: TARGET_STATUS,
      discountPercentage,
      metafield,
      summary: {
        ...result.summary,
        updatedProducts,
        failedProducts,
        conflictedProducts,
      },
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
