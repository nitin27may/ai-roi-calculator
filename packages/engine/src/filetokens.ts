import { heuristics, type ChatModel } from "@studio/catalog";
import { imageCost, IMAGE_SIZES, type ImageCost } from "./images.js";

/**
 * Tokens for one file sent to a model, with the text and the pictures counted separately.
 *
 * Text: pages x words per page (from the page type the file type maps to) x tokens per word, then the model's tokenizer multiplier.
 * Pictures: images per page x pages x the model's own image formula (images.ts). Image tokens are already in the model's own
 * tokens, so the tokenizer multiplier is not applied to them. A model with no verified image formula gets 0 image tokens and
 * `imageSupported: false`, so a missing formula never invents a cost.
 */
export type FileType = "word" | "pdf" | "excel" | "powerpoint" | "image";
export type PageType = keyof typeof heuristics.pages.wordsPerPage;

export const FILE_TYPES: { id: FileType; label: string; pageType: PageType | null; unit: string; note: string }[] = [
  { id: "word", label: "Word document", pageType: "plain", unit: "page", note: "About 500 words on a page of ordinary prose." },
  { id: "pdf", label: "PDF", pageType: "dense", unit: "page", note: "About 700 words on a dense PDF page (tables, small print)." },
  { id: "excel", label: "Excel workbook (printed or exported as pages)", pageType: "spreadsheet", unit: "page", note: "About 1,350 words on a spreadsheet page, mostly numbers and short labels." },
  { id: "powerpoint", label: "PowerPoint", pageType: "slide", unit: "slide", note: "About 40 words on a slide." },
  { id: "image", label: "Image or scan only", pageType: null, unit: "image", note: "No text layer: the whole content is the picture." },
];

export const fileType = (id: FileType) => FILE_TYPES.find((f) => f.id === id)!;

export interface FileInput {
  fileType: FileType;
  /** Pages, slides or images in the file. */
  pages: number;
  /** Pictures embedded in each page. Ignored for an image-only file, which is one picture per page. */
  imagesPerPage: number;
  /** Picture size, from `IMAGE_SIZES`. */
  sizeId: (typeof IMAGE_SIZES)[number]["id"];
  detail: "low" | "high";
}

export interface FileTokens {
  wordsPerPage: number;
  textTokensPerPage: number;
  textTokens: number;
  imagesTotal: number;
  imageSupported: boolean;
  imageTokensEach: number;
  imageTokens: number;
  total: number;
  /** One line per part, in plain words, for the worked example. */
  textFormula: string;
  imageFormula: string;
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-CA");

export function fileTokens(model: Pick<ChatModel, "id" | "vendor" | "label">, tokenizerMultiplier: number, f: FileInput): FileTokens {
  const t = fileType(f.fileType);
  const wordsPerPage = t.pageType ? heuristics.pages.wordsPerPage[t.pageType] : 0;
  const textTokensPerPage = wordsPerPage * heuristics.tokens.perWord * tokenizerMultiplier;
  const textTokens = textTokensPerPage * f.pages;
  const perPage = f.fileType === "image" ? 1 : f.imagesPerPage;
  const size = IMAGE_SIZES.find((s) => s.id === f.sizeId) ?? IMAGE_SIZES[1];
  const img: ImageCost = imageCost(model, { perCall: perPage, widthPx: size.widthPx, heightPx: size.heightPx, detail: f.detail });
  const imagesTotal = perPage * f.pages;
  const imageTokens = img.perImage * imagesTotal;
  return {
    wordsPerPage, textTokensPerPage, textTokens, imagesTotal, imageSupported: img.supported, imageTokensEach: img.perImage, imageTokens, total: textTokens + imageTokens,
    textFormula: wordsPerPage === 0 ? "No text layer, so no text tokens"
      : `${fmt(f.pages)} ${t.unit}s x ${fmt(wordsPerPage)} words x ${heuristics.tokens.perWord} tokens a word${tokenizerMultiplier !== 1 ? ` x ${tokenizerMultiplier.toFixed(2)} for ${model.label}'s tokenizer` : ""} = ${fmt(textTokens)} tokens`,
    imageFormula: imagesTotal === 0 ? "No images entered"
      : img.supported ? `${fmt(imagesTotal)} images x ${fmt(img.perImage)} tokens each = ${fmt(imageTokens)} tokens (${img.formula})`
      : img.formula,
  };
}
