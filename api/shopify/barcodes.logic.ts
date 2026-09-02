export type ShopifyBarcodeSelectedOption = {
  name: string | null;
  value: string | null;
};

export type ShopifyBarcodeVariant = {
  id: string;
  sku: string | null;
  barcode: string | null;
  selectedOptions: ShopifyBarcodeSelectedOption[];
  product: { title: string | null } | null;
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

/** Maps Shopify variants to the label rows expected by the barcode pipeline. */
export function mapBarcodeVariant(variant: ShopifyBarcodeVariant): ShopifyBarcodeRow {
  return {
    variantId: stringValue(variant.id),
    sku: stringValue(variant.sku),
    ean: stringValue(variant.barcode),
    articleName: stringValue(variant.product?.title),
    color: optionValue(variant.selectedOptions, COLOR_OPTION_NAMES),
    size: optionValue(variant.selectedOptions, SIZE_OPTION_NAMES),
  };
}

export function mapBarcodeVariants(
  variants: ShopifyBarcodeVariant[]
): ShopifyBarcodeRow[] {
  return variants.map(mapBarcodeVariant);
}
