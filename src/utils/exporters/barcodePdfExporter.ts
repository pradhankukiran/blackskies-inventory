import JSZip from "jszip";
import { jsPDF } from "jspdf";
import type { BarcodeBrand, BarcodeLabelRow, BarcodePdfOutputMode } from "@/types/barcode";

export type BarcodePdfBrand = BarcodeBrand;
export type { BarcodePdfOutputMode } from "@/types/barcode";

export interface BarcodePdfProgress {
  completed: number;
  total: number;
  phase: "labels" | "archive";
}

interface GenerateBarcodePdfOptions {
  rows: BarcodeLabelRow[];
  brand: BarcodePdfBrand;
  outputMode: BarcodePdfOutputMode;
  onProgress?: (progress: BarcodePdfProgress) => void;
}

interface BarcodePdfDownload {
  blob: Blob;
  filename: string;
  labelCount: number;
}

interface BrandDetails {
  logoPath: string;
  logoFormat: "PNG";
  logoWidth: number;
  logoHeight: number;
  website: string;
}

const PAGE_WIDTH_MM = 90;
const PAGE_HEIGHT_MM = 50;
const BARCODE_PATTERNS = {
  L: [
    "0001101",
    "0011001",
    "0010011",
    "0111101",
    "0100011",
    "0110001",
    "0101111",
    "0111011",
    "0110111",
    "0001011",
  ],
  G: [
    "0100111",
    "0110011",
    "0011011",
    "0100001",
    "0011101",
    "0111001",
    "0000101",
    "0010001",
    "0001001",
    "0010111",
  ],
  R: [
    "1110010",
    "1100110",
    "1101100",
    "1000010",
    "1011100",
    "1001110",
    "1010000",
    "1000100",
    "1001000",
    "1110100",
  ],
} as const;
const LEFT_PARITY = [
  "LLLLLL",
  "LLGLGG",
  "LLGGLG",
  "LLGGGL",
  "LGLLGG",
  "LGGLLG",
  "LGGGLL",
  "LGLGLG",
  "LGLGGL",
  "LGGLGL",
] as const;
const BRAND_DETAILS: Record<BarcodePdfBrand, BrandDetails> = {
  blackskies: {
    logoPath: "Blackskies-Barcode-Logo.png",
    logoFormat: "PNG",
    logoWidth: 18,
    logoHeight: 9,
    website: "www.blackskies.shop",
  },
  akitsune: {
    logoPath: "Akitsune-Logo.png",
    logoFormat: "PNG",
    logoWidth: 40,
    logoHeight: 8.36,
    website: "www.akitsune.com",
  },
};
const COMPANY_LINE = "Blackskies GmbH, Ernst-Meurin-Str. 51A, 33415 Verl, Germany";
const CONTACT_LINE = "Phone: +49 1579-2344822, E-Mail: support@blackskies.shop";

const calculateEan13CheckDigit = (firstTwelveDigits: string) => {
  const sum = firstTwelveDigits.split("").reduce((total, digit, index) => {
    return total + Number(digit) * (index % 2 === 0 ? 1 : 3);
  }, 0);
  return String((10 - (sum % 10)) % 10);
};

export const encodeEan13 = (ean: string) => {
  if (!/^\d{13}$/.test(ean) || calculateEan13CheckDigit(ean.slice(0, 12)) !== ean[12]) {
    throw new Error(`Cannot generate an EAN-13 barcode for "${ean}".`);
  }

  const firstDigit = Number(ean[0]);
  const parity = LEFT_PARITY[firstDigit];
  const left = ean
    .slice(1, 7)
    .split("")
    .map((digit, index) => BARCODE_PATTERNS[parity[index] as "L" | "G"][Number(digit)])
    .join("");
  const right = ean
    .slice(7)
    .split("")
    .map((digit) => BARCODE_PATTERNS.R[Number(digit)])
    .join("");

  return `101${left}01010${right}101`;
};

const createDocument = () =>
  new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [PAGE_WIDTH_MM, PAGE_HEIGHT_MM],
    compress: true,
    precision: 4,
  });

