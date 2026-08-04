// @vitest-environment happy-dom

import React, { act } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
  getAnalysisRuleSuggestions: vi.fn(),
  getRuleset: vi.fn(),
  listDatasets: vi.fn(),
  listRulesets: vi.fn(),
  previewRewrite: vi.fn(),
  updateGlossary: vi.fn(),
  updateIntents: vi.fn(),
  updatePatterns: vi.fn(),
}))

const routerMocks = vi.hoisted(() => ({ push: vi.fn() }))
const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))

vi.mock('@/lib/api', () => ({
  datasetApi: {
    getAnalysisRuleSuggestions: apiMocks.getAnalysisRuleSuggestions,
    listAll: apiMocks.listDatasets,
  },
  industryRulesApi: {
    getRuleset: apiMocks.getRuleset,
    listRulesets: apiMocks.listRulesets,
    previewRewrite: apiMocks.previewRewrite,
    updateGlossary: apiMocks.updateGlossary,
    updateIntents: apiMocks.updateIntents,
    updatePatterns: apiMocks.updatePatterns,
  },
}))

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => routerMocks,
}))

vi.mock('sonner', () => ({ toast: toastMocks }))

vi.mock('@/lib/secure-random', () => ({
  randomBase36Id: () => 'test-id',
}))

vi.mock('@/components/ui/page-scaffold', () => ({
  PageScaffold: ({
    actions,
    children,
    description,
    title,
    top,
  }: Readonly<{
    actions?: React.ReactNode
    children: React.ReactNode
    description?: React.ReactNode
    title: React.ReactNode
    top?: React.ReactNode
  }>) => (
    <main>
      <header>
        <h1>{title}</h1>
        {description}
        {actions}
      </header>
      {top}
      {children}
    </main>
  ),
}))

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <div>{children}</div>
  ),
  TabsContent: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <section>{children}</section>
  ),
  TabsList: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <div>{children}</div>
  ),
  TabsTrigger: ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <button type="button">{children}</button>
  ),
}))

vi.mock('@/components/ui/select', () => {
  type SelectContextValue = {
    disabled: boolean
    onValueChange?: (value: string) => void
  }
  const SelectContext = React.createContext<SelectContextValue>({
    disabled: false,
  })

  return {
    Select: ({
      children,
      disabled = false,
      onValueChange,
    }: Readonly<{
      children: React.ReactNode
      disabled?: boolean
      onValueChange?: (value: string) => void
      value?: string
    }>) => (
      <SelectContext.Provider value={{ disabled, onValueChange }}>
        <div>{children}</div>
      </SelectContext.Provider>
    ),
    SelectContent: ({ children }: Readonly<{ children: React.ReactNode }>) => (
      <div>{children}</div>
    ),
    SelectItem: ({
      children,
      value,
    }: Readonly<{ children: React.ReactNode; value: string }>) => {
      const context = React.useContext(SelectContext)
      return (
        <button
          type="button"
          disabled={context.disabled}
          onClick={() => context.onValueChange?.(value)}
        >
          {children}
        </button>
      )
    },
    SelectTrigger: ({
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button type="button" {...props}>
        {children}
      </button>
    ),
    SelectValue: ({ placeholder }: Readonly<{ placeholder?: string }>) => (
      <span>{placeholder}</span>
    ),
  }
})

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({
    checked,
    disabled,
    onCheckedChange,
  }: Readonly<{
    checked?: boolean
    disabled?: boolean
    onCheckedChange?: (checked: boolean) => void
  }>) => (
    <input
      type="checkbox"
      checked={checked === true}
      disabled={disabled}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
    />
  ),
}))

vi.mock('@/components/ui/unsaved-changes-dialog', () => ({
  UnsavedChangesDialog: ({
    discardDisabled,
    onDiscard,
    onOpenChange,
    open,
    title,
  }: Readonly<{
    discardDisabled?: boolean
    onDiscard: () => void
    onOpenChange: (open: boolean) => void
    open: boolean
    title?: string
  }>) =>
    open ? (
      <div role="alertdialog" aria-label={title}>
        <button type="button" onClick={() => onOpenChange(false)}>
          继续编辑
        </button>
        <button type="button" disabled={discardDisabled} onClick={onDiscard}>
          放弃修改
        </button>
      </div>
    ) : null,
}))

