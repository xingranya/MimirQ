// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/groups/group-chips-input', () => ({
  GroupChipsInput: ({ disabled }: { disabled?: boolean }) => (
    <button type="button" disabled={disabled} data-testid="group-input">
      选择成员组
    </button>
  ),
}))

import { DocumentAccessDialog } from './document-access-dialog'

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  ownerId: 'owner-1',
  accessMode: 'partial_members' as const,
  onAccessModeChange: vi.fn(),
  accessGroupIds: [],
  onAccessGroupIdsChange: vi.fn(),
  accessMembersText: '',
  onAccessMembersTextChange: vi.fn(),
  action: vi.fn(),
}

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(document.body.querySelectorAll('button')).find(
    (item) => item.textContent?.trim() === text
  )
  expect(button, `未找到按钮：${text}`).toBeDefined()
  return button as HTMLButtonElement
}

describe('文档权限弹窗', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean
      }
    ).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('权限读取失败时禁用字段和保存并允许重试', async () => {
    const onRetry = vi.fn()
    await act(async () => {
      root.render(
        <DocumentAccessDialog
          {...baseProps}
          accessReady={false}
          accessLoading={false}
          accessError="权限服务暂时不可用"
          onRetry={onRetry}
        />
      )
      await Promise.resolve()
    })

    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(
      '权限服务暂时不可用'
    )
    expect(buttonByText('actions.save').disabled).toBe(true)
    expect(
      (document.body.querySelector('[data-testid="group-input"]') as HTMLButtonElement)
        .disabled
    ).toBe(true)

    act(() => buttonByText('重新加载').click())
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('权限读取成功后恢复编辑和保存', async () => {
    await act(async () => {
      root.render(
        <DocumentAccessDialog
          {...baseProps}
          accessReady
          accessLoading={false}
          accessError={null}
          onRetry={vi.fn()}
        />
      )
      await Promise.resolve()
    })

    expect(buttonByText('actions.save').disabled).toBe(false)
    expect(
      (document.body.querySelector('[data-testid="group-input"]') as HTMLButtonElement)
        .disabled
    ).toBe(false)
    expect(document.body.querySelector('[role="alert"]')).toBeNull()
  })
})
