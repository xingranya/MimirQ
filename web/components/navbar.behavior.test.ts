// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const routerMocks = vi.hoisted(() => ({
  pathname: '/knowledge/similarity',
  prefetch: vi.fn(),
  push: vi.fn(),
}))

const commandMenuStore = vi.hoisted(() => ({
  open: false,
  setOpen: vi.fn(),
}))

const adminTenantAccess = {
  account_id: 'test-account',
  is_active: true,
  is_current: true,
  permissions: [
    'settings.read',
    'settings.write',
    'observability.read',
    'usage.read',
    'audit.read',
    'audit.manage',
    'table_sql.read',
    'lifecycle.manage',
  ],
  role: 'admin',
  tenant_id: 'test-tenant',
}

const tenantAccessMock = vi.hoisted(() => ({
  current: {
    data: undefined as unknown,
  },
}))

const messages: Record<
  string,
  string | ((values?: Record<string, unknown>) => string)
> = {
  'actions.newConversation': 'actions.newConversation',
  'auth.goToLogin': 'auth.goToLogin',
  'auth.login': 'auth.login',
  'auth.logout': 'auth.logout',
  'brand.tagline': 'brand.tagline',
  'command.triggerHint': 'command.triggerHint',
  'command.triggerLabel': 'command.triggerLabel',
  'deps.openStatus': 'deps.openStatus',
  'deps.ready': 'deps.ready',
  'deps.unavailable': 'deps.unavailable',
  'items.ragVisualization': 'items.ragVisualization',
  'items.knowledgeBase': 'items.knowledgeBase',
  'items.members': 'items.members',
  'sections.analysis': 'sections.analysis',
  'sections.conversation': 'sections.conversation',
  'sections.current': 'sections.current',
  'sections.entryCount': (values) => `count:${String(values?.count ?? '')}`,
  'sections.knowledge': 'sections.knowledge',
  'sections.system': 'sections.system',
  'status.badgePrefix': 'status.badgePrefix:',
  'toolbar.navLabel': 'toolbar.navLabel',
  'toolbar.appearance': '界面外观',
  'toolbar.appearanceHint': (values) => `${String(values?.count ?? '')} 种风格`,
  'toolbar.collapse': 'toolbar.collapse',
  'toolbar.expand': 'toolbar.expand',
  'toolbar.sidebarClose': 'toolbar.sidebarClose',
  'user.offlineEnvironment': 'user.offlineEnvironment',
  'user.openSettings': 'user.openSettings',
  'user.unauthenticatedName': 'user.unauthenticatedName',
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const value = messages[key]
    if (typeof value === 'function') return value(values)
    return value ?? key
  },
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    children,
    href,
    prefetch: _prefetch,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string
    prefetch?: boolean
  }) => React.createElement('a', { href, ...props }, children),
  usePathname: () => routerMocks.pathname,
  useRouter: () => ({
    prefetch: routerMocks.prefetch,
    push: routerMocks.push,
  }),
}))

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    isDevMode: true,
    logout: vi.fn(),
    user: null,
  }),
}))

vi.mock('@/hooks/use-backend-meta', () => ({
  useBackendMeta: () => ({
    data: { features: { auth_mode: 'jwt' } },
  }),
  useBackendMetaDetails: () => ({
    data: null,
  }),
}))

vi.mock('@/hooks/use-backend-ready', () => ({
  useBackendReady: () => ({
    data: null,
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    isError: false,
  }),
}))

vi.mock('@/hooks/use-tenant-access', () => ({
  useTenantAccess: () => tenantAccessMock.current,
}))

vi.mock('@/store/command-menu', () => ({
  useCommandMenuState: (
    selector: (state: typeof commandMenuStore) => unknown
  ) => selector(commandMenuStore),
}))

vi.mock('@/components/mode-toggle', () => ({
  ModeToggle: () =>
    React.createElement('div', { 'data-testid': 'mode-toggle' }),
}))

vi.mock('@/components/theme-customizer', () => ({
  ThemeCustomizer: ({ trigger }: { trigger?: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'appearance-customizer' }, trigger),
}))

vi.mock('@/components/task-center', () => ({
  TaskCenter: () => React.createElement('div', { 'data-testid': 'task-center' }),
}))

vi.mock('@/components/ui/status-badge', () => ({
  StatusBadge: ({ label }: { label: string }) =>
    React.createElement('div', null, label),
}))

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  PopoverContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}))

import { Navbar } from './navbar'

const ControlledNavbar = Navbar as React.ComponentType<{
  isSidebarOpen?: boolean
  setSidebarOpen?: (open: boolean) => void
  isMobile?: boolean
  mobileTriggerRef?: React.RefObject<HTMLButtonElement | null>
}>

function MobileNavbarHarness() {
  const [isOpen, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement | null>(null)

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'button',
      { ref: triggerRef, type: 'button', onClick: () => setOpen(true) },
      '打开侧栏'
    ),
    React.createElement(ControlledNavbar, {
      isSidebarOpen: isOpen,
      setSidebarOpen: setOpen,
      isMobile: true,
      mobileTriggerRef: triggerRef,
    })
  )
}