import { IndustryRulesWorkbench } from './industry-rules-workbench'
import { queryKeys } from '@/lib/query-keys'

type Deferred<T> = {
  promise: Promise<T>
  reject: (error: unknown) => void
  resolve: (value: T) => void
}

type RenderedWorkbench = {
  container: HTMLDivElement
  queryClient: QueryClient
  root: Root
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function rulesetDetail(name: string, term = `${name}术语`) {
  return {
    ruleset: {
      name,
      glossary: { [term]: [`${term}别名`] },
      patterns: [
        {
          markers: [`${name}触发词`],
          followup: `${name}澄清话术`,
          enabled: true,
        },
      ],
      intents: [
        {
          name: `${name}意图`,
          keywords: [`${name}关键词`],
          route: 'default',
        },
      ],
    },
  }
}

function buttonByName(container: HTMLElement, name: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find(
    (item) => item.textContent?.trim() === name
  )
  expect(button, `未找到按钮：${name}`).toBeDefined()
  return button as HTMLButtonElement
}

function inputByLabel(container: HTMLElement, label: string): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(
    `input[aria-label="${label}"]`
  )
  expect(input, `未找到输入框：${label}`).not.toBeNull()
  return input as HTMLInputElement
}

function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function click(element: HTMLElement) {
  act(() => element.click())
}

function renderWorkbench(): RenderedWorkbench {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: false,
      },
    },
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <IndustryRulesWorkbench />
      </QueryClientProvider>
    )
  })

  return { container, queryClient, root }
}

async function waitForRuleset(container: HTMLElement, name: string) {
  await waitForAssertion(() => {
    expect(inputByLabel(container, '术语名称').value).toBe(`${name}术语`)
  })
}

async function waitForAssertion(assertion: () => void) {
  let lastError: unknown
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
    }
    await act(async () => {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 10))
    })
  }
  throw lastError
}

async function disposeWorkbench(rendered: RenderedWorkbench) {
  await act(async () => rendered.root.unmount())
  rendered.queryClient.clear()
}

