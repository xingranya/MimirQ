// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  NAVIGATION_HISTORY_INDEX_KEY,
  NavigationGuardProvider,
  useGuardedNavigation,
  useUnsavedChanges,
} from './navigation-guard-provider'

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}))

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => navigationMocks,
}))

function GuardHarness({ dirty }: Readonly<{ dirty: boolean }>) {
  useUnsavedChanges(dirty)
  const navigation = useGuardedNavigation()

  return (
    <>
      <button type="button" onClick={() => navigation.push('/knowledge')}>
        打开知识库
      </button>
      <button type="button" onClick={() => navigation.run(() => navigationMocks.push('/auth'))}>
        退出登录
      </button>
    </>
  )
}

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(globalThis.document.querySelectorAll('button')).find(
    (item) => item.textContent?.trim() === text
  )
  expect(button, `未找到按钮：${text}`).toBeDefined()
  return button as HTMLButtonElement
}

describe('NavigationGuardProvider', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    navigationMocks.push.mockReset()
    navigationMocks.replace.mockReset()
    globalThis.window.history.replaceState({}, '', '/settings')
    container = globalThis.document.createElement('div')
    globalThis.document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    globalThis.document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  async function renderGuard(dirty: boolean) {
    await act(async () => {
      root.render(
        <NavigationGuardProvider>
          <GuardHarness dirty={dirty} />
        </NavigationGuardProvider>
      )
      await Promise.resolve()
    })
  }

  it('没有未保存修改时立即执行程序化导航', async () => {
    await renderGuard(false)

    act(() => buttonByText('打开知识库').click())

    expect(navigationMocks.push).toHaveBeenCalledWith('/knowledge')
    expect(globalThis.document.body.textContent).not.toContain('放弃未保存的修改？')
  })

  it('程序化导航与附带动作均在确认后执行', async () => {
    await renderGuard(true)

    act(() => buttonByText('打开知识库').click())
    expect(navigationMocks.push).not.toHaveBeenCalled()
    expect(globalThis.document.body.textContent).toContain('放弃未保存的修改？')

    act(() => buttonByText('放弃修改').click())
    expect(navigationMocks.push).toHaveBeenCalledWith('/knowledge')

    act(() => buttonByText('退出登录').click())
    expect(navigationMocks.push).toHaveBeenCalledOnce()
    act(() => buttonByText('放弃修改').click())
    expect(navigationMocks.push).toHaveBeenLastCalledWith('/auth')
  })

  it('拦截应用内链接和页面刷新，取消后保持当前页面', async () => {
    await renderGuard(true)
    const anchor = globalThis.document.createElement('a')
    anchor.href = '/history'
    anchor.textContent = '对话历史'
    globalThis.document.body.appendChild(anchor)

    let clickEvent: MouseEvent | undefined
    act(() => {
      clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true })
      anchor.dispatchEvent(clickEvent)
    })
    expect(clickEvent?.defaultPrevented).toBe(true)
    expect(navigationMocks.push).not.toHaveBeenCalled()

    const unloadEvent = new Event('beforeunload', { cancelable: true })
    globalThis.window.dispatchEvent(unloadEvent)
    expect(unloadEvent.defaultPrevented).toBe(true)

    act(() => buttonByText('继续编辑').click())
    expect(navigationMocks.push).not.toHaveBeenCalled()
  })

  it('不拦截外链、组合键新窗口和当前页锚点', async () => {
    await renderGuard(true)
    const externalAnchor = globalThis.document.createElement('a')
    externalAnchor.href = 'https://example.com/docs'
    const internalAnchor = globalThis.document.createElement('a')
    internalAnchor.href = '/knowledge'
    const hashAnchor = globalThis.document.createElement('a')
    hashAnchor.href = '#settings-runtime'
    globalThis.document.body.append(externalAnchor, internalAnchor, hashAnchor)

    const externalClick = new MouseEvent('click', { bubbles: true, cancelable: true })
    externalAnchor.dispatchEvent(externalClick)
    const modifiedClick = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      metaKey: true,
    })
    internalAnchor.dispatchEvent(modifiedClick)
    const hashClick = new MouseEvent('click', { bubbles: true, cancelable: true })
    hashAnchor.dispatchEvent(hashClick)

    expect(externalClick.defaultPrevented).toBe(false)
    expect(modifiedClick.defaultPrevented).toBe(false)
    expect(hashClick.defaultPrevented).toBe(false)
    expect(globalThis.document.body.textContent).not.toContain('放弃未保存的修改？')
  })

  it('浏览器历史跳转先恢复当前位置，确认后只重放一次', async () => {
    await renderGuard(true)
    const historyGo = vi.spyOn(globalThis.window.history, 'go').mockImplementation(() => undefined)
    globalThis.window.history.pushState({}, '', '/knowledge')

    act(() => {
      globalThis.window.dispatchEvent(
        new PopStateEvent('popstate', {
          state: { [NAVIGATION_HISTORY_INDEX_KEY]: 0 },
        })
      )
    })

    expect(historyGo).toHaveBeenCalledWith(1)
    expect(globalThis.document.body.textContent).toContain('放弃未保存的修改？')
    expect(buttonByText('放弃修改').disabled).toBe(true)

    act(() => {
      globalThis.window.dispatchEvent(
        new PopStateEvent('popstate', {
          state: { [NAVIGATION_HISTORY_INDEX_KEY]: 1 },
        })
      )
    })

    expect(buttonByText('放弃修改').disabled).toBe(false)
    act(() => buttonByText('放弃修改').click())
    expect(historyGo).toHaveBeenLastCalledWith(-1)
    expect(historyGo).toHaveBeenCalledTimes(2)
  })

  it('浏览器前进同样先恢复当前位置，确认后再继续', async () => {
    await renderGuard(true)
    const historyGo = vi.spyOn(globalThis.window.history, 'go').mockImplementation(() => undefined)
    globalThis.window.history.pushState({}, '', '/knowledge')

    act(() => {
      globalThis.window.dispatchEvent(
        new PopStateEvent('popstate', {
          state: { [NAVIGATION_HISTORY_INDEX_KEY]: 2 },
        })
      )
    })

    expect(historyGo).toHaveBeenCalledWith(-1)
    expect(buttonByText('放弃修改').disabled).toBe(true)
    act(() => {
      globalThis.window.dispatchEvent(
        new PopStateEvent('popstate', {
          state: { [NAVIGATION_HISTORY_INDEX_KEY]: 1 },
        })
      )
    })
    expect(buttonByText('放弃修改').disabled).toBe(false)
    act(() => buttonByText('放弃修改').click())
    expect(historyGo).toHaveBeenLastCalledWith(1)
    expect(historyGo).toHaveBeenCalledTimes(2)
  })
})
