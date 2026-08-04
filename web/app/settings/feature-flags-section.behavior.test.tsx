// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FeatureFlags } from '@/lib/api'
import { FeatureFlagsSection } from './_sections/feature-flags-section'

const DEFAULT_FLAGS: FeatureFlags = {
  kg_enabled: false,
  deepdoc_enabled: false,
  docling_enabled: false,
  etl4llm_enabled: false,
  marker_enabled: false,
  paddle_vl_enabled: false,
  textin_enabled: false,
  markitdown_enabled: false,
  llama_index_enabled: false,
  mineru_enabled: false,
  magicpdf_enabled: false,
}

let root: Root | null = null

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

function renderSection({
  editedFeatureFlags,
  disabled = false,
  toggleFeature = vi.fn(),
}: {
  editedFeatureFlags?: Partial<FeatureFlags>
  disabled?: boolean
  toggleFeature?: (key: keyof FeatureFlags) => void
} = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <FeatureFlagsSection
        editedFeatureFlags={editedFeatureFlags}
        getFeatureValue={(key) => editedFeatureFlags?.[key] ?? DEFAULT_FLAGS[key]}
        toggleFeature={toggleFeature}
        parserStatuses={{
          mineru: { enabled: true, available: false, message: '连接失败' },
        }}
        disabled={disabled}
      />
    )
  })
  return { container, toggleFeature }
}

describe('功能开关分组', () => {
  it('按三组显示全部十一项且每项只出现一次', () => {
    const { container } = renderSection()

    expect(container.textContent).toContain('知识组织')
    expect(container.textContent).toContain('内置与本地解析')
    expect(container.textContent).toContain('接入服务')
    const buttons = container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')
    expect(buttons).toHaveLength(11)
    expect(new Set([...buttons].map((button) => button.getAttribute('aria-labelledby'))).size).toBe(11)
  })

  it('点击整行提交对应字段并显示未保存状态', () => {
    const toggleFeature = vi.fn()
    const { container } = renderSection({
      editedFeatureFlags: { kg_enabled: true },
      toggleFeature,
    })
    const button = container.querySelector<HTMLButtonElement>(
      '[aria-labelledby="feature-kg_enabled-name"]'
    )

    expect(button?.getAttribute('aria-pressed')).toBe('true')
    expect(button?.textContent).toContain('未保存')
    act(() => button?.click())
    expect(toggleFeature).toHaveBeenCalledWith('kg_enabled')
  })

  it('只读模式使用原生禁用且不会触发回调', () => {
    const toggleFeature = vi.fn()
    const { container } = renderSection({ disabled: true, toggleFeature })
    const buttons = container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')

    expect([...buttons].every((button) => button.disabled)).toBe(true)
    act(() => buttons[0]?.click())
    expect(toggleFeature).not.toHaveBeenCalled()
  })

  it('仅在后端提供状态时显示解析器运行结果', () => {
    const { container } = renderSection()

    expect(container.querySelector('#feature-mineru_enabled-status')?.textContent).toBe(
      '运行环境不可用'
    )
    expect(container.querySelector('#feature-textin_enabled-status')).toBeNull()
  })
})
