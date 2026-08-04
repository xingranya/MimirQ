/**
 * 设置页面 - 系统配置管理
 */
'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { TenantPermissionGate } from '@/components/auth/tenant-permission-gate'
import { AppFrame } from '@/components/app-frame'
import { ModelConfigDialog } from '@/components/model-config-dialog'
import { Button } from '@/components/ui/button'
import { PageScaffold } from '@/components/ui/page-scaffold'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useChunkStrategyPreference } from '@/contexts/chunk-strategy-context'
import { useParserBackendPreference } from '@/contexts/parser-backend-context'
import { FeatureFlagsSection } from './_sections/feature-flags-section'
import { DifyIntegrationSection } from './_sections/dify-integration-section'
import { FrontendPreferencesSection } from './_sections/frontend-preferences-section'
import { GovernanceSection } from './_sections/governance-section'
import { IndustryRulesSection } from './_sections/industry-rules-section'
import { LtrModelRegistrySection } from './_sections/ltr-model-registry-section'
import { ModelProvidersSection } from './_sections/model-providers-section'
import { NavigationVisibilitySection } from './_sections/navigation-visibility-section'
import { ObservabilitySection } from './_sections/observability-section'
import { ObjectStorageSection } from './_sections/object-storage-section'
import { ParserServicesSection } from './_sections/parser-services-section'
import { RagSection } from './_sections/rag-section'
import { RuntimeControlsSection } from './_sections/runtime-controls-section'
import { SystemStatusSection } from './_sections/system-status-section'
import { UrlIngestSection } from './_sections/url-ingest-section'
import { useSettingsPageState } from './use-settings-page-state'
import {
  SETTINGS_SECTIONS,
  type SettingsSectionDefinition,
} from './settings-sections'
import { SettingsSwitchIndicator } from '@/components/settings/settings-switch'
import {
  CheckCircle2,
  ChevronDown,
  Network,
  RefreshCw,
  Save,
  Search,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TENANT_PERMISSIONS } from '@/lib/tenant-permissions'
import { useTenantAccess } from '@/hooks/use-tenant-access'
import { useUnsavedNavigationGuard } from '@/hooks/use-unsaved-navigation-guard'
import { useRouter } from '@/i18n/navigation'
import { tenantAccessIsAdmin } from '@/lib/navigation-visibility'
import { settingsTextTokens } from '@/components/ui/system-page-tokens'

const SETTINGS_SECTION_BY_ID = Object.fromEntries(
  SETTINGS_SECTIONS.map((section) => [section.id, section])
) as Record<string, SettingsSectionDefinition>
const SETTINGS_CARD_CLASS =
  'rounded-lg border border-border bg-background'
const SETTINGS_OUTLINE_BUTTON =
  'size-8 rounded-md border-border bg-background p-0 text-foreground hover:bg-muted'
const SETTINGS_PRIMARY_BUTTON =
  'h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50'

type SettingsPageState = ReturnType<typeof useSettingsPageState>
type ParserBackendPreference = ReturnType<typeof useParserBackendPreference>
type ChunkStrategyPreference = ReturnType<typeof useChunkStrategyPreference>
type SettingsContentProps = {
  state: SettingsPageState
  isAdmin: boolean
  settingsWritable: boolean
  parserBackend: ParserBackendPreference['parserBackend']
  setParserBackend: ParserBackendPreference['setParserBackend']
  chunkStrategy: ChunkStrategyPreference['chunkStrategy']
  setChunkStrategy: ChunkStrategyPreference['setChunkStrategy']
}

