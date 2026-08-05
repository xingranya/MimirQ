// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getRuleset: vi.fn(),
  listRulesets: vi.fn(),
  previewRewrite: vi.fn(),
  updateGlossary: vi.fn(),
  updateIntents: vi.fn(),
  updatePatterns: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  industryRulesApi: mocks,
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: Readonly<{ children: ReactNode; href: string }>) => (
    <a href={href}>{children}</a>
  ),
}))

import { IndustryRulesSection } from './industry-rules-section'

const RULESET_DETAIL = {
  schema: 'mimirq.industry_rules_ruleset.v1',
  ruleset: {
    name: 'industrial_control',
    glossary_count: 1,
    pattern_count: 1,
    intent_count: 1,
    glossary: { PLC: ['可编程逻辑控制器'] },
    patterns: [{ name: 'alarm' }],
    intents: [{ name: 'diagnosis' }],
  },
}

describe('设置页行业规则保存保护', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    mocks.listRulesets.mockResolvedValue({
      schema: 'mimirq.industry_rules_ruleset_list.v1',
      count: 1,
      can_manage: true,
      rulesets: [
        {
          name: 'industrial_control',
          glossary_count: 1,
          pattern_count: 1,
          intent_count: 1,
        },
      ],
    })
    mocks.getRuleset.mockResolvedValue(RULESET_DETAIL)
    mocks.updateGlossary.mockResolvedValue({
      schema: 'mimirq.industry_rules_update.v1',
      ruleset: 'industrial_control',
      section: 'glossary',
      updated_count: 1,
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    queryClient.clear()
    container.remove()
  })

  async function renderSection(writable: boolean) {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <IndustryRulesSection writable={writable} />
        </QueryClientProvider>
      )
    })
    await act(async () => {
      await vi.waitFor(() => {
        expect(mocks.listRulesets).toHaveBeenCalledOnce()
        expect(container.textContent).toContain('industrial_control')
      })
    })
  }

  function findButton(label: string) {
    return Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === label
    )
  }

  async function loadCurrentRuleset() {
    await act(async () => findButton('载入')?.click())
    await act(async () => {
      await vi.waitFor(() => {
        expect(mocks.getRuleset).toHaveBeenCalledWith('industrial_control')
        expect(container.querySelector('textarea')?.value).toContain('PLC')
      })
    })
  }

  it('详情载入前禁止编辑和保存，载入后才开放写操作', async () => {
    await renderSection(true)

    expect(container.textContent).toContain('请先载入当前规则集')
    expect(Array.from(container.querySelectorAll('textarea')).every((field) => field.disabled)).toBe(true)
    expect(findButton('保存词库')?.disabled).toBe(true)

    await loadCurrentRuleset()

    expect(container.textContent).toContain('正在编辑 industrial_control')
    expect(Array.from(container.querySelectorAll('textarea')).every((field) => !field.disabled)).toBe(true)
    expect(findButton('保存词库')?.disabled).toBe(false)
    await act(async () => findButton('保存词库')?.click())
    expect(mocks.updateGlossary).toHaveBeenCalledWith('industrial_control', {
      glossary: { PLC: ['可编程逻辑控制器'] },
    })
  })

  it('只读账号载入详情后仍不能编辑或保存', async () => {
    await renderSection(false)
    await loadCurrentRuleset()

    expect(container.textContent).toContain('当前账号可以查看和预览规则，但不能修改')
    expect(Array.from(container.querySelectorAll('textarea')).every((field) => field.disabled)).toBe(true)
    expect(findButton('保存词库')?.disabled).toBe(true)
    expect(mocks.updateGlossary).not.toHaveBeenCalled()
  })

  it('接口未授予管理能力时保持只读', async () => {
    mocks.listRulesets.mockResolvedValueOnce({
      schema: 'mimirq.industry_rules_ruleset_list.v1',
      count: 1,
      can_manage: false,
      rulesets: [
        {
          name: 'industrial_control',
          glossary_count: 1,
          pattern_count: 1,
          intent_count: 1,
        },
      ],
    })

    await renderSection(true)
    await loadCurrentRuleset()

    expect(container.textContent).toContain('当前账号可以查看和预览规则，但不能修改')
    expect(Array.from(container.querySelectorAll('textarea')).every((field) => field.disabled)).toBe(true)
    expect(findButton('保存词库')?.disabled).toBe(true)
    expect(mocks.updateGlossary).not.toHaveBeenCalled()
  })

  it('切换到未载入的规则集后重新关闭写操作', async () => {
    await renderSection(true)
    await loadCurrentRuleset()

    const nameInput = container.querySelector<HTMLInputElement>('#industry-rules-name')
    await act(async () => {
      if (!nameInput) return
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      valueSetter?.call(nameInput, 'finance')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
      nameInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(container.textContent).toContain('请先载入当前规则集')
    expect(findButton('保存词库')?.disabled).toBe(true)
  })

  it('重新载入失败后不允许继续保存旧内容', async () => {
    await renderSection(true)
    await loadCurrentRuleset()
    expect(findButton('保存词库')?.disabled).toBe(false)

    mocks.getRuleset.mockRejectedValueOnce(new Error('读取失败'))
    await act(async () => findButton('载入')?.click())
    await act(async () => {
      await vi.waitFor(() => expect(mocks.getRuleset).toHaveBeenCalledTimes(2))
    })

    expect(container.textContent).toContain('请先载入当前规则集')
    expect(findButton('保存词库')?.disabled).toBe(true)
    expect(mocks.updateGlossary).not.toHaveBeenCalled()
  })
})
