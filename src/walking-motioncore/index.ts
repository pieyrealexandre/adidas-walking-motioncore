import copyGuidelines from './copy-guidelines.md?raw'

export const CATEGORY_SLUG = 'walking-motioncore' as const
export const CATEGORY_DISPLAY_NAME = 'Walking — Motioncore'

export const STORAGE_KEYS = {
  lastLifestyleGeneration: `lastLifestyleGeneration-${CATEGORY_SLUG}`,
  lastGroupShotGeneration: `lastGroupShotGeneration-${CATEGORY_SLUG}`,
} as const

export { copyGuidelines }

// Copy generator data
export { RUNNING_JAPAN_PRODUCTS as PRODUCTS } from './products'

// Image generator data
export { POSES, POSES_BY_ID, type RunningPose } from './poses'
export {
  SHOES,
  TOPS,
  BOTTOMS,
  ALL_PRODUCTS,
  PRODUCTS_BY_ID,
  GARMENT_COMBINATIONS,
  findGarmentCombination,
  resolveProductImageUrl,
  type RunningProduct,
  type RunningGarmentCombo,
} from './garments'
export {
  LOCATIONS,
  LOCATIONS_BY_ID,
  SCENE_STYLES,
  SCENE_STYLES_BY_ID,
  MODELS,
  MODELS_BY_ID,
  MODELS_BY_GENDER,
  type RunningLocation,
  type RunningSceneStyle,
  type RunningModel,
} from './references'
