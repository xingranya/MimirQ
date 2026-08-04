export const GOLDEN_TAG = 'golden'
export const GOLDEN_DRAFT_TAG = 'golden_draft'

export type GoldenTagState = {
  hasManualGolden: boolean
  hasDraftGolden: boolean
  isGolden: boolean
}

export type GoldenTagTransition = GoldenTagState & {
  nextTags: string[]
}

/** 读取评测样本的基准标签状态。 */
export function getGoldenTagState(tags: string[] | null | undefined): GoldenTagState {
  const currentTags = Array.isArray(tags) ? tags : []
  const hasManualGolden = currentTags.includes(GOLDEN_TAG)
  const hasDraftGolden = currentTags.includes(GOLDEN_DRAFT_TAG)
  return {
    hasManualGolden,
    hasDraftGolden,
    isGolden: hasManualGolden || hasDraftGolden,
  }
}

/** 切换人工基准标签，保留独立的基准草稿状态。 */
export function toggleManualGoldenTag(
  tags: string[] | null | undefined
): GoldenTagTransition {
  const currentTags = Array.isArray(tags) ? tags : []
  const state = getGoldenTagState(currentTags)
  const nextTags = state.hasManualGolden
    ? currentTags.filter((tag) => tag !== GOLDEN_TAG)
    : [...currentTags, GOLDEN_TAG]

  return {
    ...state,
    nextTags,
  }
}