function SettingsSaveFeedback({
  message,
}: Readonly<{
  message: { type: 'success' | 'error'; text: string; detail?: string }
}>) {
  if (message.type === 'error') {
    return (
      <Alert
        variant="destructive"
        className="rounded-lg border-destructive/25 bg-destructive/10 shadow-none"
      >
        <XCircle className="size-4" />
        <div>
          <AlertTitle>保存失败</AlertTitle>
          <AlertDescription className="text-foreground/80">
            {message.text}
          </AlertDescription>
        </div>
      </Alert>
    )
  }

  return (
    <div className="rounded-lg border border-success/25 bg-success/10 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-success/15 text-success">
          <CheckCircle2 className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">已保存</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{message.text}</p>
          {message.detail ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {message.detail}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function UnsavedSettingsDialog({
  open,
  onOpenChange,
  onDiscard,
}: Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  onDiscard: () => void
}>) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle>
          <AlertDialogDescription>
            当前设置尚未保存。继续后，这些修改将丢失。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>继续编辑</AlertDialogCancel>
          <AlertDialogAction onClick={onDiscard}>放弃修改</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function SettingsSaveBar({
  state,
  settingsWritable,
}: Readonly<{ state: SettingsPageState; settingsWritable: boolean }>) {
  if (!settingsWritable) return null

  return (
    <div
      data-testid="settings-save-bar"
      className="sticky bottom-0 z-10 mt-6 flex min-h-14 flex-col gap-3 border-t border-border bg-background px-1 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div aria-live="polite">
        <p className="text-sm font-medium text-foreground">
          {state.hasChanges
            ? `${state.dirtySectionCount} 组设置未保存`
            : '所有设置已保存'}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {state.hasChanges ? '保存后对后续请求生效' : '当前配置与系统一致'}
        </p>
      </div>
      <Button
        onClick={state.saveSettings}
        disabled={!state.hasChanges || state.saving}
        className={cn(SETTINGS_PRIMARY_BUTTON, 'w-full sm:w-auto')}
      >
        <Save
          className={cn(
            'size-4',
            state.saving && 'animate-pulse motion-reduce:animate-none'
          )}
        />
        {state.saving ? '保存中...' : '保存配置'}
      </Button>
    </div>
  )
}

type EnhancementCardProps = {
  title: string
  description: string
  icon: LucideIcon
  checked: boolean
  onToggle: () => void
  tone: 'blue' | 'emerald'
  tags: string[]
}

function EnhancementCard({
  title,
  description,
  icon: Icon,
  checked,
  onToggle,
  tone,
  tags,
}: Readonly<EnhancementCardProps>) {
  const toneClass =
    tone === 'emerald'
      ? {
          card: checked
            ? 'border-success/30 bg-success/10'
            : 'border-border/60 bg-card',
          icon: checked
            ? 'bg-success/15 text-success'
            : 'bg-muted text-muted-foreground',
        }
      : {
          card: checked
            ? 'border-primary/30 bg-primary/10'
            : 'border-border/60 bg-card',
          icon: checked
            ? 'bg-primary/15 text-primary'
            : 'bg-muted text-muted-foreground',
        }

  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={onToggle}
      className={cn(
        'group flex min-h-[54px] w-full items-center justify-between gap-3 rounded-[13px] border px-3 py-2 text-left transition-[border-color,background-color,box-shadow] duration-150 focus-ring hover:border-primary/30 motion-reduce:transition-none',
        toneClass.card
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-[10px]',
            toneClass.icon
          )}
        >
          <Icon className="size-3.5" />
        </span>
        <span className="min-w-0">
          <span className="block text-[12px] font-semibold leading-4 text-foreground">
            {title}
          </span>
          <span className="mt-0.5 block truncate text-[10.5px] font-medium leading-4 text-muted-foreground">
            {description}
          </span>
          {tags.length > 0 ? (
            <span className="mt-1 flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-border/60 bg-card/80 px-1.5 py-0.5 text-[10px] font-medium leading-[14px] text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </span>
          ) : null}
        </span>
      </span>
      <SettingsSwitchIndicator checked={checked} />
    </button>
  )
}

function RetrievalEnhancementSection({ state }: Readonly<{ state: SettingsPageState }>) {
  const bm25Enabled = Boolean(state.ragMerged?.bm25_index_enabled)
  const kgEnabled = state.getFeatureValue('kg_enabled')

  return (
    <section className="rounded-[16px] border border-border/60 bg-card/82 p-3.5 shadow-sm">
      <div className="mb-2.5">
        <h2 className="text-[13px] font-semibold text-foreground">
          关键词增强配置
        </h2>
        <p className="mt-0.5 text-[11.5px] font-medium leading-[18px] text-muted-foreground">
          绑定后端 RAG 与 KG 开关，控制关键词索引和图谱增强是否参与检索
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-2">
        <EnhancementCard
          title="BM25 关键词索引"
          description="启用关键词通道，对精确词匹配、标题和结构化段落更友好"
          icon={Search}
          checked={bm25Enabled}
          onToggle={() => state.updateRag({ bm25_index_enabled: !bm25Enabled })}
          tone="blue"
          tags={['RAG 配置', '真实后端字段']}
        />
        <EnhancementCard
          title="KG 知识图谱"
          description="启用实体、事件与关系索引，作为 RAG 上下文增强来源"
          icon={Network}
          checked={kgEnabled}
          onToggle={() => state.toggleFeature('kg_enabled')}
          tone="emerald"
          tags={['Feature Flag', 'KG_ENABLED']}
        />
      </div>
    </section>
  )
}

function useSettingsScrollSpy(sectionIds: readonly string[]) {
  const [activeId, setActiveId] = useState(sectionIds[0] || '')
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    observerRef.current?.disconnect()
    if (sectionIds.length === 0) {
      setActiveId('')
      return
    }
    setActiveId((current) => (sectionIds.includes(current) ? current : sectionIds[0]))

    const visibleMap = new Map<string, number>()
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visibleMap.set(entry.target.id, entry.intersectionRatio)
        }
        let best = sectionIds[0]
        let bestRatio = -1
        for (const id of sectionIds) {
          const ratio = visibleMap.get(id) ?? 0
          if (ratio > bestRatio) {
            bestRatio = ratio
            best = id
          }
        }
        if (bestRatio > 0) setActiveId(best)
      },
      {
        root: document.querySelector('[data-page-scroll-container]'),
        threshold: [0, 0.1, 0.25, 0.5],
      }
    )

    for (const id of sectionIds) {
      const el = document.getElementById(id)
      if (el) observerRef.current.observe(el)
    }

    return () => observerRef.current?.disconnect()
  }, [sectionIds])

  return activeId
}

