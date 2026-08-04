// @vitest-environment happy-dom

import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/settings/settings-help-tooltip', () => ({
  SettingsHelpTooltip: ({ children }: Readonly<{ children: ReactNode }>) => <span>{children}</span>,
}))

vi.mock('@/components/settings/settings-switch', () => ({
  SettingsSwitch: ({
    checked,
    onCheckedChange,
    'aria-label': ariaLabel,
  }: Readonly<{
    checked: boolean
    onCheckedChange: (checked: boolean) => void
    'aria-label': string
  }>) => (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={checked}
      onClick={() => onCheckedChange(!checked)}
    />
  ),
}))

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: Readonly<{ children: ReactNode }>) => <div>{children}</div>,
  SelectContent: ({ children }: Readonly<{ children: ReactNode }>) => <div>{children}</div>,
  SelectItem: ({ children }: Readonly<{ children: ReactNode }>) => <span>{children}</span>,
  SelectTrigger: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
  SelectValue: () => <span />,
}))

vi.mock('@/components/ui/system-page-tokens', () => ({
  settingsTextTokens: {
    fieldLabel: '',
    helpText: '',
  },
}))

vi.mock('@/lib/utils', () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}))

import { RagSection } from './rag-section'

const rag = {
  chunk_size: 1000,
  chunk_overlap: 100,
  chunk_min_chars: 20,
  retrieval_top_k: 8,
  similarity_threshold: 0.5,
  default_parser_backend: 'mineru',
  default_chunk_strategy: 'recursive',
  bm25_index_enabled: true,
  enable_reranker: true,
  reranker_provider: 'local_bge_v2_m3',
  reranker_top_n: 20,
  show_image_in_answer: true,
  image_append_max: 3,
}

describe('RAG 设置交互', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let updates: Array<Record<string, unknown>>

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    updates = []
    act(() =>
      root.render(
        <RagSection
          rag={rag}
          updateRag={(patch) => updates.push(patch)}
        />
      )
    )
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('三个能力开关继续写入原有配置字段', () => {
    for (const label of ['切换 BM25 检索', '切换重排器', '切换回答附图']) {
      act(() => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)?.click())
    }

    expect(updates).toEqual([
      { bm25_index_enabled: false },
      { enable_reranker: false },
      { show_image_in_answer: false },
    ])
  })

  it('基础检索范围控件继续更新数值', () => {
    const input = container.querySelector<HTMLInputElement>('#rag-retrieval-top-k')
    expect(input).not.toBeNull()

    act(() => {
      if (!input) return
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )?.set
      valueSetter?.call(input, '12')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(updates).toContainEqual({ retrieval_top_k: 12 })
  })
})
