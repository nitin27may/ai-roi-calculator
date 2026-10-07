import type { ChatModel } from "@roi-calculator/catalog";
import type { ImageInput } from "./project.js";

/**
 * Image input tokens (E15 images), from the vendors' published formulas. Image tokens are billed as ordinary input tokens
 * at the model's own tokenizer, so callers add them to the input side without applying the tokenizer multiplier again.
 *
 * Tile models (OpenAI vision guide):
 *   1. Scale to fit a 2048 x 2048 square (never up).
 *   2. Scale so the shortest side is 768 px (never up).
 *   3. tiles = ceil(width / 512) x ceil(height / 512); tokens = base + perTile x tiles.
 *   Low detail is the base tokens only, whatever the size.
 *
 * Patch models (OpenAI vision guide, 32 px patches):
 *   patches = ceil(width / 32) x ceil(height / 32). Above 1,536 patches the image is scaled down until it fits.
 *   tokens = patches x the model's multiplier. There is no low-detail mode, so `detail` is ignored.
 *
 * Anthropic (Claude vision guide): tokens = width x height / 750 after scaling the long edge to at most 1,568 px,
 * capped at 1,600 tokens. There is no detail setting.
 *
 * The per-model constants below come from those guides. Models not listed are not vision-priced here: they return
 * `supported: false` and zero tokens, so a missing formula never invents a cost.
 */
export type ImageFormula =
  | { kind: "tile"; base: number; perTile: number }
  | { kind: "patch"; multiplier: number }
  | { kind: "anthropic" };

const TILE: Record<string, { base: number; perTile: number }> = {
  "gpt-4o": { base: 85, perTile: 170 },
  "gpt-4.1": { base: 85, perTile: 170 },
  "gpt-4o-mini": { base: 2833, perTile: 5667 },
  "gpt-5": { base: 70, perTile: 140 },
  "gpt-5.1": { base: 70, perTile: 140 },
  o3: { base: 75, perTile: 150 },
};
const PATCH: Record<string, number> = {
  "gpt-4.1-mini": 1.62,
  "gpt-4.1-nano": 2.46,
  "gpt-5-mini": 1.62,
  "gpt-5-nano": 2.46,
  "o4-mini": 1.72,
  "gpt-5.4": 1.2,
  "gpt-5.5": 1.2,
  "gpt-6-astra": 1.2,
};

/** The formula for a model, or undefined when this app has no verified image formula for it. */
export function imageFormula(m: Pick<ChatModel, "id" | "vendor">): ImageFormula | undefined {
  const tile = TILE[m.id];
  if (tile) return { kind: "tile", ...tile };
  const patch = PATCH[m.id];
  if (patch !== undefined) return { kind: "patch", multiplier: patch };
  if (m.vendor === "anthropic") return { kind: "anthropic" };
  return undefined;
}

export const supportsImages = (m: Pick<ChatModel, "id" | "vendor">) => imageFormula(m) !== undefined;

export const TILE_PX = 512;
export const PATCH_PX = 32;
export const PATCH_BUDGET = 1536;
export const ANTHROPIC_MAX_EDGE = 1568;
export const ANTHROPIC_MAX_TOKENS = 1600;

/** Tokens for one image. */
export function imageTokens(f: ImageFormula, widthPx: number, heightPx: number, detail: "low" | "high" = "high"): number {
  if (widthPx <= 0 || heightPx <= 0) return 0;
  switch (f.kind) {
    case "tile": {
      if (detail === "low") return f.base;
      let w = widthPx, h = heightPx;
      const fit = Math.min(1, 2048 / Math.max(w, h));
      w *= fit; h *= fit;
      const shrink = Math.min(1, 768 / Math.min(w, h));
      w *= shrink; h *= shrink;
      return f.base + f.perTile * Math.ceil(w / TILE_PX) * Math.ceil(h / TILE_PX);
    }
    case "patch": {
      let patches = Math.ceil(widthPx / PATCH_PX) * Math.ceil(heightPx / PATCH_PX);
      if (patches > PATCH_BUDGET) {
        const r0 = Math.sqrt((PATCH_PX * PATCH_PX * PATCH_BUDGET) / (widthPx * heightPx));
        const wp = (widthPx * r0) / PATCH_PX, hp = (heightPx * r0) / PATCH_PX;
        // Scale again so the width lands on a whole number of patches, then count the patches that actually fit.
        const r1 = r0 * Math.min(Math.floor(wp) / wp, Math.floor(hp) / hp);
        patches = Math.min(PATCH_BUDGET, Math.ceil((widthPx * r1) / PATCH_PX) * Math.ceil((heightPx * r1) / PATCH_PX));
      }
      return patches * f.multiplier;
    }
    case "anthropic": {
      const fit = Math.min(1, ANTHROPIC_MAX_EDGE / Math.max(widthPx, heightPx));
      return Math.min(ANTHROPIC_MAX_TOKENS, (widthPx * fit * heightPx * fit) / 750);
    }
  }
}

/** Resolution presets for the picker. */
export const IMAGE_SIZES = [
  { id: "thumb", label: "Small (512 x 512)", widthPx: 512, heightPx: 512 },
  { id: "photo", label: "Phone photo (1024 x 768)", widthPx: 1024, heightPx: 768 },
  { id: "hd", label: "Full HD screenshot (1920 x 1080)", widthPx: 1920, heightPx: 1080 },
  { id: "page", label: "Scanned page at 150 dpi (1275 x 1650)", widthPx: 1275, heightPx: 1650 },
  { id: "large", label: "Large (4096 x 3072)", widthPx: 4096, heightPx: 3072 },
] as const;

export interface ImageCost {
  supported: boolean;
  /** Tokens per image and per call (images per call x per image). */
  perImage: number;
  perCall: number;
  formula: string;
}

/** Image tokens for one call of `model`, with a plain-words formula for the ledger line. */
export function imageCost(model: Pick<ChatModel, "id" | "vendor" | "label">, img: ImageInput): ImageCost {
  const f = imageFormula(model);
  if (!f) return { supported: false, perImage: 0, perCall: 0, formula: `${model.label} has no image formula in this app, so images add no tokens` };
  const perImage = imageTokens(f, img.widthPx, img.heightPx, img.detail);
  const how = f.kind === "tile" ? `${img.detail} detail, ${TILE_PX}px tiles`
    : f.kind === "patch" ? `${PATCH_PX}px patches x ${f.multiplier}`
    : "width x height / 750";
  return { supported: true, perImage, perCall: perImage * img.perCall, formula: `${img.perCall} x ${img.widthPx}x${img.heightPx} image (${how}) = ${Math.round(perImage)} tokens each` };
}