const fitText = (
  document: jsPDF,
  value: string,
  maximumWidth: number,
  preferredFontSize = 8,
  minimumFontSize = 5
) => {
  let fontSize = preferredFontSize;
  document.setFontSize(fontSize);

  while (fontSize > minimumFontSize && document.getTextWidth(value) > maximumWidth) {
    fontSize -= 0.25;
    document.setFontSize(fontSize);
  }

  if (document.getTextWidth(value) <= maximumWidth) return value;

  let shortened = value;
  while (shortened.length && document.getTextWidth(`${shortened}…`) > maximumWidth) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}…`;
};

const drawBarcode = (document: jsPDF, ean: string) => {
  const modules = encodeEan13(ean);
  const moduleWidth = 0.37;
  const barcodeWidth = modules.length * moduleWidth;
  const startX = (PAGE_WIDTH_MM - barcodeWidth) / 2;
  const startY = 33;
  const barcodeHeight = 10;

  document.setFillColor(0, 0, 0);
  let runStart = -1;
  for (let index = 0; index <= modules.length; index += 1) {
    const isBlack = modules[index] === "1";
    if (isBlack && runStart === -1) runStart = index;
    if (!isBlack && runStart !== -1) {
      document.rect(
        startX + runStart * moduleWidth,
        startY,
        (index - runStart) * moduleWidth,
        barcodeHeight,
        "F"
      );
      runStart = -1;
    }
  }
};

const drawLabelPage = (
  document: jsPDF,
  row: BarcodeLabelRow,
  brand: BarcodePdfBrand,
  logoDataUrl: string
) => {
  const brandDetails = BRAND_DETAILS[brand];
  const logoY = brand === "blackskies" ? 1.45 : 1.8;
  document.addImage(
    logoDataUrl,
    brandDetails.logoFormat,
    3,
    logoY,
    brandDetails.logoWidth,
    brandDetails.logoHeight,
    "barcode-brand-logo",
    "FAST"
  );

  document.setFont("helvetica", "normal");
  document.setTextColor(0, 0, 0);
  document.setFontSize(4);
  document.text(COMPANY_LINE, 88, 3.1, { align: "right" });
  document.text(CONTACT_LINE, 88, 4.8, { align: "right" });

  document.setFontSize(8);
  document.text(brandDetails.website, 86, 10.7, { align: "right" });
  document.setLineWidth(0.35);
  document.line(1, 11.8, 89, 11.8);

  const fields = [
    ["SKU:", row.sku],
    ["Article name:", row.articleName],
    ["Color:", row.color],
    ["Size:", row.size],
  ] as const;
  const fieldYPositions = [15.8, 19.2, 22.6, 26];
  fields.forEach(([label, value], index) => {
    document.setFontSize(8);
    document.text(label, 5, fieldYPositions[index]);
    const fittedValue = fitText(document, value, 62, 8, 5);
    document.text(fittedValue, 25, fieldYPositions[index]);
  });

  document.setLineWidth(0.35);
  document.line(1, 27.1, 89, 27.1);
  document.setFontSize(8);
  document.text("EAN", 45, 31.6, { align: "center" });
  drawBarcode(document, row.ean);
  document.setFontSize(8);
  document.text(row.ean, 45, 47.1, { align: "center" });
};

const loadLogoDataUrl = async (brand: BarcodePdfBrand) => {
  const response = await fetch(`/${BRAND_DETAILS[brand].logoPath}`);
  if (!response.ok) throw new Error("Could not load the selected brand logo.");

  const logoBlob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the selected brand logo."));
    reader.readAsDataURL(logoBlob);
  });
};

export const createBarcodeLabelPreviewBlob = async (
  row: BarcodeLabelRow,
  brand: BarcodePdfBrand
) => {
  if (row.status !== "ready") {
    throw new Error("Only labels that are ready can be previewed.");
  }

  const logoDataUrl = await loadLogoDataUrl(brand);
  return createBarcodeLabelDocument([row], brand, logoDataUrl).output("blob");
};

export const createBarcodeLabelDocument = (
  rows: BarcodeLabelRow[],
  brand: BarcodePdfBrand,
  logoDataUrl: string,
  onPage?: (completed: number) => void
) => {
  const document = createDocument();
  rows.forEach((row, index) => {
    if (index > 0) document.addPage([PAGE_WIDTH_MM, PAGE_HEIGHT_MM], "landscape");
    drawLabelPage(document, row, brand, logoDataUrl);
    onPage?.(index + 1);
  });
  return document;
};

const safeFilenamePart = (value: string) => {
  const printableValue = value
    .trim()
    .split("")
    .map((character) => (character.charCodeAt(0) < 32 ? "-" : character))
    .join("");
  const sanitized = printableValue.replace(/[<>:"/\\|?*]/g, "-");
  return sanitized.replace(/[. ]+$/g, "").slice(0, 80) || "label";
};

const yieldToBrowser = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));

export const generateBarcodePdfDownload = async ({
  rows,
  brand,
  outputMode,
  onProgress,
}: GenerateBarcodePdfOptions): Promise<BarcodePdfDownload> => {
  const readyRows = rows.filter((row) => row.status === "ready");
  if (!readyRows.length) throw new Error("No valid labels are ready to generate.");

  const logoDataUrl = await loadLogoDataUrl(brand);
  const date = new Date().toISOString().slice(0, 10);
  const baseFilename = `${brand}-barcode-labels-${date}`;

  if (outputMode === "combined") {
    const document = createDocument();
    for (let index = 0; index < readyRows.length; index += 1) {
      if (index > 0) document.addPage([PAGE_WIDTH_MM, PAGE_HEIGHT_MM], "landscape");
      drawLabelPage(document, readyRows[index], brand, logoDataUrl);
      onProgress?.({ completed: index + 1, total: readyRows.length, phase: "labels" });
      if ((index + 1) % 25 === 0) await yieldToBrowser();
    }

    return {
      blob: document.output("blob"),
      filename: `${baseFilename}.pdf`,
      labelCount: readyRows.length,
    };
  }

  const archive = new JSZip();
  for (let index = 0; index < readyRows.length; index += 1) {
    const row = readyRows[index];
    const document = createBarcodeLabelDocument([row], brand, logoDataUrl);
    const filename = `${safeFilenamePart(row.sku)}_${row.ean}.pdf`;
    archive.file(filename, document.output("arraybuffer"));
    onProgress?.({ completed: index + 1, total: readyRows.length, phase: "labels" });
    if ((index + 1) % 25 === 0) await yieldToBrowser();
  }

  onProgress?.({ completed: readyRows.length, total: readyRows.length, phase: "archive" });
  const blob = await archive.generateAsync({ type: "blob", compression: "STORE" });
  return {
    blob,
    filename: `${baseFilename}.zip`,
    labelCount: readyRows.length,
  };
};
