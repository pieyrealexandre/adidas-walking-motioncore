// Garments for running-japan image generation.
//
// Three sister catalogs (SHOES, TOPS, BOTTOMS) plus a pre-rendered combo
// catalog for outfits that benefit from a single composite reference image.
// Side- and back-view product variants live on the same object as optional
// fields, so pose visibility logic (in poses.ts) and view selection can
// be co-located.
//
// CONTENT STATUS: All payload URLs are placeholders. The 5 Supernova shoe IDs
// are kept consistent with src/running-japan/products.ts (the copy-gen catalog)
// so the same product can be cross-referenced from both subsystems.

import type { RunningPose } from './poses'

const CONTENT_TBD = 'PLACEHOLDER — see docs/content-brief-running-japan.md'

export interface RunningProduct {
  /** Shared with copy-gen catalog (src/running-japan/products.ts). */
  id: string
  name: string
  /** UI preview thumbnail (small, WebP/JPEG). */
  thumbnailUrl: string
  /** Reference image sent to the AI as a generation input (full PNG). */
  payloadUrl: string
  /** Variant images for view-aware poses. */
  backViewUrl?: string
  sideViewUrl?: string
  /**
   * Short colour + type description used by jsonPromptBuilder to ground
   * the AI's understanding of what the garment looks like.
   */
  refDescription?: { color: string; type: string }
}

/** Shoe catalog. IDs mirror copy-gen product IDs from products.ts. */
export const SHOES: RunningProduct[] = [
  {
    id: 'supernova-rise',
    name: 'SUPERNOVA RISE',
    thumbnailUrl: CONTENT_TBD,
    payloadUrl: CONTENT_TBD,
    refDescription: { color: 'white with subtle accents', type: 'lightweight running shoe' },
  },
  {
    id: 'supernova-prima',
    name: 'SUPERNOVA PRIMA',
    thumbnailUrl: CONTENT_TBD,
    payloadUrl: CONTENT_TBD,
    refDescription: { color: 'soft neutral', type: 'cushioned running shoe' },
  },
  {
    id: 'supernova-stride',
    name: 'SUPERNOVA STRIDE',
    thumbnailUrl: CONTENT_TBD,
    payloadUrl: CONTENT_TBD,
    refDescription: { color: 'breathable neutral', type: 'lightweight everyday runner' },
  },
  {
    id: 'supernova-solution',
    name: 'SUPERNOVA SOLUTION',
    thumbnailUrl: CONTENT_TBD,
    payloadUrl: CONTENT_TBD,
    refDescription: { color: 'neutral with stability accents', type: 'stability running shoe' },
  },
  {
    id: 'supernova-gtx',
    name: 'SUPERNOVA GTX',
    thumbnailUrl: CONTENT_TBD,
    payloadUrl: CONTENT_TBD,
    refDescription: { color: 'all-weather neutral', type: 'GORE-TEX all-weather runner' },
  },
]

/** Tops catalog (running jerseys, jackets, windbreakers, etc.). */
export const TOPS: RunningProduct[] = [
  {
    id: 'tokyo_marathon_jersey',
    name: 'Tokyo Marathon Jersey',
    thumbnailUrl: CONTENT_TBD,
    payloadUrl: CONTENT_TBD,
    refDescription: { color: 'race-day red', type: 'lightweight running jersey' },
  },
  {
    id: 'light_windbreaker',
    name: 'Light Windbreaker',
    thumbnailUrl: CONTENT_TBD,
    payloadUrl: CONTENT_TBD,
    refDescription: { color: 'neutral grey', type: 'lightweight running windbreaker' },
  },
  {
    id: 'long_sleeve_thermal',
    name: 'Long-Sleeve Thermal',
    thumbnailUrl: CONTENT_TBD,
    payloadUrl: CONTENT_TBD,
    refDescription: { color: 'soft black', type: 'thermal long-sleeve top' },
  },
]

/** Bottoms catalog. */
export const BOTTOMS: RunningProduct[] = [
  {
    id: 'running_shorts',
    name: 'Running Shorts',
    thumbnailUrl: CONTENT_TBD,
    payloadUrl: CONTENT_TBD,
    refDescription: { color: 'black', type: 'lightweight running shorts' },
  },
  {
    id: 'running_leggings',
    name: 'Running Leggings',
    thumbnailUrl: CONTENT_TBD,
    payloadUrl: CONTENT_TBD,
    refDescription: { color: 'black', type: 'fitted running leggings' },
  },
]

export const ALL_PRODUCTS = [...SHOES, ...TOPS, ...BOTTOMS]
export const PRODUCTS_BY_ID: Record<string, RunningProduct> = Object.fromEntries(
  ALL_PRODUCTS.map((p) => [p.id, p]),
)

/**
 * Pre-rendered outfit composites.
 *
 * When a specific (tops, bottoms, shoes) tuple is selected, a single composite
 * reference image often gives better AI results than three separate refs. The
 * adidas content / studio team can hand-render hero outfits and list them here.
 *
 * Matching is exact: tops/bottoms/shoes IDs must match the selection. `poseId`
 * restricts the combo to a single pose (useful for back-view or side-view
 * outfit composites).
 */
export interface RunningGarmentCombo {
  tops?: string
  bottoms?: string
  shoes?: string
  combinedImageUrl: string
  name?: string
  poseId?: string
}

export const GARMENT_COMBINATIONS: RunningGarmentCombo[] = [
  // No combinations defined yet — adidas studio team to deliver hero outfits.
]

/** Find the most specific combo matching the selection + pose. */
export function findGarmentCombination(
  selection: { tops?: string; bottoms?: string; shoes?: string },
  poseId?: string,
): RunningGarmentCombo | null {
  const sel = {
    tops: selection.tops?.trim() || undefined,
    bottoms: selection.bottoms?.trim() || undefined,
    shoes: selection.shoes?.trim() || undefined,
  }

  for (const combo of GARMENT_COMBINATIONS) {
    if (combo.poseId && combo.poseId !== poseId) continue
    const eq = (a?: string, b?: string) => (a === undefined && b === undefined) || a === b
    if (eq(combo.tops, sel.tops) && eq(combo.bottoms, sel.bottoms) && eq(combo.shoes, sel.shoes)) {
      return combo
    }
  }
  return null
}

/**
 * Resolve the right product image URL for a given pose, using the side/back
 * variants when the pose has the `view` hint set.
 */
export function resolveProductImageUrl(product: RunningProduct, pose: RunningPose): string {
  if (pose.view === 'back' && product.backViewUrl) return product.backViewUrl
  if (pose.view === 'side' && product.sideViewUrl) return product.sideViewUrl
  return product.payloadUrl
}
