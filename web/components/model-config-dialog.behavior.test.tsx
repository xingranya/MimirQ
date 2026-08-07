// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ModelProvider } from '@/types/models'
import { settingsApi } from '@/lib/api'

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

const unconfiguredProvider: ModelProvider = {
  ...provider,
  id: 'custom',
  name: '自定义服务',
  isConfigured: false,
  models: [],
  config: {
    apiKey: 'new-secret',
    apiBase: 'https://models.example.test/v1',
    model: '',
  },
}

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(document.body.querySelectorAll('button')).find(
    (item) => item.textContent?.trim() === text
  )
  expect(button, `未找到按钮：${text}`).toBeDefined()
  return button as HTMLButtonElement
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
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

    act(() => {
      buttonByText('保存中…').click()
      buttonByText('关闭').click()
    })
    expect(onSave).toHaveBeenCalledOnce()
    expect(onClose).not.toHaveBeenCalled()

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

  it('保存请求异常时只显示可执行的用户提示', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('database connection refused'))
    const onClose = vi.fn()

    await act(async () => {
      root.render(<ModelConfigDialog provider={provider} open onClose={onClose} onSave={onSave} />)
      await Promise.resolve()
    })

    await act(async () => {
      buttonByText('保存配置').click()
      await Promise.resolve()
    })

    expect(onClose).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('保存失败，请检查配置和服务连接后重试。')
    expect(document.body.textContent).not.toContain('database connection refused')
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

  it('从服务获取模型并选择首个返回项', async () => {
    const discover = vi.spyOn(settingsApi, 'discoverModels').mockResolvedValue({
      models: ['current-model', 'next-model'],
    })
    const onSave = vi.fn().mockResolvedValue(true)

    await act(async () => {
      root.render(
        <ModelConfigDialog provider={unconfiguredProvider} open onClose={vi.fn()} onSave={onSave} />
      )
      await Promise.resolve()
    })

    await act(async () => {
      buttonByText('获取模型').click()
      await Promise.resolve()
    })

    expect(discover).toHaveBeenCalledWith(
      expect.objectContaining({
        api_key: 'new-secret',
        api_base: 'https://models.example.test/v1',
        provider: 'custom',
        category: 'model',
      })
    )
    expect(document.body.textContent).toContain('current-model')

    await act(async () => {
      buttonByText('保存配置').click()
      await Promise.resolve()
    })
    expect(onSave).toHaveBeenCalledWith(
      'custom',
      expect.objectContaining({ model: 'current-model' })
    )
  })

  it('模型列表中的未选项可以点击并保存', async () => {
    vi.spyOn(settingsApi, 'discoverModels').mockResolvedValue({
      models: ['current-model', 'next-model'],
    })
    const onSave = vi.fn().mockResolvedValue(true)

    await act(async () => {
      root.render(
        <ModelConfigDialog provider={unconfiguredProvider} open onClose={vi.fn()} onSave={onSave} />
      )
      await Promise.resolve()
    })

    await act(async () => {
      buttonByText('获取模型').click()
      await Promise.resolve()
    })

    await act(async () => {
      buttonByText('current-model').click()
      await Promise.resolve()
    })

    const nextModel = document.body.querySelector(
      '[cmdk-item][data-value="next-model"]'
    ) as HTMLElement
    expect(nextModel).not.toBeNull()
    expect(nextModel.getAttribute('data-disabled')).toBe('false')
    expect(nextModel.className).toContain('data-[disabled=true]:pointer-events-none')
    expect(nextModel.className).not.toContain('data-[disabled]:pointer-events-none')

    await act(async () => {
      nextModel.click()
      await Promise.resolve()
    })
    expect(document.body.textContent).toContain('next-model')

    await act(async () => {
      buttonByText('保存配置').click()
      await Promise.resolve()
    })
    expect(onSave).toHaveBeenCalledWith(
      'custom',
      expect.objectContaining({ model: 'next-model' })
    )
  })

  it('支持手动填写服务未返回的模型名称', async () => {
    const onSave = vi.fn().mockResolvedValue(true)

    await act(async () => {
      root.render(
        <ModelConfigDialog provider={unconfiguredProvider} open onClose={vi.fn()} onSave={onSave} />
      )
      await Promise.resolve()
    })

    act(() => buttonByText('手动填写').click())
    const modelInput = document.body.querySelector(
      'input[placeholder="例如：qwen3:8b"]'
    ) as HTMLInputElement
    expect(modelInput).not.toBeNull()

    await act(async () => {
      setInputValue(modelInput, 'private-model-v2')
      await Promise.resolve()
    })

    await act(async () => {
      buttonByText('保存配置').click()
      await Promise.resolve()
    })
    expect(onSave).toHaveBeenCalledWith(
      'custom',
      expect.objectContaining({ model: 'private-model-v2' })
    )
  })
})
