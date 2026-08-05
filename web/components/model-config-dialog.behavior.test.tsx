// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ModelProvider } from '@/types/models'

import { ModelConfigDialog } from './model-config-dialog'

const provider: ModelProvider = {
  id: 'openai',
  name: 'OpenAI',
  description: '对话模型',
  icon: 'openai',
  color: 'emerald',
  category: 'model',
  isConfigured: true,
  models: [
    {
      id: 'model-1',
      name: 'model-1',
      displayName: 'Model 1',
      type: 'chat',
    },
  ],
  config: {
    apiKey: 'saved-secret',
    apiBase: 'https://api.example.test/v1',
    model: 'model-1',
  },
}

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(document.body.querySelectorAll('button')).find(
    (item) => item.textContent?.trim() === text
  )
  expect(button, `未找到按钮：${text}`).toBeDefined()
  return button as HTMLButtonElement
}

describe('模型配置弹窗保存行为', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
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

  it('保存失败时保持弹窗和输入内容', async () => {
    let resolveSave: ((saved: boolean) => void) | undefined
    const onSave = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSave = resolve
        })
    )
    const onClose = vi.fn()

    await act(async () => {
      root.render(<ModelConfigDialog provider={provider} open onClose={onClose} onSave={onSave} />)
      await Promise.resolve()
    })

    await act(async () => {
      buttonByText('保存配置').click()
      await Promise.resolve()
    })
    expect(onSave).toHaveBeenCalledOnce()
    expect(onClose).not.toHaveBeenCalled()
    expect(buttonByText('保存中…').disabled).toBe(true)

    await act(async () => {
      resolveSave?.(false)
      await Promise.resolve()
    })

    expect(onClose).not.toHaveBeenCalled()
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.body.textContent).toContain('保存失败，请检查配置和服务连接后重试。')
    expect((document.body.querySelector('input[type="password"]') as HTMLInputElement).value).toBe(
      'saved-secret'
    )
  })

  it('保存成功后才关闭弹窗', async () => {
    const onSave = vi.fn().mockResolvedValue(true)
    const onClose = vi.fn()

    await act(async () => {
      root.render(<ModelConfigDialog provider={provider} open onClose={onClose} onSave={onSave} />)
      await Promise.resolve()
    })

    await act(async () => {
      buttonByText('保存配置').click()
      await Promise.resolve()
    })

    expect(onSave).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