function SettingsSectionFrame({
  section,
  children,
  className,
}: Readonly<{
  section: SettingsSectionDefinition
  children: ReactNode
  className?: string
}>) {
  return (
    <section
      id={section.id}
      aria-labelledby={`${section.id}-title`}
      className={cn(
        'scroll-mt-24 border-b border-border pb-8',
        className
      )}
    >
      <div className="border-b border-border px-1 pb-3">
        <div className="min-w-0">
          <h2
            id={`${section.id}-title`}
            className={cn(settingsTextTokens.sectionTitle, 'leading-tight')}
          >
            {section.label}
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {section.hint}
          </p>
        </div>
      </div>
      <div className="space-y-6 pt-5">{children}</div>
    </section>
  )
}

function SettingsSubsection({
  title,
  children,
  advanced = false,
}: Readonly<{
  title: string
  children: ReactNode
  advanced?: boolean
}>) {
  if (advanced) {
    return (
      <details
        data-testid="settings-advanced-section"
        className="group border-t border-border pt-3"
      >
        <summary className="flex cursor-pointer list-none select-none items-center justify-between gap-3 py-1 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <span>{title}</span>
          <span className="flex shrink-0 items-center gap-2 text-xs font-normal text-muted-foreground">
            高级配置
            <ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
          </span>
        </summary>
        <div className="pt-4">{children}</div>
      </details>
    )
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {children}
    </section>
  )
}

export default function SettingsPage() {
  return (
    <TenantPermissionGate
      permission={TENANT_PERMISSIONS.SETTINGS_READ}
      pageName="系统设置"
    >
      <SettingsPageContent />
    </TenantPermissionGate>
  )
}

