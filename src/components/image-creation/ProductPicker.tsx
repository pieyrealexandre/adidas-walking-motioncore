// Shared category / gender types used by the image-creation surface.
//
// The bball ProductPicker was a heavyweight 270-line catalog grid. The
// running-japan LifestyleGen page uses a leaner inline picker (the per-slot
// thumbnail buttons in the right-hand column) and delegates to SelectionModal
// for the actual catalog. So this module is reduced to the shared types only.

export type ProductCategory = 'shoes' | 'tops' | 'bottoms' | 'poses' | 'model' | 'location' | 'scene_style'
export type Gender = 'male' | 'female'
