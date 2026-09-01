export const DEFAULT_SALE_PRICE_DISCOUNT_PERCENTAGE = 10;
export const MINIMUM_SALE_PRICE_DISCOUNT_PERCENTAGE = 10;
export const MAXIMUM_SALE_PRICE_DISCOUNT_PERCENTAGE = 100;
export const MINIMUM_SALE_PRICE = 15;
export const SALE_PRICE_TARGET_STATUS = 'ZABLO_646';
export const SALE_PRICE_TARGET_COUNTRY = 'DE';
export const SALE_PRICE_TARGET_CURRENCY = 'EUR';

export type SalePriceInputRow = {
  rowNumber?: number;
  sku?: string | number | null;
  ean?: string | number | null;
  regularPrice: string | number | null;
  /** The Zalando `status_detail` value. Only ZABLO_646 rows are eligible. */
  statusDetail?: string | null;
  /** The Zalando market country. Only DE rows are eligible. */
  country?: string | null;
  /** The price currency. Only EUR rows are eligible. */
  currency?: string | null;
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
      compareDigest: string;
    } | null;
  };
};

export type SalePriceRowStatus =
  | 'ready'
  | 'invalid_price'
  | 'outside_target_status'
  | 'outside_target_market'
  | 'invalid_currency'
  | 'missing_identifier'
  | 'unmatched'
  | 'ambiguous_sku'
  | 'ambiguous_ean'
  | 'identifier_conflict'
  | 'product_price_conflict'
  | 'already_up_to_date'
  | 'update_conflict'
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
  compareDigest: string | null;
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
  | 'update_conflict'
  | 'updated'
  | 'update_failed';

