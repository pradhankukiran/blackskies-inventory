export type ShopifyBarcodeSelectedOption = {
  name: string | null;
  value: string | null;
};

export type ShopifyBarcodeVariant = {
  id: string;
  sku: string | null;
  barcode: string | null;
  selectedOptions: ShopifyBarcodeSelectedOption[];
  product: {
    title: string | null;
    color: { jsonValue: unknown } | null;
  } | null;
};

export type ShopifyBarcodeRow = {
  variantId: string;
  sku: string;
  ean: string;
  articleName: string;
  color: string;
  size: string;
};

const COLOR_OPTION_NAMES = new Set(['color', 'colour', 'farbe']);
const SIZE_OPTION_NAMES = new Set(['size', 'größe', 'grösse', 'groesse']);
const DEFAULT_VARIANT_OPTION_NAME = 'title';
const DEFAULT_VARIANT_OPTION_VALUE = 'default title';

function stringValue(value: string | null | undefined): string {
  return typeof value === 'string' ? value : '';
}

function optionValue(
  options: ShopifyBarcodeSelectedOption[],
  optionNames: Set<string>
): string {
  const option = options.find((candidate) => {
    const name = stringValue(candidate.name).trim().normalize('NFC').toLowerCase();
    return optionNames.has(name);
  });

  return stringValue(option?.value);
}

function metafieldTextList(jsonValue: unknown): string {
  if (!Array.isArray(jsonValue)) return '';

  return jsonValue
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' / ');
}

function isDefaultVariant(options: ShopifyBarcodeSelectedOption[]): boolean {
  return options.some(
    (option) =>
      stringValue(option.name).trim().toLowerCase() === DEFAULT_VARIANT_OPTION_NAME &&
      stringValue(option.value).trim().toLowerCase() === DEFAULT_VARIANT_OPTION_VALUE
  );
}

/** Maps Shopify variants to the label rows expected by the barcode pipeline. */
export function mapBarcodeVariant(variant: ShopifyBarcodeVariant): ShopifyBarcodeRow {
  const optionColor = optionValue(variant.selectedOptions, COLOR_OPTION_NAMES);
  const optionSize = optionValue(variant.selectedOptions, SIZE_OPTION_NAMES);

  return {
    variantId: stringValue(variant.id),
    sku: stringValue(variant.sku),
    ean: stringValue(variant.barcode),
    articleName: stringValue(variant.product?.title),
    color: optionColor || metafieldTextList(variant.product?.color?.jsonValue),
    size: optionSize || (isDefaultVariant(variant.selectedOptions) ? 'One Size' : ''),
  };
}

export function mapBarcodeVariants(
  variants: ShopifyBarcodeVariant[]
): ShopifyBarcodeRow[] {
  return variants.map(mapBarcodeVariant);
}
