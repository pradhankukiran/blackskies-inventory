export const SALE_PRICE_DISCOUNT = 0.8;
export const MINIMUM_SALE_PRICE = 15;

export type SalePriceInputRow = {
  rowNumber?: number;
  sku?: string | number | null;
  ean?: string | number | null;
  regularPrice: string | number | null;
  /** The Zalando `status_detail` value. Only ZABLO_01 rows are eligible. */
  statusDetail?: string | null;
};

export type ShopifySalePriceVariant = {
  id: string;
  sku: string | null;
  barcode: string | null;
  product: {
    id: string;
    title: string;
    salePriceMetafield?: {
      value: string;
    } | null;
  };
};

export type SalePriceRowStatus =
  | 'ready'
  | 'invalid_price'
  | 'outside_target_status'
  | 'missing_identifier'
  | 'unmatched'
  | 'ambiguous_sku'
  | 'ambiguous_ean'
  | 'identifier_conflict'
  | 'product_price_conflict'
  | 'already_up_to_date'
  | 'updated'
  | 'update_failed';

export type SalePriceRowResult = {
  rowNumber: number;
  statusDetail: string | null;
  sku: string | null;
  ean: string | null;
  regularPrice: number | null;
  salePrice: string | null;
  currentSalePrice: string | null;
  minimumPriceApplied: boolean;
  status: SalePriceRowStatus;
  message: string | null;
  matchingMethod: 'sku' | 'ean' | 'sku_and_ean' | null;
  shopifyVariant: {
    id: string;
    sku: string | null;
    barcode: string | null;
  } | null;
  shopifyProduct: {
    id: string;
    title: string;
  } | null;
};

export type SalePriceProductStatus =
  | 'ready'
  | 'product_price_conflict'
  | 'already_up_to_date'
  | 'updated'
  | 'update_failed';

export type SalePriceProductResult = {
  productId: string;
  productTitle: string;
  salePrice: string | null;
  currentSalePrice: string | null;
  minimumPriceApplied: boolean;
  status: SalePriceProductStatus;
  message: string | null;
  sourceRowNumbers: number[];
};

export type SalePriceSummary = {
  totalRows: number;
  matchedRows: number;
  readyRows: number;
  invalidPriceRows: number;
  outsideTargetStatusRows: number;
  missingIdentifierRows: number;
  unmatchedRows: number;
  ambiguousSkuRows: number;
  ambiguousEanRows: number;
  identifierConflictRows: number;
  productPriceConflictRows: number;
  readyProducts: number;
  productPriceConflicts: number;
  minimumPriceAppliedRows: number;
  alreadyUpToDateRows: number;
  alreadyUpToDateProducts: number;
};

export type SalePricePreparation = {
  rows: SalePriceRowResult[];
  products: SalePriceProductResult[];
  summary: SalePriceSummary;
};