export type SalePriceProductResult = {
  productId: string;
  productTitle: string;
  salePrice: string | null;
  currentSalePrice: string | null;
  compareDigest: string | null;
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
  outsideTargetMarketRows: number;
  invalidCurrencyRows: number;
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
  updateConflictRows: number;
  updateConflictProducts: number;
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

export function isValidSalePriceDiscountPercentage(discountPercentage: number): boolean {
  return Number.isFinite(discountPercentage)
    && discountPercentage >= MINIMUM_SALE_PRICE_DISCOUNT_PERCENTAGE
    && discountPercentage <= MAXIMUM_SALE_PRICE_DISCOUNT_PERCENTAGE;
}

export function calculateSalePrice(
  regularPrice: number,
  discountPercentage = DEFAULT_SALE_PRICE_DISCOUNT_PERCENTAGE
): string {
  if (!isValidSalePriceDiscountPercentage(discountPercentage)) {
    throw new RangeError(
      `Discount percentage must be between ${MINIMUM_SALE_PRICE_DISCOUNT_PERCENTAGE} and ${MAXIMUM_SALE_PRICE_DISCOUNT_PERCENTAGE}.`
    );
  }

  const discountedPrice = calculateDiscountedSalePrice(regularPrice, discountPercentage);
  return Math.max(MINIMUM_SALE_PRICE, discountedPrice).toFixed(2);
}

function calculateDiscountedSalePrice(
  regularPrice: number,
  discountPercentage: number
): number {
  const multiplier = 1 - discountPercentage / 100;
  return Math.round((regularPrice * multiplier + Number.EPSILON) * 100) / 100;
}

function containsTargetStatus(statusDetail: string): boolean {
  return statusDetail
    .split(',')
    .map((status) => status.trim().toUpperCase())
    .includes(SALE_PRICE_TARGET_STATUS);
}

function currentMetafieldValue(variant: ShopifySalePriceVariant | null): string | null {
  const value = text(variant?.product.salePriceMetafield?.value);
  return value || null;
}

function normalizedPrice(value: string | null): string | null {
  const parsed = parseRegularPrice(value);
  return parsed === null ? null : parsed.toFixed(2);
}

function currentMetafieldDigest(variant: ShopifySalePriceVariant | null): string | null {
  return variant?.product.salePriceMetafield?.compareDigest ?? null;
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
  matchingMethod: SalePriceRowResult['matchingMethod'] = null,
  discountPercentage = DEFAULT_SALE_PRICE_DISCOUNT_PERCENTAGE
): SalePriceRowResult {
  const discountedPrice =
    regularPrice === null
      ? null
      : calculateDiscountedSalePrice(regularPrice, discountPercentage);

  return {
    rowNumber,
    statusDetail: statusDetail || null,
    sku: sku || null,
    ean: ean || null,
    regularPrice,
    salePrice,
    currentSalePrice: currentMetafieldValue(variant),
    compareDigest: currentMetafieldDigest(variant),
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
    outsideTargetMarketRows: rows.filter(
      (row) => row.status === 'outside_target_market'
    ).length,
    invalidCurrencyRows: rows.filter((row) => row.status === 'invalid_currency')
      .length,
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
    updateConflictRows: rows.filter((row) => row.status === 'update_conflict').length,
    updateConflictProducts: products.filter(
      (product) => product.status === 'update_conflict'
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
  variants: ShopifySalePriceVariant[],
  discountPercentage = DEFAULT_SALE_PRICE_DISCOUNT_PERCENTAGE
): SalePricePreparation {
  if (!isValidSalePriceDiscountPercentage(discountPercentage)) {
    throw new RangeError(
      `Discount percentage must be between ${MINIMUM_SALE_PRICE_DISCOUNT_PERCENTAGE} and ${MAXIMUM_SALE_PRICE_DISCOUNT_PERCENTAGE}.`
    );
  }

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
    const country = text(input.country).toUpperCase();
    const currency = text(input.currency).toUpperCase();
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
          `Only rows whose status_detail contains ${SALE_PRICE_TARGET_STATUS} are eligible for this update.`
        )
      );
      return;
    }

    if (country !== SALE_PRICE_TARGET_COUNTRY) {
      rows.push(
        rowResult(
          rowNumber,
          statusDetail,
          sku,
          ean,
          regularPrice,
          null,
          'outside_target_market',
          `Only ${SALE_PRICE_TARGET_COUNTRY} market rows are eligible for this update.`
        )
      );
      return;
    }

    if (currency !== SALE_PRICE_TARGET_CURRENCY) {
      rows.push(
        rowResult(
          rowNumber,
          statusDetail,
          sku,
          ean,
          regularPrice,
          null,
          'invalid_currency',
          `Only ${SALE_PRICE_TARGET_CURRENCY} price rows are eligible for this update.`
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

    const salePrice = calculateSalePrice(regularPrice, discountPercentage);
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
          'A SKU or EAN is required to match this row.',
          null,
          null,
          discountPercentage
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
          `SKU "${sku}" matches ${skuMatches.length} Shopify variants.`,
          null,
          null,
          discountPercentage
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
          `EAN "${ean}" matches ${eanMatches.length} Shopify variants.`,
          null,
          null,
          discountPercentage
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
          'The SKU and EAN match different Shopify variants.',
          null,
          null,
          discountPercentage
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
          'No Shopify variant matches the supplied SKU or EAN.',
          null,
          null,
          discountPercentage
        )
      );
      return;
    }

    const minimumPriceApplied =
      calculateDiscountedSalePrice(regularPrice, discountPercentage) < MINIMUM_SALE_PRICE;

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
        skuMatch && eanMatch ? 'sku_and_ean' : skuMatch ? 'sku' : 'ean',
        discountPercentage
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
      compareDigest: productRows[0].compareDigest,
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
  outcomes: Map<
    string,
    { updated: boolean; conflict?: boolean; message: string | null }
  >
): SalePricePreparation {
  for (const product of preparation.products) {
    if (product.status !== 'ready') continue;
    const outcome = outcomes.get(product.productId);
    if (!outcome) continue;

    product.status = outcome.updated
      ? 'updated'
      : outcome.conflict
        ? 'update_conflict'
        : 'update_failed';
    product.message = outcome.message;
    if (outcome.updated) product.currentSalePrice = product.salePrice;

    for (const row of preparation.rows) {
      if (row.status !== 'ready' || row.shopifyProduct?.id !== product.productId) continue;
      row.status = outcome.updated
        ? 'updated'
        : outcome.conflict
          ? 'update_conflict'
          : 'update_failed';
      row.message = outcome.message;
      if (outcome.updated) row.currentSalePrice = product.salePrice;
    }
  }

  preparation.summary = createSummary(preparation.rows, preparation.products);
  return preparation;
}
