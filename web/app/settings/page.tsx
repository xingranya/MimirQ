/**
 * 设置页面 - 系统配置管理
 */
'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { TenantPermissionGate } from '@/components/auth/tenant-permission-gate'
import { ModelConfigDialog } from '@/components/model-config-dialog'
import { Button } from '@/components/ui/button'
import { PageScaffold } from '@/components/ui/page-scaffold'
import { QueryErrorState } from '@/components/ui/query-error-state'
import { UnsavedChangesDialog } from '@/components/ui/unsaved-changes-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useChunkStrategyPreference } from '@/contexts/chunk-strategy-context'
import { useParserBackendPreference } from '@/contexts/parser-backend-context'
import { FeatureFlagsSection } from './_sections/feature-flags-section'
import { DifyIntegrationSection } from './_sections/dify-integration-section'
import { FrontendPreferencesSection } from './_sections/frontend-preferences-section'
import { GovernanceSection } from './_sections/governance-section'
import { IndustryRulesSummarySection } from './_sections/industry-rules-summary-section'
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
  findSettingsSectionMatches,
  SETTINGS_SECTIONS,
  type SettingsSectionDefinition,
} from './settings-sections'
import { SettingsSubsection } from './settings-subsection'
import { CheckCircle2, RefreshCw, Save, Search, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TENANT_PERMISSIONS } from '@/lib/tenant-permissions'
import { useTenantAccess } from '@/hooks/use-tenant-access'
import { useUnsavedChanges } from '@/components/providers/navigation-guard-provider'
import { tenantAccessIsAdmin } from '@/lib/navigation-visibility'
import { settingsTextTokens } from '@/components/ui/system-page-tokens'

const SETTINGS_SECTION_BY_ID = Object.fromEntries(
  SETTINGS_SECTIONS.map((section) => [section.id, section])
) as Record<string, SettingsSectionDefinition>
const SETTINGS_CARD_CLASS = 'rounded-lg border border-border bg-background'
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
          <AlertDescription className="text-foreground/80">{message.text}</AlertDescription>
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
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{message.detail}</p>
          ) : null}
        </div>
      </div>
    </div>
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
          {state.hasChanges ? `${state.dirtySectionCount} 组设置未保存` : '所有设置已保存'}
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
          className={cn('size-4', state.saving && 'animate-pulse motion-reduce:animate-none')}
        />
        {state.saving ? '保存中...' : '保存配置'}
      </Button>
    </div>
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
      className={cn('scroll-mt-24 border-b border-border pb-8', className)}
    >
      <div className="border-b border-border px-1 pb-3">
        <div className="min-w-0">
          <h2
            id={`${section.id}-title`}
            className={cn(settingsTextTokens.sectionTitle, 'leading-tight')}
          >
            {section.label}
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{section.hint}</p>
        </div>
      </div>
      <div className="space-y-6 pt-5">{children}</div>
    </section>
  )
}

export default function SettingsPage() {
  return (
    <TenantPermissionGate
      permission={TENANT_PERMISSIONS.SETTINGS_READ}
      pageName="系统设置"
      withFrame={false}
    >
      <SettingsPageContent />
    </TenantPermissionGate>
  )
}

