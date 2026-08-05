// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SimilarityMatrixEntry } from './color-schemes'
import { SimilarityFilterControls } from './filter-controls'

const entry: SimilarityMatrixEntry = {
  xCollectionId: 'x',
  yCollectionId: 'y',
  xCollectionLabel: '横轴集合',
  yCollectionLabel: '纵轴集合',
  result: {
    matrix: [
      [0.9, 0.7, 0.2],
      [0.3, 0.8, 0.6],
    ],
    x_data: [],
    y_data: [],
    x_available_fields: ['name', 'text'],
    y_available_fields: ['title', 'document'],
    stats: {
      total_pairs: 6,
      avg_similarity: 0.58,
      min_similarity: 0.2,
      max_similarity: 0.9,
      std_similarity: 0.2,
      high_similarity_count: 2,
      medium_similarity_count: 2,
      low_similarity_count: 2,
      compute_time: 0.1,
    },
    metadata: {},
  },
  visualConfig: {
    displayFields: { xField: 'name', yField: 'title' },
    similarityRange: { min: 0, max: 1 },
    filters: { topK: { value: 1, axis: 'x' } },
    sorting: { order: 'none' },
  },
}

describe('相似度筛选器', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  const onDisplayFieldsChange = vi.fn()
  const onSimilarityRangeChange = vi.fn()
  const onTopKChange = vi.fn()

  beforeEach(() => {
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderControls(currentEntry: SimilarityMatrixEntry | null = entry) {
    act(() => {
      root.render(
        <SimilarityFilterControls
          entry={currentEntry}
          rangeBounds={{ min: 0, max: 1 }}
          similarityRange={{ min: 0.2, max: 0.9 }}
          topK={{ value: 1, axis: 'x' }}
          onDisplayFieldsChange={onDisplayFieldsChange}
          onSimilarityRangeChange={onSimilarityRangeChange}
          onTopKChange={onTopKChange}
        />
      )
    })
  }

  it('没有主矩阵时显示明确空状态', () => {
    renderControls(null)

    expect(container.textContent).toContain('暂无可筛选的矩阵')
    expect(container.querySelector('select')).toBeNull()
  })

  it('字段、阈值和 Top-K 控件按矩阵维度提交变更', () => {
    renderControls()

    const xField = container.querySelector('#similarity-x-display-field') as HTMLSelectElement
    changeValue(xField, 'text')
    expect(onDisplayFieldsChange).toHaveBeenCalledWith('text', 'title')

    const minimum = container.querySelector(
      'input[aria-label="最低相似度数值"]'
    ) as HTMLInputElement
    changeValue(minimum, '0.4')
    expect(onSimilarityRangeChange).toHaveBeenCalledWith({ min: 0.4, max: 0.9 })

    const topKNumber = container.querySelector('input[aria-label="Top-K 数值"]') as HTMLInputElement
    expect(topKNumber.max).toBe('3')
    expect(findButton('横轴 Top-K')?.getAttribute('aria-pressed')).toBe('true')

    act(() => findButton('纵轴 Top-K')?.click())
    expect(onTopKChange).toHaveBeenCalledWith({ value: 1, axis: 'y' })
  })

  function findButton(label: string) {
    return Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === label
    )
  }

  function changeValue(control: HTMLInputElement | HTMLSelectElement, value: string) {
    const prototype =
      control instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    act(() => {
      setter?.call(control, value)
      control.dispatchEvent(new Event('change', { bubbles: true }))
      control.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
})
