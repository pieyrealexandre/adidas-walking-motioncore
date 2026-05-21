// Garment image URL builder for running-japan.
//
// Data + base helpers (GARMENT_COMBINATIONS, findGarmentCombination,
// resolveProductImageUrl) live in src/running-japan/garments.ts.
//
// This file is just the orchestration helper that the LifestyleGen page calls
// to assemble the `imageUrls[]` array sent to the generation Edge Function:
// it looks up a pre-rendered outfit composite first, falls back to individual
// garment refs with pose-aware view selection.

import {
  PRODUCTS_BY_ID,
  findGarmentCombination,
  resolveProductImageUrl,
} from '@/running-japan/garments'
import { POSES_BY_ID, type RunningPose } from '@/running-japan/poses'

export interface BuildGarmentImageUrlsResult {
  imageUrls: string[]
  usingCombination: boolean
  combinationName?: string
}

export function buildGarmentImageUrls(
  selection: { tops?: string; bottoms?: string; shoes?: string },
  poseId?: string,
): BuildGarmentImageUrlsResult {
  const pose: RunningPose | undefined = poseId ? POSES_BY_ID[poseId] : undefined

  const combo = findGarmentCombination(selection, poseId)
  if (combo) {
    return {
      imageUrls: [combo.combinedImageUrl],
      usingCombination: true,
      combinationName: combo.name,
    }
  }

  const imageUrls: string[] = []

  if (selection.tops) {
    const top = PRODUCTS_BY_ID[selection.tops]
    if (top) imageUrls.push(pose ? resolveProductImageUrl(top, pose) : top.payloadUrl)
  }

  const bottomsVisible = pose ? pose.visibleBottoms : true
  if (selection.bottoms && bottomsVisible) {
    const bottom = PRODUCTS_BY_ID[selection.bottoms]
    if (bottom) imageUrls.push(pose ? resolveProductImageUrl(bottom, pose) : bottom.payloadUrl)
  }

  const feetVisible = pose ? pose.visibleFeet : true
  if (selection.shoes && feetVisible) {
    const shoes = PRODUCTS_BY_ID[selection.shoes]
    if (shoes) imageUrls.push(pose ? resolveProductImageUrl(shoes, pose) : shoes.payloadUrl)
  }

  return { imageUrls, usingCombination: false }
}