function SettingsPageContent() {
  const state = useSettingsPageState()
  const settingsUnavailable = Boolean(state.loadError) && !state.hasSettingsSnapshot
  const [refreshConfirmOpen, setRefreshConfirmOpen] = useState(false)
  const access = useTenantAccess()
  const isAdmin = tenantAccessIsAdmin(access.data)
  const { parserBackend, setParserBackend } = useParserBackendPreference()
  const { chunkStrategy, setChunkStrategy } = useChunkStrategyPreference()
  useUnsavedChanges(state.hasChanges)
  const refreshSettings = useCallback(() => {
    if (state.hasChanges) {
      setRefreshConfirmOpen(true)
      return
    }
    state.refreshAll()
  }, [state])

  return (
    <>
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
            {state.loadError && state.hasSettingsSnapshot ? (
              <Alert
                variant="destructive"
                className="rounded-lg border-destructive/25 bg-destructive/10 shadow-none"
              >
                <XCircle className="size-4" />
                <div>
                  <AlertTitle>设置刷新失败</AlertTitle>
                  <AlertDescription className="text-foreground/80">
                    {state.loadError}
                  </AlertDescription>
                </div>
              </Alert>
            ) : null}
            {state.saveMessage ? <SettingsSaveFeedback message={state.saveMessage} /> : null}
            {!state.loading && state.hasSettingsSnapshot && !state.settingsWritable ? (
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
                    disabled={state.refreshing}
                    className={SETTINGS_OUTLINE_BUTTON}
                    aria-label="刷新设置"
                  >
                    <RefreshCw
                      className={cn(
                        'size-4',
                        state.refreshing && 'animate-spin motion-reduce:animate-none'
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
        {state.loading && !state.hasSettingsSnapshot ? (
          <div className="flex h-64 items-center justify-center">
            <RefreshCw className="size-8 animate-spin text-muted-foreground motion-reduce:animate-none" />
          </div>
        ) : settingsUnavailable ? (
          <div className="py-8">
            <QueryErrorState
              title="系统设置加载失败"
              description={state.loadError || '暂时无法读取系统设置，请稍后重试。'}
              onRetry={state.refreshSettings}
              retrying={state.loading}
            />
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
            <SettingsSaveBar state={state} settingsWritable={state.settingsWritable} />
          </>
        )}
      </PageScaffold>

      <ModelConfigDialog
        provider={state.selectedProvider}
        open={state.dialogOpen && state.settingsWritable}
        onClose={() => state.setDialogOpen(false)}
        onSave={state.handleSaveConfig}
      />
      <UnsavedChangesDialog
        open={refreshConfirmOpen}
        onOpenChange={setRefreshConfirmOpen}
        onDiscard={() => {
          setRefreshConfirmOpen(false)
          state.refreshAll()
        }}
      />
    </>
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
  const sectionMatches = useMemo(() => findSettingsSectionMatches(searchQuery), [searchQuery])
  const visibleSections = useMemo(
    () => sectionMatches.map((match) => match.section),
    [sectionMatches]
  )
  const forcedOpenSubsectionIds = useMemo(
    () => new Set(sectionMatches.flatMap((match) => match.matchedSubsectionIds)),
    [sectionMatches]
  )
  const visibleSectionIds = useMemo(
    () => visibleSections.map((section) => section.id),
    [visibleSections]
  )
  const visibleSectionIdSet = useMemo(() => new Set(visibleSectionIds), [visibleSectionIds])
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

  const openRetrievalSettings = useCallback(() => {
    setSearchQuery('')
    globalThis.window.requestAnimationFrame(() => scrollTo('settings-retrieval'))
  }, [scrollTo])

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
                <SettingsSubsection id="system-status" title="系统状态">
                  {state.statusError ? (
                    <QueryErrorState
                      title={state.status ? '运行状态刷新失败' : '运行状态加载失败'}
                      description={state.statusError}
                      onRetry={state.refreshSystemStatus}
                      retrying={state.statusLoading}
                    />
                  ) : null}
                  {state.backendMetaError ? (
                    <QueryErrorState
                      title={state.backendMeta ? '后端信息刷新失败' : '后端信息加载失败'}
                      description={state.backendMetaError}
                      onRetry={state.refreshBackendMeta}
                      retrying={state.backendMetaLoading}
                    />
                  ) : null}
                  {(state.statusLoading && !state.status) ||
                  (state.backendMetaLoading && !state.backendMeta) ? (
                    <div className="rounded-md border border-border px-4 py-8 text-center text-sm text-muted-foreground">
                      正在读取运行状态…
                    </div>
                  ) : null}
                  {state.status || state.backendMeta ? (
                    <SystemStatusSection status={state.status} backendMeta={state.backendMeta} />
                  ) : null}
                </SettingsSubsection>
                <fieldset disabled={!settingsWritable} className="contents">
                  <SettingsSubsection
                    id="runtime-controls"
                    title="运行控制"
                    advanced
                    forceOpen={forcedOpenSubsectionIds.has('runtime-controls')}
                  >
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
                  <SettingsSubsection id="model-providers" title="模型接入">
                    <ModelProvidersSection
                      groupedProviders={state.groupedProviders}
                      onConfigure={state.handleConfigure}
                      onOpenRetrievalSettings={openRetrievalSettings}
                    />
                  </SettingsSubsection>
                  {isAdmin ? (
                    <SettingsSubsection
                      id="object-storage"
                      title="对象存储"
                      advanced
                      forceOpen={forcedOpenSubsectionIds.has('object-storage')}
                    >
                      <ObjectStorageSection
                        minio={state.minioMerged}
                        updateMinIO={state.updateMinIO}
                      />
                    </SettingsSubsection>
                  ) : null}
                  {isAdmin ? (
                    <SettingsSubsection
                      id="dify-integration"
                      title="Dify 接入"
                      advanced
                      forceOpen={forcedOpenSubsectionIds.has('dify-integration')}
                    >
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
                  <SettingsSubsection
                    id="parser-services"
                    title="高级解析"
                    advanced
                    forceOpen={forcedOpenSubsectionIds.has('parser-services')}
                  >
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
                  <SettingsSubsection
                    id="feature-flags"
                    title="功能开关"
                    advanced
                    forceOpen={forcedOpenSubsectionIds.has('feature-flags')}
                  >
                    <FeatureFlagsSection
                      editedFeatureFlags={state.editedFeatureFlags}
                      getFeatureValue={state.getFeatureValue}
                      toggleFeature={state.toggleFeature}
                      parserStatuses={state.status?.parsers}
                      disabled={!settingsWritable}
                    />
                  </SettingsSubsection>
                </fieldset>
                <SettingsSubsection id="governance" title="数据治理">
                  <GovernanceSection
                    settingsWritable={settingsWritable}
                    isGovernanceEnabled={state.isGovernanceEnabled}
                    isPiiAnonymizeEnabled={state.isPiiAnonymizeEnabled}
                    isSecretsRedactEnabled={state.isSecretsRedactEnabled}
                    isQuarantineOnDropEnabled={state.isQuarantineOnDropEnabled}
                    updateGovernance={state.updateGovernance}
                  />
                </SettingsSubsection>
                {isAdmin ? (
                  <fieldset disabled={!settingsWritable} className="contents">
                    <SettingsSubsection
                      id="url-ingest"
                      title="URL 采集"
                      advanced
                      forceOpen={forcedOpenSubsectionIds.has('url-ingest')}
                    >
                      <UrlIngestSection
                        urlIngest={state.urlIngestMerged}
                        updateUrlIngest={state.updateUrlIngest}
                      />
                    </SettingsSubsection>
                  </fieldset>
                ) : null}
                <SettingsSubsection
                  id="industry-rules"
                  title="行业规则"
                  advanced
                  forceOpen={forcedOpenSubsectionIds.has('industry-rules')}
                >
                  <IndustryRulesSummarySection />
                </SettingsSubsection>
              </SettingsSectionFrame>
            ) : null}

            {visibleSectionIdSet.has('settings-retrieval') ? (
              <SettingsSectionFrame section={SETTINGS_SECTION_BY_ID['settings-retrieval']}>
                <fieldset disabled={!settingsWritable} className="contents">
                  <SettingsSubsection id="rag" title="RAG 配置">
                    <RagSection
                      rag={state.ragMerged}
                      updateRag={state.updateRag}
                      ltrAvailable={state.ltrModels.some((model) => model.active)}
                    />
                  </SettingsSubsection>
                  <SettingsSubsection
                    id="ltr-models"
                    title="LTR 模型"
                    advanced
                    forceOpen={forcedOpenSubsectionIds.has('ltr-models')}
                  >
                    <LtrModelRegistrySection
                      ltrError={state.ltrError}
                      ltrMessage={state.ltrMessage}
                      ltrUploading={state.ltrUploading}
                      ltrUploadManifestFileName={state.ltrUploadManifestFileName}
                      ltrUploadModelFileName={state.ltrUploadModelFileName}
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
                <SettingsSubsection id="frontend-preferences" title="前端偏好">
                  <FrontendPreferencesSection
                    parserBackend={parserBackend}
                    setParserBackend={setParserBackend}
                    chunkStrategy={chunkStrategy}
                    setChunkStrategy={setChunkStrategy}
                  />
                </SettingsSubsection>
                <fieldset disabled={!settingsWritable} className="contents">
                  {isAdmin ? (
                    <SettingsSubsection
                      id="navigation-visibility"
                      title="导航权限"
                      advanced
                      forceOpen={forcedOpenSubsectionIds.has('navigation-visibility')}
                    >
                      <NavigationVisibilitySection
                        navigation={state.navigationMerged}
                        updateNavigation={state.updateNavigation}
                      />
                    </SettingsSubsection>
                  ) : null}
                  {isAdmin ? (
                    <SettingsSubsection
                      id="observability"
                      title="可观测性"
                      advanced
                      forceOpen={forcedOpenSubsectionIds.has('observability')}
                    >
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
