// JSON prompt builder for running-japan lifestyle image generation.
//
// Reads pose / garment / location / scene-style metadata from
// src/running-japan/* and assembles the JSON prompt sent to the Supabase
// Edge Function `generate-image-pro` (which forwards to fal-ai/nano-banana-2/edit).
//
// Compared to the bball original (926 LOC of per-pose hardcoded overrides),
// this version is category-driven: each pose object in running-japan/poses.ts
// carries its own framing, step-2 descriptor, pose description, and visibility
// flags. The prompt builder mostly assembles fields from data instead of
// branching on poseId.

import { POSES_BY_ID, type RunningPose } from '@/walking-motioncore/poses'
import {
  PRODUCTS_BY_ID,
  type RunningProduct,
} from '@/walking-motioncore/garments'
import {
  LOCATIONS_BY_ID,
  SCENE_STYLES_BY_ID,
  MODELS_BY_ID,
} from '@/walking-motioncore/references'

export type Gender = 'male' | 'female'

export interface JSONPromptStructure {
  model: string
  model_details?: {
    description?: string
    skin_tone?: string
    hairstyle?: string
  }
  scene_type: string
  subject: {
    gender: string
    position: string
    pose: string
    expression?: string
    gaze_direction?: string
  }
  clothing: Record<string, string>
  location: {
    setting: string
    prompt: string
  }
  aesthetic: {
    style: string
    view: string
    details?: string
  }
  photography_style: {
    genre: string
    lighting: string
    composition: {
      foreground: string
      background: string
      depth_of_field: string
      framing?: string
    }
    motion: string
    focus: string
  }
  camera: {
    angle: string
    height: string
    distance: string
  }
  prop?: {
    item: string
    handling: string
  }
  avoid?: string[]
}

function refDescription(product: RunningProduct | undefined, kind: string): string {
  if (!product) return `the ${kind} from the reference image`
  const desc = product.refDescription
  if (!desc) return `the ${kind} from the reference image`
  const colorPrefix = desc.color ? `${desc.color} ` : ''
  return `the ${colorPrefix}${desc.type} from the reference image`
}

function clothingForPose(
  pose: RunningPose,
  selection: { tops?: string; bottoms?: string; shoes?: string },
): Record<string, string> {
  const clothing: Record<string, string> = {}

  if (selection.tops) {
    const top = PRODUCTS_BY_ID[selection.tops]
    const isJacket = (top?.refDescription?.type || '').match(/jacket|windbreaker/i)
    const key = isJacket ? 'jacket' : 'top'
    clothing[key] = refDescription(top, 'top')
  }

  if (selection.bottoms && pose.visibleBottoms) {
    const bottom = PRODUCTS_BY_ID[selection.bottoms]
    const isShorts = (bottom?.refDescription?.type || '').match(/shorts/i)
    const key = isShorts ? 'shorts' : 'pants'
    clothing[key] = refDescription(bottom, key)
  }

  if (selection.shoes && pose.visibleFeet) {
    const shoes = PRODUCTS_BY_ID[selection.shoes]
    clothing.shoes = refDescription(shoes, 'running shoes')
  }

  return clothing
}

// Photography-style fragment: derived from RunningSceneStyle.prompt — the
// scene style's `prompt` field is a free-form fragment ("golden hour, soft
// warm light, …"). We split it across the genre/lighting/composition slots
// of the JSON structure.
function photographyStyleFromSceneStyle(
  prompt: string,
): JSONPromptStructure['photography_style'] {
  return {
    genre: 'lifestyle editorial',
    lighting: prompt,
    composition: {
      foreground: 'clear subject',
      background: 'environment in shallow depth',
      depth_of_field: 'shallow',
    },
    motion: 'natural in-stride movement',
    focus: 'sharp subject focus',
  }
}

export function buildJSONPrompt(params: {
  gender: Gender
  poseId: string
  sceneStyleId: string
  locationId: string
  modelId?: string
  gazeDirection: 'candid' | 'staring'
  smileExpression: 'smiling' | 'serious'
  topsId?: string
  bottomsId?: string
  shoesId?: string
}): JSONPromptStructure {
  const {
    gender,
    poseId,
    sceneStyleId,
    locationId,
    modelId,
    gazeDirection,
    smileExpression,
    topsId,
    bottomsId,
    shoesId,
  } = params

  const pose = POSES_BY_ID[poseId]
  if (!pose) throw new Error(`Unknown poseId: ${poseId}`)
  const location = LOCATIONS_BY_ID[locationId]
  if (!location) throw new Error(`Unknown locationId: ${locationId}`)
  const sceneStyle = SCENE_STYLES_BY_ID[sceneStyleId]
  if (!sceneStyle) throw new Error(`Unknown sceneStyleId: ${sceneStyleId}`)
  const model = modelId ? MODELS_BY_ID[modelId] : undefined

  const clothing = clothingForPose(pose, {
    tops: topsId,
    bottoms: bottomsId,
    shoes: shoesId,
  })

  const gazeText =
    gazeDirection === 'candid'
      ? 'looking away naturally, unaware of camera'
      : 'casual glance toward camera, not posed'
  const expressionText =
    smileExpression === 'smiling'
      ? 'natural smile, mid-moment'
      : 'neutral expression, focused'

  // Position derived from pose.step2Descriptor's leading verb where possible;
  // otherwise fall back to a sensible default. Runners are almost always
  // moving, so default to "in motion" rather than "standing".
  const position = pose.descriptiveOnly ? 'as described' : 'in motion'

  const subject: JSONPromptStructure['subject'] = {
    gender,
    position,
    pose: pose.poseDescription,
  }
  if (pose.visibleFace) {
    subject.expression = expressionText
    subject.gaze_direction = gazeText
  }

  const result: JSONPromptStructure = {
    model: `this ${gender} model`,
    model_details: model
      ? {
          description: `${gender} runner`,
          skin_tone: model.skinTone,
        }
      : undefined,
    scene_type: `editorial ${pose.framing.toLowerCase().replace(/ of the$/, '')}`,
    subject,
    clothing,
    location: {
      setting: location.name,
      prompt: location.prompt,
    },
    aesthetic: {
      style: sceneStyle.name.toLowerCase(),
      view: pose.view || 'front',
      details: sceneStyle.prompt,
    },
    photography_style: photographyStyleFromSceneStyle(sceneStyle.prompt),
    camera: {
      angle:
        pose.view === 'back'
          ? 'straight-on from behind'
          : pose.view === 'side'
            ? '90-degree side angle, profile view'
            : 'straight-on, eye level perspective',
      height: 'camera at subject eye level',
      distance: 'medium distance framing',
    },
  }

  if (pose.propImageUrl && pose.propPromptFragment) {
    result.prop = {
      item: 'reference prop image',
      handling: pose.propPromptFragment,
    }
  }

  if (!pose.visibleFace) {
    result.avoid = ['face', 'facial features', 'head']
  }

  return result
}
