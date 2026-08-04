// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listAll: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  datasetApi: { listAll: mocks.listAll },
}))

vi.mock('@/components/settings/settings-switch', () => ({
  SettingsSwitch: ({ checked, onClick, 'aria-label': ariaLabel }: {
    checked: boolean
    onClick: () => void
    'aria-label': string
  }) => (
    <button type="button" aria-label={ariaLabel} aria-pressed={checked} onClick={onClick} />
  ),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    disabled,
    onClick,
    type,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type={type || 'button'} disabled={disabled} onClick={onClick} {...props}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock('@/components/ui/system-page-tokens', () => ({
  settingsTextTokens: {
    fieldLabel: '',
    helpText: '',
    panelTitle: '',
  },
}))

vi.mock('@/lib/utils', () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}))

import { DifyIntegrationSection } from './dify-integration-section'

const config = {
  enabled: false,
  api_keys: '',
  tenant_id: '',
  account_id: 'system:dify',
  knowledge_map_json: '',
  top_k_max: 20,
  endpoint_path: '/api/v1/integrations/dify/retrieval',
}

describe('Dify 数据集局部重试', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  async function renderSection() {
    await act(async () => {
      root.render(
        <DifyIntegrationSection
          difyExternalKnowledge={config}
          updateDifyExternalKnowledge={vi.fn()}
        />
      )
    })
  }

  async function waitForText(text: string) {
    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).toContain(text))
    })
  }

  it('首次加载失败后可以在区块内重试并显示数据集', async () => {
    mocks.listAll
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce([{ id: 'dataset-a', name: '产品资料' }])

    await renderSection()
    await waitForText('数据集加载失败，请重试')

    const retryButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('重新加载')
    )
    expect(retryButton).not.toBeUndefined()

    await act(async () => retryButton?.click())
    await waitForText('产品资料')
    expect(mocks.listAll).toHaveBeenCalledTimes(2)
  })

  it('重试请求进行中不会重复发起请求', async () => {
    let resolveRetry: ((value: Array<{ id: string; name: string }>) => void) | undefined
    mocks.listAll
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockImplementationOnce(
        () => new Promise((resolve) => {
          resolveRetry = resolve
        })
      )

    await renderSection()
    await waitForText('数据集加载失败，请重试')
    const retryButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('重新加载')
    )
    expect(retryButton).not.toBeUndefined()

    await act(async () => {
      retryButton?.click()
      retryButton?.click()
    })
    expect(mocks.listAll).toHaveBeenCalledTimes(2)

    await act(async () => resolveRetry?.([{ id: 'dataset-a', name: '产品资料' }]))
    await waitForText('产品资料')
  })
})
