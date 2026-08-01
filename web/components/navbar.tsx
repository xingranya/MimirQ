/**
 * 左侧固定导航栏组件
 */
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type UIEvent,
} from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import {
  Activity,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  History,
  Layers,
  LogIn,
  LogOut,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Palette,
  Plus,
  Search,
  Settings,
  Share2,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { readClientStorage, writeClientStorage } from '@/lib/client-storage'
import { cn } from '@/lib/utils'
import { BRAND_CONFIG } from '@/lib/brand'
import { ModeToggle } from '@/components/mode-toggle'
import { ThemeCustomizer } from '@/components/theme-customizer'
import { TaskCenter } from '@/components/task-center'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/hooks/use-auth'
import { useBackendMetaDetails } from '@/hooks/use-backend-meta'
import { useBackendReady } from '@/hooks/use-backend-ready'
import { useTenantAccess } from '@/hooks/use-tenant-access'
import { useCommandMenuState } from '@/store/command-menu'
import { TENANT_PERMISSIONS, tenantAccessAllows, type TenantPermission } from '@/lib/tenant-permissions'
import { canShowAdminControlledNavigationModule, type AdminControlledNavigationModule } from '@/lib/navigation-visibility'
import { UI_LAYER_CLASS } from '@/lib/ui-layers'

type SectionId = 'conversation' | 'knowledge' | 'analysis' | 'system'

type MenuItem = {
  icon: React.ComponentType<{ className?: string }>
  labelKey: string
  href: string
  requiredPermission?: TenantPermission
  visibilityKey?: AdminControlledNavigationModule
}

type MenuSection = {
  id: SectionId
  titleKey: string
  items: MenuItem[]
}

// 一级导航只保留高频任务，低频入口继续由命令搜索承载。
const menuSections: MenuSection[] = [
  {
    id: 'conversation',
    titleKey: 'sections.conversation',
    items: [
      { icon: MessageSquare, labelKey: 'items.conversation', href: '/' },
      { icon: History, labelKey: 'items.history', href: '/history' },
    ],
  },
  {
    id: 'knowledge',
    titleKey: 'sections.knowledge',
    items: [
      { icon: Layers, labelKey: 'items.datasets', href: '/datasets' },
      { icon: Database, labelKey: 'items.knowledgeBase', href: '/knowledge' },
      { icon: Activity, labelKey: 'items.ingestion', href: '/knowledge/ingestion' },
      { icon: FileText, labelKey: 'items.parsing', href: '/parsing' },
      { icon: ShieldCheck, labelKey: 'items.dataGovernance', href: '/data-governance' },
    ],
  },
  {
    id: 'analysis',
    titleKey: 'sections.analysis',
    items: [
      { icon: Share2, labelKey: 'items.knowledgeGraph', href: '/graph', visibilityKey: 'knowledgeGraph' },
      { icon: BarChart3, labelKey: 'items.ragas', href: '/evaluations', visibilityKey: 'ragas' },
      { icon: FileText, labelKey: 'items.reports', href: '/reports', visibilityKey: 'reports' },
    ],
  },
  {
    id: 'system',
    titleKey: 'sections.system',
    items: [
      { icon: Activity, labelKey: 'items.diagnostics', href: '/diagnostics', requiredPermission: TENANT_PERMISSIONS.OBSERVABILITY_READ },
      { icon: Settings, labelKey: 'items.settings', href: '/settings', requiredPermission: TENANT_PERMISSIONS.SETTINGS_READ },
    ],
  },
]

const DEFAULT_OPEN_SECTIONS = new Set<SectionId>(['conversation', 'knowledge'])
const OPEN_SECTIONS_STORAGE_KEY = 'mimirq_navbar_open_sections_v3'
const NAV_SCROLL_STORAGE_KEY = 'mimirq_navbar_scroll_top_v1'
const NAVIGATION_PARENT_ROUTES: Record<string, string> = {
  '/knowledge/similarity': '/evaluations',
}

function isActiveRoute(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

function getMostSpecificActiveHref(pathname: string, items: MenuItem[]): string | null {
  let activeHref: string | null = null

  for (const item of items) {
    if (!isActiveRoute(pathname, item.href)) continue
    if (activeHref === null || item.href.length > activeHref.length) {
      activeHref = item.href
    }
  }

  return activeHref
}

function sectionHasActiveRoute(activeHref: string | null, items: MenuItem[]) {
  if (!activeHref) return false
  return items.some((item) => item.href === activeHref)
}

function trimmedPrimitiveString(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value).trim()
  return ''
}

function formatDepStatus(status: unknown): { label: string; className: string } {
  const label = trimmedPrimitiveString(status) || 'unknown'
  const lower = label.toLowerCase()
  if (lower === 'connected' || lower === 'ready') {
    return { label: '正常', className: 'text-success' }
  }
  if (lower === 'disabled') {
    return { label: '未启用', className: 'text-muted-foreground' }
  }
  if (lower === 'not_configured') {
    return { label: '未配置', className: 'text-muted-foreground' }
  }
  if (lower === 'unknown') {
    return { label: '未知', className: 'text-muted-foreground' }
  }
  return { label: '异常', className: 'text-destructive' }
}

function createInitialOpenSections(): Record<SectionId, boolean> {
  return menuSections.reduce<Record<SectionId, boolean>>(
    (sections, section) => {
      sections[section.id] = DEFAULT_OPEN_SECTIONS.has(section.id)
      return sections
    },
    {
      conversation: false,
      knowledge: false,
      analysis: false,
      system: false,
    }
  )
}

function sanitizeOpenSections(value: unknown): Record<SectionId, boolean> {
  const fallback = createInitialOpenSections()
  if (!value || typeof value !== 'object') return fallback

  const candidate = value as Partial<Record<SectionId, unknown>>
  return {
    conversation: typeof candidate.conversation === 'boolean' ? candidate.conversation : fallback.conversation,
    knowledge: typeof candidate.knowledge === 'boolean' ? candidate.knowledge : fallback.knowledge,
    analysis: typeof candidate.analysis === 'boolean' ? candidate.analysis : fallback.analysis,
    system: typeof candidate.system === 'boolean' ? candidate.system : fallback.system,
  }
}

function loadOpenSections(): Record<SectionId, boolean> {
  if (globalThis.window === undefined) return createInitialOpenSections()

  try {
    const raw = readClientStorage(OPEN_SECTIONS_STORAGE_KEY)
    if (!raw) return createInitialOpenSections()
    return sanitizeOpenSections(JSON.parse(raw))
  } catch {
    return createInitialOpenSections()
  }
}

export function Navbar({
  isSidebarOpen: externalIsOpen,
  setSidebarOpen: externalSetOpen,
  mobileTriggerRef,
}: Readonly<{
  isSidebarOpen?: boolean
  setSidebarOpen?: (isOpen: boolean) => void
  mobileTriggerRef?: RefObject<HTMLButtonElement | null>
}> = {}) {
  const navRef = useRef<HTMLElement | null>(null)
  const navScrollRef = useRef<HTMLDivElement | null>(null)
  const toggleButtonRef = useRef<HTMLButtonElement | null>(null)
  const firstActionRef = useRef<HTMLButtonElement | null>(null)
  const focusTimerRef = useRef<number | null>(null)
  const prevIsSidebarOpenRef = useRef<boolean | null>(null)
  const restoreToggleFocusOnCloseRef = useRef(false)
  const [internalIsOpen, setInternalIsOpen] = useState(true)
  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>(createInitialOpenSections)
  const [hasHydratedOpenSections, setHasHydratedOpenSections] = useState(false)
  const [hasHydratedNavigationAccess, setHasHydratedNavigationAccess] = useState(false)
  const isSidebarOpen = externalIsOpen ?? internalIsOpen
  const setSidebarOpen = externalSetOpen ?? setInternalIsOpen
  const pathname = usePathname()
  const router = useRouter()
  const { user, isAuthenticated, isDevMode, logout } = useAuth()
  const t = useTranslations('Navbar')
  const { data: backendMeta } = useBackendMetaDetails()
  const backendReady = useBackendReady()
  const tenantAccess = useTenantAccess()
  const navigationTenantAccess = hasHydratedNavigationAccess ? tenantAccess.data : undefined
  const allowDevNavigation = hasHydratedNavigationAccess && isDevMode
  const commandMenuOpen = useCommandMenuState((state) => state.open)
  const setCommandMenuOpen = useCommandMenuState((state) => state.setOpen)
  const canAccessPermission = useCallback(
    (permission?: TenantPermission) =>
      !permission || allowDevNavigation || tenantAccessAllows(navigationTenantAccess, permission),
    [allowDevNavigation, navigationTenantAccess]
  )
  const canShowNavigationModule = useCallback(
    (moduleKey?: AdminControlledNavigationModule) =>
      !moduleKey || allowDevNavigation || canShowAdminControlledNavigationModule(navigationTenantAccess, moduleKey),
    [allowDevNavigation, navigationTenantAccess]
  )
  const visibleMenuSections = useMemo(
    () =>
      menuSections
        .map((section) => ({
          ...section,
          items: section.items.filter(
            (item) => canAccessPermission(item.requiredPermission) && canShowNavigationModule(item.visibilityKey)
          ),
        }))
        .filter((section) => section.items.length > 0),
    [canAccessPermission, canShowNavigationModule]
  )
  const visibleMenuItems = useMemo(() => visibleMenuSections.flatMap((section) => section.items), [visibleMenuSections])
  const activePathname = NAVIGATION_PARENT_ROUTES[pathname] || pathname
  const activeHref = getMostSpecificActiveHref(activePathname, visibleMenuItems)
  const readyDetails = backendReady.data ?? null
  const backendOk =
    typeof readyDetails?.ok === 'boolean' ? readyDetails.ok : backendReady.isError ? false : null
  const backendStatus = backendOk === true ? 'completed' : backendOk === false ? 'failed' : 'processing'
  const backendStatusLabel = backendOk === true ? '正常' : backendOk === false ? '异常' : '检查中'
  const lastReadyAt = Math.max(backendReady.dataUpdatedAt || 0, backendReady.errorUpdatedAt || 0) || null
  const closeSidebarOnMobile = useCallback(() => {
    if (globalThis.window === undefined) return
    try {
      if (globalThis.window.matchMedia('(max-width: 768px)').matches) setSidebarOpen(false)
    } catch {
      // 浏览器不支持媒体查询时保持当前侧栏状态。
    }
  }, [setSidebarOpen])
  const toggleSection = useCallback((sectionId: SectionId) => {
    setOpenSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }))
  }, [])
  const handleSidebarToggle = useCallback(() => {
    if (isSidebarOpen) {
      restoreToggleFocusOnCloseRef.current =
        restoreToggleFocusOnCloseRef.current || document.activeElement === toggleButtonRef.current
    } else {
      restoreToggleFocusOnCloseRef.current = false
    }
    setSidebarOpen(!isSidebarOpen)
  }, [isSidebarOpen, setSidebarOpen])

  const focusAfterInertStateChange = useCallback((resolveTarget: () => HTMLElement | null | undefined) => {
    if (focusTimerRef.current !== null) {
      globalThis.window.clearTimeout(focusTimerRef.current)
    }

    // effect 完成后再聚焦，避免 inert 提交覆盖焦点；后台标签页也不能依赖动画帧。
    focusTimerRef.current = globalThis.window.setTimeout(() => {
      focusTimerRef.current = null
      resolveTarget()?.focus({ preventScroll: true })
    }, 0)
  }, [])

  useEffect(() => () => {
    if (focusTimerRef.current !== null) {
      globalThis.window.clearTimeout(focusTimerRef.current)
    }
  }, [])

  // 移动端侧栏隐藏时禁止焦点进入，桌面折叠图标栏仍保持可操作。
  useEffect(() => {
    const el = navRef.current as (HTMLElement & { inert: boolean }) | null
    if (!el) return
    let isMobile = false
    try {
      isMobile = globalThis.window.matchMedia('(max-width: 768px)').matches
    } catch {
      isMobile = false
    }
    const inertNow = !isSidebarOpen && isMobile
    try {
      el.inert = inertNow
    } catch {
      // 部分旧浏览器不支持 inert，保留原有焦点行为。
    }
  }, [isSidebarOpen])

  // 移动端支持使用 Escape 关闭覆盖层。
  useEffect(() => {
    if (!isSidebarOpen) return
    if (globalThis.window === undefined) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (e.key !== 'Escape') return
      try {
        // 仅在窄屏下按覆盖层处理。
        if (!globalThis.window.matchMedia('(max-width: 768px)').matches) return
      } catch {
        return
      }
      e.preventDefault()
      restoreToggleFocusOnCloseRef.current = true
      setSidebarOpen(false)
    }

    globalThis.window.addEventListener('keydown', onKeyDown)
    return () => globalThis.window.removeEventListener('keydown', onKeyDown)
  }, [isSidebarOpen, setSidebarOpen])

  // 键盘操作侧栏时，在展开和收起后恢复到可预期的焦点位置。
  useEffect(() => {
    if (globalThis.window === undefined) return
    if (prevIsSidebarOpenRef.current === null) {
      prevIsSidebarOpenRef.current = isSidebarOpen
      return
    }

    const prev = prevIsSidebarOpenRef.current
    prevIsSidebarOpenRef.current = isSidebarOpen
    if (prev === isSidebarOpen) return

    const active = document.activeElement
    if (isSidebarOpen) {
      // 仅在用户通过键盘触发展开时把焦点移入侧栏。
      const openedFromKnownTrigger =
        active === toggleButtonRef.current || active === mobileTriggerRef?.current
      if (active && active !== document.body && !openedFromKnownTrigger) return
      focusAfterInertStateChange(() => firstActionRef.current)
      return
    }

    const navEl = navRef.current
    const shouldRestore =
      !active || active === document.body || Boolean(navEl && active instanceof Node && navEl.contains(active))
    const shouldRestoreToggleFocus = restoreToggleFocusOnCloseRef.current
    restoreToggleFocusOnCloseRef.current = false
    if (!shouldRestore || !shouldRestoreToggleFocus) return

    focusAfterInertStateChange(() => {
      const isMobile = globalThis.window.matchMedia('(max-width: 768px)').matches
      return isMobile ? mobileTriggerRef?.current : toggleButtonRef.current
    })
  }, [focusAfterInertStateChange, isSidebarOpen, mobileTriggerRef])

  useEffect(() => {
    setOpenSections(loadOpenSections())
    setHasHydratedOpenSections(true)
    // 保持服务端渲染和首次客户端渲染结构一致，避免租户权限缓存导致链接顺序变化。
    setHasHydratedNavigationAccess(true)
  }, [])

  useEffect(() => {
    const activeSection = visibleMenuSections.find((section) => sectionHasActiveRoute(activeHref, section.items))
    if (!activeSection) return

    setOpenSections((current) => {
      if (current[activeSection.id]) return current
      return {
        ...current,
        [activeSection.id]: true,
      }
    })
  }, [activeHref, visibleMenuSections])

  useEffect(() => {
    if (!hasHydratedOpenSections) return
    if (globalThis.window === undefined) return
    writeClientStorage(OPEN_SECTIONS_STORAGE_KEY, JSON.stringify(openSections))
  }, [hasHydratedOpenSections, openSections])

  useEffect(() => {
    if (!hasHydratedOpenSections) return
    const scrollContainer = navScrollRef.current
    if (!scrollContainer) return
    const storedScrollTop = Number(readClientStorage(NAV_SCROLL_STORAGE_KEY))
    if (!Number.isFinite(storedScrollTop) || storedScrollTop <= 0) return

    const frame = globalThis.requestAnimationFrame(() => {
      scrollContainer.scrollTop = storedScrollTop
    })
    return () => globalThis.cancelAnimationFrame(frame)
  }, [hasHydratedOpenSections])

  const handleNavScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    writeClientStorage(NAV_SCROLL_STORAGE_KEY, String(event.currentTarget.scrollTop))
  }, [])

  // 开发环境空闲时预取路由资源，降低首次导航等待时间。
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    if (globalThis.window === undefined) return
    if (globalThis.navigator?.webdriver) return
    const key = '__mimirq_routes_prefetched__'
    const routeCache = globalThis.window as typeof globalThis.window & Record<string, boolean>
    if (routeCache[key]) return
    routeCache[key] = true

    const hrefs = visibleMenuItems.map((i) => i.href).filter(Boolean)
    const prefetchAll = () => {
      for (const href of hrefs) {
        if (href === pathname) continue
        try {
          router.prefetch(href)
        } catch {
          // 单个路由预取失败不影响导航。
        }
      }
    }

    // 优先使用浏览器空闲时间，避免阻塞首次渲染。
    const w = globalThis.window as Window & {
      requestIdleCallback?: (
        callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void,
        options?: { timeout?: number }
      ) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(prefetchAll, { timeout: 2000 })
      return () => w.cancelIdleCallback?.(id)
    }

    const t = setTimeout(prefetchAll, 800)
    return () => clearTimeout(t)
  }, [router, pathname, visibleMenuItems])

  const authMode = String(backendMeta?.features?.auth_mode || '')
  const vectorBackend = String(
    backendMeta?.features?.vector_backend || readyDetails?.vector?.backend || ''
  )
  const buildSha = String(backendMeta?.build?.sha || '')
  const buildShaShort = buildSha ? buildSha.slice(0, 8) : ''
  const checkedAtLabel = lastReadyAt ? new Date(lastReadyAt).toLocaleTimeString() : '—'

  const depRows: Array<{ key: string; status: unknown; note?: string; error?: unknown }> = readyDetails
    ? [
        {
          key: '数据库',
          status: readyDetails.database?.status,
          error: readyDetails.database?.error,
        },
        {
          key: `向量库 (${String(readyDetails.vector?.backend || vectorBackend || '-')})`,
          status: readyDetails.vector?.status,
          error: readyDetails.vector?.error,
        },
        {
          key: '缓存服务',
          status: readyDetails.redis?.status,
          note: (() => {
            const r = readyDetails.redis
            if (!r) return undefined
            if (!r.enabled) return '未启用'
            const required = Boolean(r.required)
            const cache = Boolean(r.embedding_cache_enabled)
            return `${required ? '必须' : '可选'}${cache ? '，已启用向量缓存' : ''}`
          })(),
          error: readyDetails.redis?.error,
        },
        {
          key: '文件存储',
          status: readyDetails.minio?.status,
          note: (() => {
            const m = readyDetails.minio
            if (!m) return undefined
            if (!m.enabled) return '未启用'
            return m.bucket ? `存储桶：${m.bucket}` : undefined
          })(),
          error: readyDetails.minio?.error,
        },
      ]
    : []

  const userDisplayName =
    user?.username || user?.email || (isDevMode ? t('user.developerMode') : t('user.unauthenticatedName'))
  const userStatusLine = isAuthenticated ? user?.email || t('user.onlineStatus') : t('user.offlineEnvironment')
  const canOpenSettings = canAccessPermission(TENANT_PERMISSIONS.SETTINGS_READ)
  const canOpenDiagnostics = canAccessPermission(TENANT_PERMISSIONS.OBSERVABILITY_READ)

  return (
    <>
      {/* 移动端遮罩 */}
      {isSidebarOpen ? (
        <button
          type="button"
          aria-label={t('toolbar.sidebarClose')}
          className={cn(
            'fixed inset-0 border-0 bg-black/35 p-0 transition-opacity focus:outline-none md:hidden',
            UI_LAYER_CLASS.navigationOverlay
          )}
          onClick={() => {
            restoreToggleFocusOnCloseRef.current = false
            setSidebarOpen(false)
          }}
        />
      ) : null}

      <nav
        id="mimirq-sidebar"
        ref={navRef}
        aria-label={t('toolbar.navLabel')}
        className={cn(
          'peer flex-shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col transition-[width,transform] duration-200 ease-out',
          UI_LAYER_CLASS.navigation,
          'fixed inset-y-0 left-0 md:relative', // 移动端固定覆盖，桌面端参与布局。
          isSidebarOpen ? 'w-56 translate-x-0' : 'w-56 -translate-x-full md:w-14 md:translate-x-0 md:overflow-hidden'
        )}
      >
        {!isSidebarOpen ? (
          <TooltipProvider delayDuration={250}>
            <div className="hidden h-full w-14 flex-col items-center gap-2 py-2 md:flex">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/"
                    aria-label={BRAND_CONFIG.standardName}
                    className="flex size-10 items-center justify-center rounded-md border border-border bg-card text-base font-bold text-primary focus-ring"
                  >
                    S
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{BRAND_CONFIG.standardName}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    size="icon"
                    onClick={() => router.push('/')}
                    aria-label={t('actions.newConversation')}
                  >
                    <Plus className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{t('actions.newConversation')}</TooltipContent>
              </Tooltip>

              <div className="my-1 h-px w-8 bg-border" />
              <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto py-1 no-scrollbar">
                {visibleMenuItems.map((item) => {
                  const Icon = item.icon
                  const isActive = activeHref === item.href
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>
                        <Link
                          href={item.href}
                          prefetch={false}
                          aria-label={t(item.labelKey)}
                          aria-current={isActive ? 'page' : undefined}
                          className={cn(
                            'relative flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors focus-ring',
                            isActive ? 'bg-primary/10 text-primary before:absolute before:left-0 before:h-5 before:w-0.5 before:bg-primary' : 'hover:bg-muted hover:text-foreground'
                          )}
                        >
                          <Icon className="size-4" />
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">{t(item.labelKey)}</TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>

              <TaskCenter compact side="right" align="end" />

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    ref={toggleButtonRef}
                    variant="ghost"
                    size="icon"
                    aria-controls="mimirq-sidebar"
                    aria-expanded={false}
                    aria-label={t('toolbar.expand')}
                    onClick={handleSidebarToggle}
                  >
                    <PanelLeftOpen className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{t('toolbar.expand')}</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        ) : null}

        <div className={cn('min-h-0 flex-1 flex-col', isSidebarOpen ? 'flex' : 'hidden')}>
          {/* 品牌区 */}
          <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-3">
            <Link href="/" className="flex min-w-0 flex-1 items-center rounded-md focus-ring">
              <Image
                src={BRAND_CONFIG.wordmarkSrc}
                alt={BRAND_CONFIG.standardName}
                width={300}
                height={80}
                priority
                unoptimized
                className="h-8 w-auto max-w-[132px] object-contain"
              />
            </Link>
            <Button
              ref={toggleButtonRef}
              variant="ghost"
              size="icon"
              className="hidden size-9 shrink-0 md:inline-flex"
              onClick={handleSidebarToggle}
              aria-controls="mimirq-sidebar"
              aria-expanded={true}
              aria-label={t('toolbar.collapse')}
              title={t('toolbar.collapse')}
            >
              <PanelLeftClose className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 shrink-0 md:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label={t('toolbar.sidebarClose')}
              title={t('toolbar.sidebarClose')}
            >
              <PanelLeftClose className="size-4" />
            </Button>
          </div>

        {/* 新对话按钮 */}
        <div className="px-3 pb-2 pt-3">
          <Button
            ref={firstActionRef}
            variant="default"
            className="h-10 w-full justify-start gap-2 px-3 font-semibold"
            onClick={() => {
              router.push('/')
              closeSidebarOnMobile()
            }}
          >
            <Plus className="size-4" />
            <span>{t('actions.newConversation')}</span>
          </Button>
        </div>

        <div className="px-3 pb-2">
          <button
            type="button"
            className="flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-ring"
            onClick={() => {
              setCommandMenuOpen(true)
              closeSidebarOnMobile()
            }}
            aria-label={t('command.triggerLabel')}
            aria-haspopup="dialog"
            aria-expanded={commandMenuOpen}
            aria-controls="mimirq-command-menu"
            title={t('command.triggerLabel')}
          >
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{t('command.triggerLabel')}</span>
            <kbd className="rounded border border-border bg-card px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">⌘K</kbd>
          </button>
        </div>

        {/* 导航区独立滚动，短视口下仍可访问全部入口。 */}
        <div
          ref={navScrollRef}
          data-sidebar-scroll-container="true"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-1 no-scrollbar"
          onScroll={handleNavScroll}
        >
          <div className="space-y-2">
            {visibleMenuSections.map((section) => {
              const isOpen = openSections[section.id] ?? false
              const hasActiveItem = sectionHasActiveRoute(activeHref, section.items)
              const ToggleIcon = isOpen ? ChevronDown : ChevronRight

              return (
                <section key={section.id} className="space-y-1">
                  <button
                    type="button"
                    className={cn(
                      'flex h-8 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-xs font-medium transition-colors focus-ring',
                      hasActiveItem
                        ? 'text-primary'
                        : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground'
                    )}
                    onClick={() => toggleSection(section.id)}
                    aria-expanded={isOpen}
                    aria-controls={`sidebar-section-${section.id}`}
                  >
                    <span className="truncate">{t(section.titleKey)}</span>
                    <ToggleIcon className="size-3.5 shrink-0" aria-hidden="true" />
                  </button>

                  <div
                    id={`sidebar-section-${section.id}`}
                    className={cn(
                      'grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out',
                      isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="space-y-1 pb-1">
                        {section.items.map((item) => {
                          const Icon = item.icon
                          const isActive = activeHref === item.href

                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              prefetch={false}
                              onClick={closeSidebarOnMobile}
                              aria-current={isActive ? 'page' : undefined}
                              className={cn(
                                'group relative flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors focus-ring',
                                'before:pointer-events-none before:absolute before:bottom-2 before:left-0 before:top-2 before:w-0.5 before:rounded-full',
                                isActive
                                  ? 'bg-primary/10 font-medium text-primary before:bg-primary'
                                  : 'text-muted-foreground before:bg-transparent hover:bg-sidebar-accent hover:text-sidebar-foreground'
                              )}
                            >
                              <Icon className="size-4 shrink-0" aria-hidden="true" />
                              <span className="truncate">{t(item.labelKey)}</span>
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </section>
              )
            })}
          </div>
        </div>

        {/* 底部信息 */}
        <div className="border-t border-sidebar-border bg-sidebar p-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={isAuthenticated ? t('user.openSettings') : t('auth.goToLogin')}
              title={isAuthenticated ? t('user.openSettings') : t('auth.goToLogin')}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left transition-colors hover:bg-sidebar-accent focus-ring"
              onClick={() => {
                if (isAuthenticated) {
                  router.push(canOpenSettings ? '/settings' : '/')
                } else {
                  router.push('/auth')
                }
                closeSidebarOnMobile()
              }}
            >
              <div className="relative flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-card text-sm font-bold text-primary">
                <span aria-hidden="true">
                  S
                </span>
                {isAuthenticated && (
                  <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-sidebar bg-success" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-sidebar-foreground">
                  {userDisplayName}
                </p>
                <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
                  {userStatusLine}
                </p>
              </div>
            </button>
            <div className="flex flex-col gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-8 hover:bg-sidebar-accent hover:text-destructive"
                onClick={() => {
                  if (isAuthenticated) {
                    logout()
                    return
                  }
                  router.push('/auth')
                }}
                title={isAuthenticated ? t('auth.logout') : t('auth.login')}
                aria-label={isAuthenticated ? t('auth.logout') : t('auth.login')}
              >
                {isAuthenticated ? (
                  <LogOut className="size-4" />
                ) : (
                  <LogIn className="size-4" />
                )}
              </Button>
              <ModeToggle />
            </div>
          </div>

          <div className="mt-2 flex items-center gap-1">
            <ThemeCustomizer
              trigger={
                <Button
                  variant="ghost"
                  className="h-8 min-w-0 flex-1 justify-start gap-2 px-2 text-xs font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  title={t('toolbar.appearance')}
                  aria-label={t('toolbar.appearance')}
                >
                  <Palette className="size-4" aria-hidden="true" />
                  <span>{t('toolbar.appearance')}</span>
                </Button>
              }
            />
            {isSidebarOpen ? <TaskCenter compact side="right" align="end" /> : null}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="rounded-md focus-ring"
                  aria-label={t('deps.openStatus')}
                  title={t('deps.openStatus')}
                >
                  <StatusBadge
                    status={backendStatus}
                    label={`服务：${backendStatusLabel}`}
                    dense
                  />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" side="top" className="w-80">
                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{t('deps.ready')}</p>
                    <span
                      className={cn(
                        'font-medium',
                        backendOk === true
                          ? 'text-success'
                          : backendOk === false
                            ? 'text-destructive'
                            : 'text-muted-foreground'
                      )}
                    >
                      {backendStatusLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] text-muted-foreground">
                    <div className="flex items-center justify-between gap-2">
                      <span>认证</span>
                      <span className="text-foreground">{authMode || '-'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>向量库</span>
                      <span className="text-foreground">{vectorBackend || '-'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>版本</span>
                      <span className="font-mono text-foreground">{buildShaShort || '-'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>检查时间</span>
                      <span className="text-foreground">{checkedAtLabel}</span>
                    </div>
                  </div>

                  <div className="border-t border-border pt-2.5">
                    {readyDetails ? (
                      <div className="space-y-2">
                        {depRows.map((row) => {
                          const st = formatDepStatus(row.status)
                          const errText = trimmedPrimitiveString(row.error)
                          return (
                            <div key={row.key} className="space-y-0.5">
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-medium text-foreground">{row.key}</span>
                                <span className={cn("font-medium", st.className)}>{st.label}</span>
                              </div>
                              {row.note ? <div className="text-[11px] text-muted-foreground">{row.note}</div> : null}
                              {errText ? (
                                <div
                                  className="text-[11px] text-muted-foreground max-w-[260px] truncate"
                                  title={errText}
                                >
                                  {errText}
                                </div>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">{t('deps.unavailable')}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    {canOpenDiagnostics ? (
                      <Link href="/diagnostics" className="text-[11px] text-primary hover:underline">
                        {t('deps.diagnosticsLink')}
                      </Link>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">仅管理员可查看诊断</span>
                    )}
                    <span className="text-[11px] text-muted-foreground">{t('deps.requestIdHint')}</span>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        </div>
      </nav>
    </>
  )
}