function renderComponent(element: React.ReactElement) {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(element)
  })

  return {
    container,
    unmount() {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

describe('Navbar behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routerMocks.pathname = '/knowledge/similarity'
    commandMenuStore.open = false
    commandMenuStore.setOpen = vi.fn()
    tenantAccessMock.current = { data: adminTenantAccess }
    window.localStorage.clear()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    })
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('keeps the advanced similarity route out of the primary sidebar', () => {
    const view = renderComponent(React.createElement(Navbar))

    const knowledgeSection = view.container.querySelector(
      'button[aria-controls="sidebar-section-knowledge"]'
    )
    const analysisSection = view.container.querySelector(
      'button[aria-controls="sidebar-section-analysis"]'
    )
    const knowledgeBaseLink = Array.from(
      view.container.querySelectorAll('a')
    ).find((node) => node.textContent?.includes('items.knowledgeBase'))
    const evaluationsLink = Array.from(view.container.querySelectorAll('a')).find(
      (node) => node.textContent?.includes('items.ragas')
    )
    const ragVisualizationLink = Array.from(view.container.querySelectorAll('a')).find(
      (node) => node.textContent?.includes('items.ragVisualization')
    )

    // 当前徽标移除后，通过分组展开状态确认活动区域。
    const analysisToggle = view.container.querySelector(
      'button[aria-controls="sidebar-section-analysis"]'
    ) as HTMLButtonElement
    expect(analysisToggle?.getAttribute('aria-expanded')).toBe('true')
    expect(knowledgeBaseLink?.getAttribute('aria-current')).toBeNull()
    expect(evaluationsLink?.getAttribute('aria-current')).toBe('page')
    expect(ragVisualizationLink).toBeUndefined()

    view.unmount()
  })

  it('向管理员展示成员管理入口', () => {
    const view = renderComponent(React.createElement(Navbar))
    const memberLink = Array.from(view.container.querySelectorAll('a')).find(
      (node) => node.getAttribute('href') === '/settings/rbac'
    )

    expect(memberLink?.textContent).toContain('items.members')
    view.unmount()
  })

  it('成员组及详情页继续高亮成员权限入口', () => {
    routerMocks.pathname = '/settings/groups/group-a'
    const view = renderComponent(React.createElement(Navbar))
    const memberLink = Array.from(view.container.querySelectorAll('a')).find(
      (node) => node.getAttribute('href') === '/settings/rbac'
    )
    const settingsLink = Array.from(view.container.querySelectorAll('a')).find(
      (node) => node.getAttribute('href') === '/settings'
    )

    expect(memberLink?.getAttribute('aria-current')).toBe('page')
    expect(settingsLink?.getAttribute('aria-current')).toBeNull()
    view.unmount()
  })

  it('offers appearance customization from the global navigation', () => {
    const view = renderComponent(React.createElement(Navbar))

    const appearance = view.container.querySelector('[data-testid="appearance-customizer"]')
    expect(appearance).not.toBeNull()
    expect(appearance?.textContent).toContain('界面外观')
    expect(appearance?.querySelector('button')?.getAttribute('class')).toContain('flex-1')
    expect(view.container.querySelector('[data-testid="mode-toggle"]')).not.toBeNull()

    view.unmount()
  })

  it('keeps a usable 56px desktop rail while collapsed', () => {
    const setSidebarOpen = vi.fn()
    const view = renderComponent(
      React.createElement(ControlledNavbar, { isSidebarOpen: false, setSidebarOpen })
    )

    const nav = view.container.querySelector('#mimirq-sidebar')
    const brandLink = view.container.querySelector('a[aria-label="SEEWAY 见外"]')
    const expandButton = view.container.querySelector(
      'button[aria-label="toolbar.expand"]'
    ) as HTMLButtonElement

    expect(nav?.getAttribute('class')).toContain('md:w-14')
    expect(brandLink?.textContent).toBe('S')
    expect(expandButton).not.toBeNull()

    act(() => {
      expandButton.click()
    })
    expect(setSidebarOpen).toHaveBeenCalledWith(true)

    view.unmount()
  })

  it('移动端在动画帧暂停时仍转移焦点，并在 Escape 关闭后返回触发按钮', () => {
    vi.useFakeTimers()
    vi.mocked(window.requestAnimationFrame).mockImplementation(() => 1)

    const view = renderComponent(React.createElement(MobileNavbarHarness))
    const trigger = Array.from(view.container.querySelectorAll('button')).find(
      (button) => button.textContent === '打开侧栏'
    ) as HTMLButtonElement
    act(() => {
      trigger.focus()
      trigger.click()
    })

    act(() => vi.advanceTimersByTime(0))

    const primaryAction = Array.from(view.container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('actions.newConversation')
    ) as HTMLButtonElement
    expect(document.activeElement).toBe(primaryAction)

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    act(() => vi.advanceTimersByTime(0))

    expect(document.activeElement).toBe(trigger)
    expect(view.container.querySelector('#mimirq-sidebar')?.getAttribute('class')).toContain('-translate-x-full')

    view.unmount()
  })

  it('跨移动端断点时同步更新折叠侧栏的 inert 状态', () => {
    let matches = false
    const listeners = new Set<(event: MediaQueryListEvent) => void>()
    const mediaQueryList = {
      get matches() {
        return matches
      },
      media: '(max-width: 767.98px)',
      onchange: null,
      addEventListener: (
        _type: 'change',
        listener: (event: MediaQueryListEvent) => void
      ) => listeners.add(listener),
      removeEventListener: (
        _type: 'change',
        listener: (event: MediaQueryListEvent) => void
      ) => listeners.delete(listener),
      addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeListener: (listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
      dispatchEvent: () => true,
    } as MediaQueryList
    vi.mocked(window.matchMedia).mockReturnValue(mediaQueryList)

    const view = renderComponent(
      React.createElement(ControlledNavbar, {
        isSidebarOpen: false,
        setSidebarOpen: vi.fn(),
      })
    )
    const nav = view.container.querySelector('#mimirq-sidebar') as HTMLElement & { inert: boolean }

    expect(nav.inert).toBe(false)

    act(() => {
      matches = true
      const event = { matches, media: mediaQueryList.media } as MediaQueryListEvent
      listeners.forEach((listener) => listener(event))
    })
    expect(nav.inert).toBe(true)

    act(() => {
      matches = false
      const event = { matches, media: mediaQueryList.media } as MediaQueryListEvent
      listeners.forEach((listener) => listener(event))
    })
    expect(nav.inert).toBe(false)

    view.unmount()
  })

  it('跨路由重新挂载保持侧栏滚动位置', () => {
    window.localStorage.setItem('mimirq_navbar_scroll_top_v1', '128')
    const firstView = renderComponent(React.createElement(Navbar))
    const firstScrollArea = firstView.container.querySelector<HTMLElement>('[data-sidebar-scroll-container="true"]')
    expect(firstScrollArea?.scrollTop).toBe(128)

    act(() => {
      if (!firstScrollArea) return
      firstScrollArea.scrollTop = 240
      firstScrollArea.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    expect(window.localStorage.getItem('mimirq_navbar_scroll_top_v1')).toBe('240')
    firstView.unmount()

    const secondView = renderComponent(React.createElement(Navbar))
    const secondScrollArea = secondView.container.querySelector<HTMLElement>('[data-sidebar-scroll-container="true"]')
    expect(secondScrollArea?.scrollTop).toBe(240)
    secondView.unmount()
  })

  it('preserves manually collapsed sections across remounts while opening the active section', () => {
    routerMocks.pathname = '/'

    const firstView = renderComponent(React.createElement(Navbar))
    const conversationToggle = firstView.container.querySelector(
      'button[aria-controls="sidebar-section-conversation"]'
    ) as HTMLButtonElement
    const knowledgeToggle = firstView.container.querySelector(
      'button[aria-controls="sidebar-section-knowledge"]'
    ) as HTMLButtonElement

    act(() => {
      conversationToggle.click()
      knowledgeToggle.click()
    })

    firstView.unmount()

    routerMocks.pathname = '/graph'

    const secondView = renderComponent(React.createElement(Navbar))
    const conversationSection = secondView.container.querySelector(
      '#sidebar-section-conversation'
    )
    const knowledgeSection = secondView.container.querySelector(
      '#sidebar-section-knowledge'
    )
    const analysisToggle = secondView.container.querySelector(
      'button[aria-controls="sidebar-section-analysis"]'
    ) as HTMLButtonElement
    const analysisSection = secondView.container.querySelector(
      '#sidebar-section-analysis'
    )

    // 活动路由所在的分析分组应自动展开。
    expect(analysisToggle.getAttribute('aria-expanded')).toBe('true')
    expect(analysisSection?.getAttribute('class')).toContain('grid-rows-[1fr]')
    expect(conversationSection?.getAttribute('class')).toContain('grid-rows-[0fr]')
    expect(knowledgeSection?.getAttribute('class')).toContain('grid-rows-[0fr]')

    secondView.unmount()
  })

  it('keeps permission-gated navigation stable across hydration when tenant access is client-cached', async () => {
    routerMocks.pathname = '/usage'
    tenantAccessMock.current = { data: undefined }
    const html = renderToString(React.createElement(Navbar))

    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)
    tenantAccessMock.current = { data: adminTenantAccess }

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    let root: ReturnType<typeof hydrateRoot> | null = null

    await act(async () => {
      root = hydrateRoot(container, React.createElement(Navbar))
      await Promise.resolve()
    })

    const errorOutput = consoleError.mock.calls.map((call) => call.join(' ')).join('\n')
    expect(errorOutput).not.toContain('Hydration failed')

    await act(async () => {
      root?.unmount()
    })
    container.remove()
  })
})
