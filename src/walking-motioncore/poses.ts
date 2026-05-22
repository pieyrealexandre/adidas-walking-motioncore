// Poses for running-japan image generation.
//
// This file consolidates two things that bball had split across two files:
//   1. Behavior flags (which references to include for which pose) — bball
//      had these in `src/utils/poseConfig.ts` as discrete arrays (POSES_WITH_*,
//      POSES_WITHOUT_*, DESCRIPTIVE_ONLY_POSES, BASKETBALL_IMAGE_URL).
//   2. Pose metadata (id, name, thumbnail URL, framing description) — bball
//      had these in `src/components/image-creation/SelectionModal.tsx` as a
//      `mockProducts.poses` array, keyed by id.
//
// In bball, anyone changing a pose had to remember to edit both files in sync.
// Here, every property of a pose lives on the pose object itself.
//
// CONTENT STATUS: All entries below are placeholders until the adidas content
// team delivers running pose sketches (see docs/content-brief-running-japan.md
// for the full asset spec). URLs reference a TBD path under the running-japan
// GCS bucket — they will 404 until real assets are uploaded.

const CONTENT_TBD = 'PLACEHOLDER — see docs/content-brief-running-japan.md'

export interface RunningPose {
  /** snake_case identifier used as foreign key everywhere (DB, prompts, URLs). */
  id: string
  /** Display name for the picker UI. */
  name: string
  /** Sketch thumbnail URL shown in the picker. */
  image: string
  /** One-line framing description shown under the thumbnail. */
  description: string
  /** Composition prefix used in the AI prompt ("Full body shot of the…"). */
  framing: string
  /** Step-2 refinement positional descriptor (e.g. "mid-stride, weight on right foot"). */
  step2Descriptor: string
  /** Step-1 action prompt (e.g. "running on a paved street at golden hour"). */
  poseDescription: string

  /** False = skip the shoes reference image (feet not visible). */
  visibleFeet: boolean
  /** False = skip the bottoms reference image. */
  visibleBottoms: boolean
  /** False = skip the model face reference image. */
  visibleFace: boolean

  /** Use side- or back-view product images for this pose, if available. */
  view?: 'front' | 'side' | 'back'

  /**
   * True = generate from prompt text only, no sketch reference image needed.
   * Use for poses that are easy to describe verbally and don't benefit from a sketch.
   */
  descriptiveOnly?: boolean

  /**
   * Optional per-pose prop reference image (e.g. water bottle, race bib, towel).
   * Replaces bball's `BASKETBALL_IMAGE_URL` global hardcode — each pose carries
   * its own prop, no category-wide assumption.
   */
  propImageUrl?: string
  /** Prompt fragment describing what the model is doing with the prop. */
  propPromptFragment?: string
}

/**
 * Pose catalog for running-japan.
 *
 * 5 representative entries to establish the shape. The adidas content team will
 * deliver the full 15-20 pose set per the content brief; replace these stubs
 * then.
 */
export const POSES: RunningPose[] = [
  {
    id: 'running_jog_front',
    name: 'Jog — Front',
    image: CONTENT_TBD,
    description: 'Medium front-running shot, neutral pace.',
    framing: 'Full body shot of the',
    step2Descriptor: 'mid-stride, weight on right foot, arms in natural running cadence',
    poseDescription: 'running at a comfortable jogging pace on a paved street',
    visibleFeet: true,
    visibleBottoms: true,
    visibleFace: true,
    view: 'front',
  },
  {
    id: 'running_sprint_side',
    name: 'Sprint — Side',
    image: CONTENT_TBD,
    description: 'Side view of a full sprint, dynamic.',
    framing: 'Full body side shot of the',
    step2Descriptor: 'mid-sprint, knee high, opposing arm driving forward',
    poseDescription: 'sprinting at full speed on a track, captured from the side',
    visibleFeet: true,
    visibleBottoms: true,
    visibleFace: true,
    view: 'side',
  },
  {
    id: 'running_stride_back',
    name: 'Running — Back',
    image: CONTENT_TBD,
    description: 'Running away from camera.',
    framing: 'Back view full body shot of the',
    step2Descriptor: 'mid-stride away from camera, shoulders relaxed',
    poseDescription: 'running away from camera along a forest trail',
    visibleFeet: true,
    visibleBottoms: true,
    visibleFace: false,
    view: 'back',
  },
  {
    id: 'tying_shoe_seated',
    name: 'Tying Shoe (Seated)',
    image: CONTENT_TBD,
    description: 'Seated on steps, lacing shoes.',
    framing: 'Medium shot of the',
    step2Descriptor: 'seated, head down, hands at laces',
    poseDescription: 'seated on temple steps, tying running shoes before a morning run',
    visibleFeet: true,
    visibleBottoms: true,
    visibleFace: false,
    view: 'front',
  },
  {
    id: 'hydrate_walking',
    name: 'Hydrate Walking',
    image: CONTENT_TBD,
    description: 'Cool-down walk with water bottle.',
    framing: 'Full body shot of the',
    step2Descriptor: 'walking, head turned slightly down, water bottle in hand',
    poseDescription: 'cool-down walking after a run, drinking from a water bottle',
    visibleFeet: true,
    visibleBottoms: true,
    visibleFace: true,
    view: 'front',
    propImageUrl: CONTENT_TBD,
    propPromptFragment: 'holding a clear sports water bottle',
  },
]

export const POSES_BY_ID: Record<string, RunningPose> = Object.fromEntries(
  POSES.map((p) => [p.id, p]),
)