describe('行业规则工作台草稿保护', () => {
  beforeEach(() => {
    ;(
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean
      }
    ).IS_REACT_ACT_ENVIRONMENT = true

    apiMocks.getAnalysisRuleSuggestions.mockReset()
    apiMocks.getRuleset.mockReset()
    apiMocks.listDatasets.mockReset()
    apiMocks.listRulesets.mockReset()
    apiMocks.previewRewrite.mockReset()
    apiMocks.updateGlossary.mockReset()
    apiMocks.updateIntents.mockReset()
    apiMocks.updatePatterns.mockReset()
    routerMocks.push.mockReset()
    toastMocks.error.mockReset()
    toastMocks.success.mockReset()

    apiMocks.listRulesets.mockResolvedValue({
      can_manage: true,
      rulesets: [{ name: '规则集A' }, { name: '规则集B' }],
    })
    apiMocks.listDatasets.mockResolvedValue([{ id: 'dataset-1', name: '知识库' }])
    apiMocks.getAnalysisRuleSuggestions.mockResolvedValue({
      glossary_suggestions: [],
    })
    apiMocks.getRuleset.mockImplementation((name: string) =>
      Promise.resolve(rulesetDetail(name))
    )
    apiMocks.previewRewrite.mockImplementation(({ query }: { query: string }) =>
      Promise.resolve({
        original_query: query,
        expanded_query: `${query}（改写）`,
        changed: true,
      })
    )
    apiMocks.updateGlossary.mockResolvedValue({ updated_count: 1 })
    apiMocks.updatePatterns.mockResolvedValue({ updated_count: 1 })
    apiMocks.updateIntents.mockResolvedValue({ updated_count: 1 })
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('详情首次加载和显式刷新期间禁止编辑', async () => {
    const initialRequest = deferred<ReturnType<typeof rulesetDetail>>()
    apiMocks.getRuleset.mockReturnValueOnce(initialRequest.promise)
    const rendered = renderWorkbench()

    await waitForAssertion(() =>
      expect(apiMocks.getRuleset).toHaveBeenCalledWith('规则集A')
    )
    expect(buttonByName(rendered.container, '新增术语').disabled).toBe(true)
    expect(buttonByName(rendered.container, '新增模式').disabled).toBe(true)
    expect(buttonByName(rendered.container, '新增意图').disabled).toBe(true)

    await act(async () => initialRequest.resolve(rulesetDetail('规则集A')))
    await waitForRuleset(rendered.container, '规则集A')
    expect(buttonByName(rendered.container, '新增术语').disabled).toBe(false)

    const refreshRequest = deferred<ReturnType<typeof rulesetDetail>>()
    apiMocks.getRuleset.mockReturnValueOnce(refreshRequest.promise)
    click(
      rendered.container.querySelector<HTMLButtonElement>(
        'button[aria-label="刷新工作台"]'
      ) as HTMLButtonElement
    )
    await waitForAssertion(() =>
      expect(inputByLabel(rendered.container, '术语名称').readOnly).toBe(true)
    )

    const lockedInput = inputByLabel(rendered.container, '术语别名')
    const originalValue = lockedInput.value
    setInputValue(lockedInput, '刷新期间不应写入')
    expect(inputByLabel(rendered.container, '术语别名').value).toBe(originalValue)

    await act(async () =>
      refreshRequest.resolve(rulesetDetail('规则集A', '刷新后术语'))
    )
    await waitForAssertion(() =>
      expect(inputByLabel(rendered.container, '术语名称').value).toBe(
        '刷新后术语'
      )
    )
    expect(inputByLabel(rendered.container, '术语名称').readOnly).toBe(false)

    await disposeWorkbench(rendered)
  })

  it('只保存一个分区时保留其他分区草稿', async () => {
    const rendered = renderWorkbench()
    await waitForRuleset(rendered.container, '规则集A')

    setInputValue(inputByLabel(rendered.container, '术语别名'), '本地术语别名')
    setInputValue(
      inputByLabel(rendered.container, '问题模式澄清话术'),
      '本地澄清话术'
    )
    const postSaveDetailRequest = deferred<ReturnType<typeof rulesetDetail>>()
    apiMocks.getRuleset.mockReturnValueOnce(postSaveDetailRequest.promise)
    click(buttonByName(rendered.container, '保存术语'))

    await waitForAssertion(() => {
      expect(toastMocks.success).toHaveBeenCalledWith('术语已保存')
      expect(apiMocks.getRuleset).toHaveBeenCalledTimes(2)
    })
    expect(apiMocks.updateGlossary).toHaveBeenCalledOnce()
    expect(apiMocks.updatePatterns).not.toHaveBeenCalled()
    expect(
      inputByLabel(rendered.container, '问题模式澄清话术').value
    ).toBe('本地澄清话术')

    await act(async () =>
      postSaveDetailRequest.resolve(rulesetDetail('规则集A'))
    )
    await waitForAssertion(() =>
      expect(buttonByName(rendered.container, '规则集B').disabled).toBe(false)
    )
    expect(
      inputByLabel(rendered.container, '问题模式澄清话术').value
    ).toBe('本地澄清话术')
    expect(buttonByName(rendered.container, '保存模式').disabled).toBe(false)

    await disposeWorkbench(rendered)
  })

  it('保存失败后保留草稿和未保存状态', async () => {
    apiMocks.updateGlossary.mockRejectedValueOnce(new Error('写入失败'))
    const rendered = renderWorkbench()
    await waitForRuleset(rendered.container, '规则集A')

    setInputValue(inputByLabel(rendered.container, '术语别名'), '失败后仍保留')
    click(buttonByName(rendered.container, '保存术语'))

    await waitForAssertion(() => expect(toastMocks.error).toHaveBeenCalled())
    expect(inputByLabel(rendered.container, '术语别名').value).toBe(
      '失败后仍保留'
    )
    expect(buttonByName(rendered.container, '保存术语').disabled).toBe(false)

    await waitForAssertion(() =>
      expect(buttonByName(rendered.container, '规则集B').disabled).toBe(false)
    )
    click(buttonByName(rendered.container, '规则集B'))
    expect(rendered.container.querySelector('[role="alertdialog"]')).not.toBeNull()
    expect(apiMocks.getRuleset).not.toHaveBeenCalledWith('规则集B')

    await disposeWorkbench(rendered)
  })

  it('切换规则集时支持取消或确认放弃草稿', async () => {
    const rendered = renderWorkbench()
    await waitForRuleset(rendered.container, '规则集A')

    setInputValue(inputByLabel(rendered.container, '术语别名'), '待确认草稿')
    click(buttonByName(rendered.container, '规则集B'))
    expect(rendered.container.querySelector('[role="alertdialog"]')).not.toBeNull()
    expect(apiMocks.getRuleset).not.toHaveBeenCalledWith('规则集B')

    click(buttonByName(rendered.container, '继续编辑'))
    expect(rendered.container.querySelector('[role="alertdialog"]')).toBeNull()
    expect(inputByLabel(rendered.container, '术语别名').value).toBe('待确认草稿')

    click(buttonByName(rendered.container, '规则集B'))
    click(buttonByName(rendered.container, '放弃修改'))
    await waitForAssertion(() =>
      expect(apiMocks.getRuleset).toHaveBeenCalledWith('规则集B')
    )
    await waitForRuleset(rendered.container, '规则集B')

    await disposeWorkbench(rendered)
  })

  it('只填写次要字段也会启用对应保存操作', async () => {
    const rendered = renderWorkbench()
    await waitForRuleset(rendered.container, '规则集A')

    click(buttonByName(rendered.container, '新增模式'))
    const followupInputs = rendered.container.querySelectorAll<HTMLInputElement>(
      'input[aria-label="问题模式澄清话术"]'
    )
    const partialInput = followupInputs.item(followupInputs.length - 1)
    setInputValue(partialInput, '只填写澄清话术')

    expect(buttonByName(rendered.container, '保存模式').disabled).toBe(false)
    click(buttonByName(rendered.container, '保存模式'))
    expect(apiMocks.updatePatterns).not.toHaveBeenCalled()
    expect(toastMocks.error).toHaveBeenCalledWith(
      '第 2 条问题模式缺少触发词，请补充后再保存'
    )
    expect(partialInput.value).toBe('只填写澄清话术')

    await disposeWorkbench(rendered)
  })

  it('管理权限降级后保留草稿并立即锁定写操作', async () => {
    const rendered = renderWorkbench()
    await waitForRuleset(rendered.container, '规则集A')

    setInputValue(inputByLabel(rendered.container, '术语别名'), '权限变更前草稿')
    await act(async () => {
      rendered.queryClient.setQueryData(queryKeys.industryRules.rulesets, {
        can_manage: false,
        rulesets: [{ name: '规则集A' }, { name: '规则集B' }],
      })
      await Promise.resolve()
    })

    expect(inputByLabel(rendered.container, '术语别名').value).toBe(
      '权限变更前草稿'
    )
    await waitForAssertion(() =>
      expect(inputByLabel(rendered.container, '术语别名').readOnly).toBe(true)
    )
    expect(buttonByName(rendered.container, '保存术语').disabled).toBe(true)
    click(buttonByName(rendered.container, '保存术语'))
    expect(apiMocks.updateGlossary).not.toHaveBeenCalled()

    click(buttonByName(rendered.container, '规则集B'))
    expect(rendered.container.querySelector('[role="alertdialog"]')).not.toBeNull()

    await disposeWorkbench(rendered)
  })
})

describe('行业规则改写预览竞态', () => {
  beforeEach(() => {
    ;(
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean
      }
    ).IS_REACT_ACT_ENVIRONMENT = true
    apiMocks.getAnalysisRuleSuggestions.mockResolvedValue({
      glossary_suggestions: [],
    })
    apiMocks.listDatasets.mockResolvedValue([{ id: 'dataset-1', name: '知识库' }])
    apiMocks.listRulesets.mockResolvedValue({
      can_manage: true,
      rulesets: [{ name: '规则集A' }],
    })
    apiMocks.getRuleset.mockResolvedValue(rulesetDetail('规则集A'))
    apiMocks.updateGlossary.mockResolvedValue({ updated_count: 1 })
    apiMocks.updatePatterns.mockResolvedValue({ updated_count: 1 })
    apiMocks.updateIntents.mockResolvedValue({ updated_count: 1 })
    toastMocks.error.mockReset()
    toastMocks.success.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('乱序返回时只展示最后一次请求结果', async () => {
    const firstRequest = deferred<{
      original_query: string
      expanded_query: string
      changed: boolean
    }>()
    const secondRequest = deferred<{
      original_query: string
      expanded_query: string
      changed: boolean
    }>()
    apiMocks.previewRewrite.mockImplementation(({ query }: { query: string }) =>
      query === '问题A' ? firstRequest.promise : secondRequest.promise
    )
    vi.useFakeTimers()
    const rendered = renderWorkbench()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const previewInput = rendered.container.querySelector<HTMLInputElement>(
      '#industry-rules-preview-query'
    ) as HTMLInputElement
    setInputValue(previewInput, '问题A')
    await act(async () => vi.advanceTimersByTime(281))
    expect(apiMocks.previewRewrite).toHaveBeenNthCalledWith(1, {
      ruleset: '规则集A',
      query: '问题A',
    })
    setInputValue(previewInput, '问题B')
    await act(async () => vi.advanceTimersByTime(281))
    expect(apiMocks.previewRewrite).toHaveBeenNthCalledWith(2, {
      ruleset: '规则集A',
      query: '问题B',
    })

    await act(async () =>
      secondRequest.resolve({
        original_query: '问题B',
        expanded_query: '问题B的新结果',
        changed: true,
      })
    )
    expect(rendered.container.textContent).toContain('问题B的新结果')

    await act(async () =>
      firstRequest.resolve({
        original_query: '问题A',
        expanded_query: '问题A的旧结果',
        changed: true,
      })
    )
    expect(rendered.container.textContent).toContain('问题B的新结果')
    expect(rendered.container.textContent).not.toContain('问题A的旧结果')

    await disposeWorkbench(rendered)
  })

  it('新请求失败时清除旧结果并显示可恢复错误', async () => {
    apiMocks.previewRewrite.mockImplementation(({ query }: { query: string }) =>
      query === '问题A'
        ? Promise.resolve({
            original_query: '问题A',
            expanded_query: '问题A的结果',
            changed: true,
          })
        : Promise.reject(new Error('预览服务不可用'))
    )
    vi.useFakeTimers()
    const rendered = renderWorkbench()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const previewInput = rendered.container.querySelector<HTMLInputElement>(
      '#industry-rules-preview-query'
    ) as HTMLInputElement
    setInputValue(previewInput, '问题A')
    await act(async () => {
      vi.advanceTimersByTime(281)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(rendered.container.textContent).toContain('问题A的结果')

    setInputValue(previewInput, '问题B')
    expect(rendered.container.textContent).not.toContain('问题A的结果')
    await act(async () => {
      vi.advanceTimersByTime(281)
      await Promise.resolve()
      await Promise.resolve()
    })

    const errorState = rendered.container.querySelector('[role="alert"]')
    expect(errorState).not.toBeNull()
    expect(errorState?.textContent).toContain('预览服务不可用')
    expect(rendered.container.textContent).not.toContain('问题A的结果')

    await disposeWorkbench(rendered)
  })
})