function text(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

export function normalizeSku(value: string | number | null | undefined): string {
  return text(value).toUpperCase();
}

export function normalizeEan(value: string | number | null | undefined): string {
  return text(value).replace(/[\s-]/g, '');
}

/**
 * Parses common European and English currency formats without accepting an
 * empty, negative, or zero price. The raw number remains the regular price;
 * the discount is rounded separately to two decimal places.
 */
export function parseRegularPrice(
  value: string | number | null | undefined
): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const input = text(value);
  if (!input) return null;

  const numeric = input.replace(/[^0-9,.-]/g, '');
  if (!numeric || /^[-.,]+$/.test(numeric)) return null;

  const lastComma = numeric.lastIndexOf(',');
  const lastDot = numeric.lastIndexOf('.');
  let normalized = numeric;

  if (lastComma >= 0 && lastDot >= 0) {
    normalized =
      lastComma > lastDot
        ? numeric.replace(/\./g, '').replace(',', '.')
        : numeric.replace(/,/g, '');
  } else if (lastComma >= 0) {
    normalized = numeric.replace(',', '.');
  }

  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function calculateSalePrice(regularPrice: number): string {
  const discountedPrice = calculateDiscountedSalePrice(regularPrice);
  return Math.max(MINIMUM_SALE_PRICE, discountedPrice).toFixed(2);
}

function calculateDiscountedSalePrice(regularPrice: number): number {
  return Math.round((regularPrice * SALE_PRICE_DISCOUNT + Number.EPSILON) * 100) / 100;
}

function containsTargetStatus(statusDetail: string): boolean {
  return statusDetail
    .split(',')
    .map((status) => status.trim().toUpperCase())
    .includes('ZABLO_01');
}

function currentMetafieldValue(variant: ShopifySalePriceVariant | null): string | null {
  const value = text(variant?.product.salePriceMetafield?.value);
  return value || null;
}

function normalizedPrice(value: string | null): string | null {
  const parsed = parseRegularPrice(value);
  return parsed === null ? null : parsed.toFixed(2);
}

function createIndex(
  variants: ShopifySalePriceVariant[],
  identifier: (variant: ShopifySalePriceVariant) => string
): Map<string, ShopifySalePriceVariant[]> {
  const index = new Map<string, ShopifySalePriceVariant[]>();

  for (const variant of variants) {
    const key = identifier(variant);
    if (!key) continue;
    const matches = index.get(key);
    if (matches) matches.push(variant);
    else index.set(key, [variant]);
  }

  return index;
}

function rowResult(
  rowNumber: number,
  statusDetail: string,
  sku: string,
  ean: string,
  regularPrice: number | null,
  salePrice: string | null,
  status: SalePriceRowStatus,
  message: string | null,
  variant: ShopifySalePriceVariant | null = null,
  matchingMethod: SalePriceRowResult['matchingMethod'] = null
): SalePriceRowResult {
  const discountedPrice =
    regularPrice === null
      ? null
      : calculateDiscountedSalePrice(regularPrice);

  return {
    rowNumber,
    statusDetail: statusDetail || null,
    sku: sku || null,
    ean: ean || null,
    regularPrice,
    salePrice,
    currentSalePrice: currentMetafieldValue(variant),
    minimumPriceApplied:
      salePrice !== null && discountedPrice !== null && discountedPrice < MINIMUM_SALE_PRICE,
    status,
    message,
    matchingMethod,
    shopifyVariant: variant
      ? { id: variant.id, sku: variant.sku, barcode: variant.barcode }
      : null,
    shopifyProduct: variant?.product ?? null,
  };
}

function createSummary(
  rows: SalePriceRowResult[],
  products: SalePriceProductResult[]
): SalePriceSummary {
  return {
    totalRows: rows.length,
    matchedRows: rows.filter((row) => row.shopifyVariant !== null).length,
    readyRows: rows.filter((row) => row.status === 'ready').length,
    invalidPriceRows: rows.filter((row) => row.status === 'invalid_price').length,
    outsideTargetStatusRows: rows.filter(
      (row) => row.status === 'outside_target_status'
    ).length,
    missingIdentifierRows: rows.filter((row) => row.status === 'missing_identifier')
      .length,
    unmatchedRows: rows.filter((row) => row.status === 'unmatched').length,
    ambiguousSkuRows: rows.filter((row) => row.status === 'ambiguous_sku').length,
    ambiguousEanRows: rows.filter((row) => row.status === 'ambiguous_ean').length,
    identifierConflictRows: rows.filter((row) => row.status === 'identifier_conflict')
      .length,
    productPriceConflictRows: rows.filter(
      (row) => row.status === 'product_price_conflict'
    ).length,
    readyProducts: products.filter((product) => product.status === 'ready').length,
    productPriceConflicts: products.filter(
      (product) => product.status === 'product_price_conflict'
    ).length,
    minimumPriceAppliedRows: rows.filter((row) => row.minimumPriceApplied).length,
    alreadyUpToDateRows: rows.filter((row) => row.status === 'already_up_to_date')
      .length,
    alreadyUpToDateProducts: products.filter(
      (product) => product.status === 'already_up_to_date'
    ).length,
  };
}

/**
 * Matches CSV rows to Shopify variants. SKU is preferred, with EAN as the
 * fallback. A row is skipped if either supplied identifier is ambiguous or
 * if SKU and EAN resolve to different Shopify variants.
 */
export function prepareSalePriceUpdate(
  inputRows: SalePriceInputRow[],
  variants: ShopifySalePriceVariant[]
): SalePricePreparation {
  const skuIndex = createIndex(variants, (variant) => normalizeSku(variant.sku));
  const eanIndex = createIndex(variants, (variant) => normalizeEan(variant.barcode));
  const rows: SalePriceRowResult[] = [];

  inputRows.forEach((input, index) => {
    const rowNumber =
      typeof input.rowNumber === 'number' &&
      Number.isSafeInteger(input.rowNumber) &&
      input.rowNumber > 0
        ? input.rowNumber
        : index + 1;
    const sku = normalizeSku(input.sku);
    const ean = normalizeEan(input.ean);
    const statusDetail = text(input.statusDetail).toUpperCase();
    const regularPrice = parseRegularPrice(input.regularPrice);

    if (!containsTargetStatus(statusDetail)) {
      rows.push(
        rowResult(
          rowNumber,
          statusDetail,
          sku,
          ean,
          regularPrice,
          null,
          'outside_target_status',
          'Only rows whose status_detail contains ZABLO_01 are eligible for this update.'
        )
      );
      return;
    }

    if (regularPrice === null) {
      rows.push(
        rowResult(
          rowNumber,
          statusDetail,
          sku,
          ean,
          null,
          null,
          'invalid_price',
          'Regular price must be a positive number.'
        )
      );
      return;
    }

    const salePrice = calculateSalePrice(regularPrice);
    if (!sku && !ean) {
      rows.push(
        rowResult(
          rowNumber,
          statusDetail,
          sku,
          ean,
          regularPrice,
          salePrice,
          'missing_identifier',
          'A SKU or EAN is required to match this row.'
        )
      );
      return;
    }

    const skuMatches = sku ? skuIndex.get(sku) ?? [] : [];
    const eanMatches = ean ? eanIndex.get(ean) ?? [] : [];

    if (skuMatches.length > 1) {
      rows.push(
        rowResult(
          rowNumber,
          statusDetail,
          sku,
          ean,
          regularPrice,
          salePrice,
          'ambiguous_sku',
          `SKU "${sku}" matches ${skuMatches.length} Shopify variants.`
        )
      );
      return;
    }

    if (eanMatches.length > 1) {
      rows.push(
        rowResult(
          rowNumber,
          statusDetail,
          sku,
          ean,
          regularPrice,
          salePrice,
          'ambiguous_ean',
          `EAN "${ean}" matches ${eanMatches.length} Shopify variants.`
        )
      );
      return;
    }

    const skuMatch = skuMatches[0] ?? null;
    const eanMatch = eanMatches[0] ?? null;

    if (skuMatch && eanMatch && skuMatch.id !== eanMatch.id) {
      rows.push(
        rowResult(
          rowNumber,
          statusDetail,
          sku,
          ean,
          regularPrice,
          salePrice,
          'identifier_conflict',
          'The SKU and EAN match different Shopify variants.'
        )
      );
      return;
    }

    const variant = skuMatch ?? eanMatch;
    if (!variant) {
      rows.push(
        rowResult(
          rowNumber,
          statusDetail,
          sku,
          ean,
          regularPrice,
          salePrice,
          'unmatched',
          'No Shopify variant matches the supplied SKU or EAN.'
        )
      );
      return;
    }

    const minimumPriceApplied =
      calculateDiscountedSalePrice(regularPrice) < MINIMUM_SALE_PRICE;

    rows.push(
      rowResult(
        rowNumber,
        statusDetail,
        sku,
        ean,
        regularPrice,
        salePrice,
        'ready',
        minimumPriceApplied
          ? `Warning: discounted price was raised to the €${MINIMUM_SALE_PRICE.toFixed(2)} minimum.`
          : null,
        variant,
        skuMatch && eanMatch ? 'sku_and_ean' : skuMatch ? 'sku' : 'ean'
      )
    );
  });

  const grouped = new Map<string, SalePriceRowResult[]>();
  for (const row of rows) {
    if (row.status !== 'ready' || !row.shopifyProduct) continue;
    const productRows = grouped.get(row.shopifyProduct.id);
    if (productRows) productRows.push(row);
    else grouped.set(row.shopifyProduct.id, [row]);
  }

  const products: SalePriceProductResult[] = [];
  for (const [productId, productRows] of grouped) {
    const product = productRows[0].shopifyProduct!;
    const sourceRowNumbers = productRows.map((row) => row.rowNumber);
    const highestSalePrice = Math.max(
      ...productRows.map((row) => Number(row.salePrice))
    ).toFixed(2);
    const distinctPrices = new Set(productRows.map((row) => row.salePrice));
    const message =
      distinctPrices.size > 1
        ? `Using the highest calculated sale price from ${productRows.length} matched SKU rows.`
        : null;
    const currentSalePrice = productRows[0].currentSalePrice;
    const alreadyUpToDate = normalizedPrice(currentSalePrice) === highestSalePrice;

    if (alreadyUpToDate) {
      for (const row of productRows) {
        row.status = 'already_up_to_date';
        row.message = 'Shopify already has the proposed parent sale price.';
      }
    }

    products.push({
      productId,
      productTitle: product.title,
      salePrice: highestSalePrice,
      currentSalePrice,
      minimumPriceApplied:
        Number(highestSalePrice) === MINIMUM_SALE_PRICE &&
        productRows.some((row) => row.minimumPriceApplied),
      status: alreadyUpToDate ? 'already_up_to_date' : 'ready',
      message: alreadyUpToDate
        ? 'Shopify already has the proposed parent sale price.'
        : message,
      sourceRowNumbers,
    });
  }

  return { rows, products, summary: createSummary(rows, products) };
}

export function applyProductUpdateResults(
  preparation: SalePricePreparation,
  outcomes: Map<string, { updated: boolean; message: string | null }>
): SalePricePreparation {
  for (const product of preparation.products) {
    if (product.status !== 'ready') continue;
    const outcome = outcomes.get(product.productId);
    if (!outcome) continue;

    product.status = outcome.updated ? 'updated' : 'update_failed';
    product.message = outcome.message;
    if (outcome.updated) product.currentSalePrice = product.salePrice;

    for (const row of preparation.rows) {
      if (row.status !== 'ready' || row.shopifyProduct?.id !== product.productId) continue;
      row.status = outcome.updated ? 'updated' : 'update_failed';
      row.message = outcome.message;
      if (outcome.updated) row.currentSalePrice = product.salePrice;
    }
  }

  preparation.summary = createSummary(preparation.rows, preparation.products);
  return preparation;
}