function SettingsPageContent() {
  const state = useSettingsPageState()
  const router = useRouter()
  const [refreshConfirmOpen, setRefreshConfirmOpen] = useState(false)
  const access = useTenantAccess()
  const isAdmin = tenantAccessIsAdmin(access.data)
  const { parserBackend, setParserBackend } = useParserBackendPreference()
  const { chunkStrategy, setChunkStrategy } = useChunkStrategyPreference()
  const navigate = useCallback((href: string) => router.push(href), [router])
  const navigationGuard = useUnsavedNavigationGuard({
    enabled: state.hasChanges,
    onNavigate: navigate,
  })
  const refreshSettings = useCallback(() => {
    if (state.hasChanges) {
      setRefreshConfirmOpen(true)
      return
    }
    state.refreshAll()
  }, [state])

  return (
    <AppFrame>
      <PageScaffold
        title="设置"
        iconImage="settings"
        description="见外传媒知识库"
        size="full"
        compact
        density="system-dense"
        topClassName="pb-2.5"
        bodyClassName="pt-0.5"
        top={
          <div className="space-y-2">
            {state.loadError ? (
              <Alert
                variant="destructive"
                className="rounded-lg border-destructive/25 bg-destructive/10 shadow-none"
              >
                <XCircle className="size-4" />
                <div>
                  <AlertTitle>加载失败</AlertTitle>
                  <AlertDescription className="text-foreground/80">
                    {state.loadError}
                  </AlertDescription>
                </div>
              </Alert>
            ) : null}
            {state.saveMessage ? (
              <SettingsSaveFeedback message={state.saveMessage} />
            ) : null}
            {!state.loading && !state.settingsWritable ? (
              <Alert className="rounded-lg border-border bg-muted/40 shadow-none">
                <AlertTitle>只读模式</AlertTitle>
                <AlertDescription className="text-foreground/80">
                  当前账号可以查看系统设置，只有系统所有者可以修改。
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        }
        actions={
          <>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={refreshSettings}
                    disabled={state.loading}
                    className={SETTINGS_OUTLINE_BUTTON}
                    aria-label="刷新设置"
                  >
                    <RefreshCw
                      className={cn(
                        'size-4',
                        state.loading && 'animate-spin motion-reduce:animate-none'
                      )}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>刷新设置</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        }
      >
        {state.loading ? (
          <div className="flex h-64 items-center justify-center">
            <RefreshCw className="size-8 animate-spin text-muted-foreground motion-reduce:animate-none" />
          </div>
        ) : (
          <>
            <SettingsContent
              state={state}
              isAdmin={isAdmin}
              settingsWritable={state.settingsWritable}
              parserBackend={parserBackend}
              setParserBackend={setParserBackend}
              chunkStrategy={chunkStrategy}
              setChunkStrategy={setChunkStrategy}
            />
            <SettingsSaveBar
              state={state}
              settingsWritable={state.settingsWritable}
            />
          </>
        )}
      </PageScaffold>

      <ModelConfigDialog
        provider={state.selectedProvider}
        open={state.dialogOpen && state.settingsWritable}
        onClose={() => state.setDialogOpen(false)}
        onSave={state.handleSaveConfig}
      />
      <UnsavedSettingsDialog
        open={navigationGuard.navigationPending}
        onOpenChange={(open) => {
          if (!open) navigationGuard.cancelNavigation()
        }}
        onDiscard={navigationGuard.confirmNavigation}
      />
      <UnsavedSettingsDialog
        open={refreshConfirmOpen}
        onOpenChange={setRefreshConfirmOpen}
        onDiscard={() => {
          setRefreshConfirmOpen(false)
          state.refreshAll()
        }}
      />
    </AppFrame>
  )
}

function SettingsContent({
  state,
  isAdmin,
  settingsWritable,
  parserBackend,
  setParserBackend,
  chunkStrategy,
  setChunkStrategy,
}: Readonly<SettingsContentProps>) {
  const [searchQuery, setSearchQuery] = useState('')
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase('zh-CN')
  const visibleSections = useMemo(
    () =>
      normalizedSearchQuery
        ? SETTINGS_SECTIONS.filter((section) =>
            [section.label, section.hint, ...section.keywords]
              .join(' ')
              .toLocaleLowerCase('zh-CN')
              .includes(normalizedSearchQuery)
          )
        : SETTINGS_SECTIONS,
    [normalizedSearchQuery]
  )
  const visibleSectionIds = useMemo(
    () => visibleSections.map((section) => section.id),
    [visibleSections]
  )
  const visibleSectionIdSet = useMemo(
    () => new Set(visibleSectionIds),
    [visibleSectionIds]
  )
  const activeId = useSettingsScrollSpy(visibleSectionIds)

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    const main = document.getElementById('main-content')
    const scrollContainer = document.querySelector<HTMLElement>('[data-page-scroll-container]')
    if (!scrollContainer) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    // 设置索引只滚动页面正文，避免 scrollIntoView 连带移动应用壳层。
    main?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    const containerRect = scrollContainer.getBoundingClientRect()
    const targetRect = el.getBoundingClientRect()
    const nextTop = targetRect.top - containerRect.top + scrollContainer.scrollTop - 8
    scrollContainer.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' })
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">搜索设置</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            data-testid="settings-search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索设置"
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        {visibleSections.length > 0 ? (
          <Select value={activeId || undefined} onValueChange={scrollTo}>
            <SelectTrigger
              data-testid="settings-mobile-group-select"
              className="w-full sm:w-64 lg:hidden"
              aria-label="选择设置分组"
            >
              <SelectValue placeholder="选择设置分组" />
            </SelectTrigger>
            <SelectContent>
              {visibleSections.map((section) => (
                <SelectItem key={section.id} value={section.id}>
                  {section.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {visibleSections.length === 0 ? (
        <div
          data-testid="settings-search-empty"
          className="flex min-h-48 items-center justify-center border-y border-border px-6 text-center"
        >
          <div>
            <p className="text-sm font-medium text-foreground">没有匹配的设置</p>
            <p className="mt-1 text-xs text-muted-foreground">请尝试搜索功能名称或服务名称</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[208px_minmax(0,1fr)]">
          <nav
            aria-label="设置分组"
            className={cn(
              SETTINGS_CARD_CLASS,
              'sticky top-4 hidden shrink-0 self-start p-1.5 lg:block'
            )}
          >
            <ul className="space-y-0.5">
              {visibleSections.map((section) => (
                <li key={section.id}>
                  <button
                    type="button"
                    onClick={() => scrollTo(section.id)}
                    aria-current={activeId === section.id ? 'location' : undefined}
                    className={cn(
                      'relative w-full rounded-md px-3 py-2 text-left text-xs font-medium leading-5 transition-colors',
                      activeId === section.id
                        ? 'bg-primary/10 text-primary before:absolute before:bottom-2 before:left-0 before:top-2 before:w-px before:bg-primary'
                        : 'text-foreground/78 hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {section.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0 space-y-8">
            {visibleSectionIdSet.has('settings-runtime') ? (
              <SettingsSectionFrame section={SETTINGS_SECTION_BY_ID['settings-runtime']}>
                <SettingsSubsection title="系统状态">
                  {state.status ? (
                    <SystemStatusSection
                      status={state.status}
                      backendMeta={state.backendMeta}
                    />
                  ) : null}
                </SettingsSubsection>
                <fieldset disabled={!settingsWritable} className="contents">
                  <SettingsSubsection title="运行控制" advanced>
                    <RuntimeControlsSection
                      chat={state.chatMerged}
                      updateChat={state.updateChat}
                      cache={state.cacheMerged}
                      updateCache={state.updateCache}
                      safety={state.safetyMerged}
                      updateSafety={state.updateSafety}
                      langgraph={state.langGraphMerged}
                      updateLangGraph={state.updateLangGraph}
                    />
                  </SettingsSubsection>
                </fieldset>
              </SettingsSectionFrame>
            ) : null}

            {visibleSectionIdSet.has('settings-models') ? (
              <SettingsSectionFrame section={SETTINGS_SECTION_BY_ID['settings-models']}>
                <fieldset disabled={!settingsWritable} className="contents">
                  <SettingsSubsection title="模型接入">
                    <ModelProvidersSection
                      groupedProviders={state.groupedProviders}
                      onConfigure={state.handleConfigure}
                    />
                  </SettingsSubsection>
                  {isAdmin ? (
                    <SettingsSubsection title="对象存储" advanced>
                      <ObjectStorageSection
                        minio={state.minioMerged}
                        updateMinIO={state.updateMinIO}
                      />
                    </SettingsSubsection>
                  ) : null}
                  {isAdmin ? (
                    <SettingsSubsection title="Dify 接入" advanced>
                      <DifyIntegrationSection
                        difyExternalKnowledge={state.difyExternalKnowledgeMerged}
                        updateDifyExternalKnowledge={state.updateDifyExternalKnowledge}
                      />
                    </SettingsSubsection>
                  ) : null}
                </fieldset>
              </SettingsSectionFrame>
            ) : null}

            {visibleSectionIdSet.has('settings-knowledge') ? (
              <SettingsSectionFrame section={SETTINGS_SECTION_BY_ID['settings-knowledge']}>
                <fieldset disabled={!settingsWritable} className="contents">
                  <SettingsSubsection title="高级解析">
                    <ParserServicesSection
                      mineru={state.mineruMerged}
                      etl4llm={state.etl4llmMerged}
                      marker={state.markerMerged}
                      paddleVl={state.paddleVlMerged}
                      textIn={state.textInMerged}
                      magicPdf={state.magicPdfMerged}
                      updateMinerU={state.updateMinerU}
                      updateEtl4Llm={state.updateEtl4Llm}
                      updateMarker={state.updateMarker}
                      updatePaddleVL={state.updatePaddleVL}
                      updateTextIn={state.updateTextIn}
                      updateMagicPDF={state.updateMagicPDF}
                    />
                  </SettingsSubsection>
                  <SettingsSubsection title="数据治理">
                    <GovernanceSection
                      isGovernanceEnabled={state.isGovernanceEnabled}
                      isPiiAnonymizeEnabled={state.isPiiAnonymizeEnabled}
                      isSecretsRedactEnabled={state.isSecretsRedactEnabled}
                      isQuarantineOnDropEnabled={state.isQuarantineOnDropEnabled}
                      updateGovernance={state.updateGovernance}
                    />
                  </SettingsSubsection>
                  {isAdmin ? (
                    <SettingsSubsection title="URL 采集" advanced>
                      <UrlIngestSection
                        urlIngest={state.urlIngestMerged}
                        updateUrlIngest={state.updateUrlIngest}
                      />
                    </SettingsSubsection>
                  ) : null}
                </fieldset>
                <SettingsSubsection title="行业规则" advanced>
                  <IndustryRulesSection />
                </SettingsSubsection>
              </SettingsSectionFrame>
            ) : null}

            {visibleSectionIdSet.has('settings-retrieval') ? (
              <SettingsSectionFrame section={SETTINGS_SECTION_BY_ID['settings-retrieval']}>
                <fieldset disabled={!settingsWritable} className="contents">
                  <SettingsSubsection title="RAG 配置">
                    <RagSection
                      rag={state.ragMerged}
                      updateRag={state.updateRag}
                      ltrAvailable={state.ltrModels.some((model) => model.active)}
                    />
                  </SettingsSubsection>
                  <SettingsSubsection title="检索增强" advanced>
                    <RetrievalEnhancementSection state={state} />
                    <FeatureFlagsSection
                      editedFeatureFlags={state.editedFeatureFlags}
                      getFeatureValue={state.getFeatureValue}
                      toggleFeature={state.toggleFeature}
                    />
                  </SettingsSubsection>
                  <SettingsSubsection title="LTR 模型" advanced>
                    <LtrModelRegistrySection
                      ltrError={state.ltrError}
                      ltrMessage={state.ltrMessage}
                      ltrUploading={state.ltrUploading}
                      ltrUploadReady={state.ltrUploadReady}
                      ltrUploadResetKey={state.ltrUploadResetKey}
                      ltrLoading={state.ltrLoading}
                      ltrBusyModelId={state.ltrBusyModelId}
                      ltrModels={state.ltrModels}
                      onRegister={state.registerLtrModel}
                      onRefreshList={state.refreshLtrModels}
                      onRollback={state.rollbackLtrModel}
                      onActivate={state.activateLtrModel}
                      onModelFileChange={state.setLtrUploadModelFile}
                      onManifestFileChange={state.setLtrUploadManifestFile}
                      formatBytes={state.formatBytes}
                      formatTime={state.formatTime}
                      shortId={state.shortId}
                    />
                  </SettingsSubsection>
                </fieldset>
              </SettingsSectionFrame>
            ) : null}

            {visibleSectionIdSet.has('settings-platform') ? (
              <SettingsSectionFrame section={SETTINGS_SECTION_BY_ID['settings-platform']}>
                <SettingsSubsection title="前端偏好">
                  <FrontendPreferencesSection
                    parserBackend={parserBackend}
                    setParserBackend={setParserBackend}
                    chunkStrategy={chunkStrategy}
                    setChunkStrategy={setChunkStrategy}
                  />
                </SettingsSubsection>
                <fieldset disabled={!settingsWritable} className="contents">
                  {isAdmin ? (
                    <SettingsSubsection title="导航权限" advanced>
                      <NavigationVisibilitySection
                        navigation={state.navigationMerged}
                        updateNavigation={state.updateNavigation}
                      />
                    </SettingsSubsection>
                  ) : null}
                  {isAdmin ? (
                    <SettingsSubsection title="可观测性" advanced>
                      <ObservabilitySection
                        observability={state.observabilityMerged}
                        updateObservability={state.updateObservability}
                      />
                    </SettingsSubsection>
                  ) : null}
                </fieldset>
              </SettingsSectionFrame>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
