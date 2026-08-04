import { describe, expect, it } from 'vitest'

import {
  GOLDEN_DRAFT_TAG,
  GOLDEN_TAG,
  getGoldenTagState,
  toggleManualGoldenTag,
} from './regression-case-tags'

describe('基准评测样本标签状态', () => {
  it('普通样本添加人工基准标签', () => {
    expect(toggleManualGoldenTag(['reviewed'])).toEqual({
      hasManualGolden: false,
      hasDraftGolden: false,
      isGolden: false,
      nextTags: ['reviewed', GOLDEN_TAG],
    })
  })

  it('基准草稿确认后同时保留草稿来源', () => {
    expect(toggleManualGoldenTag([GOLDEN_DRAFT_TAG]).nextTags).toEqual([
      GOLDEN_DRAFT_TAG,
      GOLDEN_TAG,
    ])
  })

  it('取消人工确认时保留基准草稿', () => {
    const transition = toggleManualGoldenTag([
      GOLDEN_DRAFT_TAG,
      GOLDEN_TAG,
      'reviewed',
    ])

    expect(transition.hasManualGolden).toBe(true)
    expect(transition.hasDraftGolden).toBe(true)
    expect(transition.nextTags).toEqual([GOLDEN_DRAFT_TAG, 'reviewed'])
    expect(getGoldenTagState(transition.nextTags).isGolden).toBe(true)
  })

  it('纯人工基准取消后移出基准集合', () => {
    const transition = toggleManualGoldenTag([GOLDEN_TAG, 'reviewed'])

    expect(transition.nextTags).toEqual(['reviewed'])
    expect(getGoldenTagState(transition.nextTags).isGolden).toBe(false)
  })
})
