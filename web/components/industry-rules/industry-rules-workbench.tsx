'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  Database,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { useRouter } from '@/i18n/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageScaffold } from '@/components/ui/page-scaffold'
import { UnsavedChangesDialog } from '@/components/ui/unsaved-changes-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatApiError } from '@/lib/api-errors'
import { useUnsavedNavigationGuard } from '@/hooks/use-unsaved-navigation-guard'
import {
  datasetApi,
  industryRulesApi,
  type IndustryRulesetDetail,
  type IndustryRulesetDetailResponse,
} from '@/lib/api'
import {
  buildGlossaryPayload,
  buildIntentsPayload,
  buildPatternsPayload,
  glossaryDraftFingerprint,
  glossaryDraftValidationError,
  industryRulesDraftFingerprints,
  intentsDraftFingerprint,
  intentsDraftValidationError,
  patternsDraftFingerprint,
  patternsDraftValidationError,
  type GlossaryEntry,
  type IndustryRulesDraftFingerprints,
  type IntentEntry,
  type PatternEntry,
} from '@/lib/industry-rules-draft'
import { createLatestAsyncRequest } from '@/lib/latest-async-request'
import { queryKeys } from '@/lib/query-keys'
import { randomBase36Id } from '@/lib/secure-random'
import { cn, detachPromise } from '@/lib/utils'

type GlossarySuggestion = {
  token: string
  count: number
  source: string
}

type RewritePreviewState = {
  originalQuery: string
  expandedQuery: string
  changed: boolean
}

type ResultSummary = {
  title: string
  detail: string
}

type PendingRuleAction =
  | { type: 'switch-ruleset'; ruleset: string }
  | { type: 'refresh' }

function makeLocalId(prefix: string, seed?: string): string {
  const suffix =
    seed?.trim() || `${Date.now()}-${randomBase36Id(6)}`
  return `${prefix}-${suffix}`
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => textValue(item)).filter(Boolean)
}

function glossaryEntriesFromPayload(
  glossary: Record<string, string[]>
): GlossaryEntry[] {
  return Object.entries(glossary)
    .sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))
    .map(([term, aliases]) => ({
      id: makeLocalId('glossary', term),
      term,
      aliasesText: Array.isArray(aliases) ? aliases.join(', ') : '',
    }))
}

function patternEntriesFromPayload(
  patterns: Array<Record<string, unknown>>
): PatternEntry[] {
  return patterns.map((item, index) => {
    const record = asRecord(item)
    const markers = textList(record.markers ?? record.keywords)
    return {
      id: makeLocalId('pattern', `${index}`),
      markersText: markers.join(', '),
      followup: textValue(record.followup ?? record.followup_template),
      enabled: record.enabled !== false,
    }
  })
}

function intentEntriesFromPayload(
  intents: Array<Record<string, unknown>>
): IntentEntry[] {
  return intents.map((item, index) => {
    const record = asRecord(item)
    return {
      id: makeLocalId('intent', `${index}`),
      name: textValue(record.name),
      keywordsText: textList(record.keywords).join(', '),
      route: textValue(record.route) || 'default',
    }
  })
}

function draftEntriesFromDetail(detail: IndustryRulesetDetail) {
  return {
    glossaryEntries: glossaryEntriesFromPayload(detail.glossary || {}),
    patternEntries: patternEntriesFromPayload(detail.patterns || []),
    intentEntries: intentEntriesFromPayload(detail.intents || []),
  }
}

function suggestionRowsFromPayload(payload: unknown): GlossarySuggestion[] {
  const record = asRecord(payload)
  const rows = Array.isArray(record.glossary_suggestions)
    ? record.glossary_suggestions
    : []
  return rows
    .map((row) => {
      const item = asRecord(row)
      return {
        token: textValue(item.token),
        count: Number(item.count || 0),
        source: textValue(item.source) || 'mining',
      }
    })
    .filter((row) => row.token)
}

function selectedMapValues(selected: Record<string, boolean>): string[] {
  return Object.entries(selected)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key)
}

const WORKBENCH_SECTION = 'rounded-lg border border-border bg-card'
const DENSE_FIELD =
  'h-9 rounded-md border-border bg-background text-sm text-foreground shadow-none focus-visible:ring-primary/20'
const DENSE_BUTTON =
  'h-9 rounded-md border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted'

export function IndustryRulesWorkbench() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const hydratedRulesetRef = useRef<string | null>(null)
  const hydratedDetailVersionRef = useRef(0)
  const previewRequests = useMemo(() => createLatestAsyncRequest(), [])
  const [selectedRuleset, setSelectedRuleset] = useState('')
  const [selectedDatasetId, setSelectedDatasetId] = useState('')
  const [searchValue, setSearchValue] = useState('')
  const [previewQuery, setPreviewQuery] = useState('授权报错怎么办')
  const [pendingRuleAction, setPendingRuleAction] =
    useState<PendingRuleAction | null>(null)
  const [savedFingerprints, setSavedFingerprints] =
    useState<IndustryRulesDraftFingerprints | null>(null)

  const [previewing, setPreviewing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [savingGlossary, setSavingGlossary] = useState(false)
  const [savingPatterns, setSavingPatterns] = useState(false)
  const [savingIntents, setSavingIntents] = useState(false)
  const savingRules = savingGlossary || savingPatterns || savingIntents

  const [glossaryEntries, setGlossaryEntries] = useState<GlossaryEntry[]>([])
  const [patternEntries, setPatternEntries] = useState<PatternEntry[]>([])
  const [intentEntries, setIntentEntries] = useState<IntentEntry[]>([])
  const [glossarySuggestions, setGlossarySuggestions] = useState<
    GlossarySuggestion[]
  >([])
  const [selectedSuggestionTokens, setSelectedSuggestionTokens] = useState<
    Record<string, boolean>
  >({})
  const [dismissedSuggestionTokens, setDismissedSuggestionTokens] = useState<
    Record<string, boolean>
  >({})
  const [preview, setPreview] = useState<RewritePreviewState | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [result, setResult] = useState<ResultSummary | null>(null)

  const rulesetsQuery = useQuery({
    queryKey: queryKeys.industryRules.rulesets,
    queryFn: industryRulesApi.listRulesets,
  })
  const datasetsQuery = useQuery({
    queryKey: queryKeys.datasets.exhaustive({ purpose: 'industry-rules' }),
    queryFn: () => datasetApi.listAll(),
  })
  const rulesetDetailQuery = useQuery({
    queryKey: queryKeys.industryRules.ruleset(selectedRuleset),
    enabled: Boolean(selectedRuleset.trim()) && !savingRules,
    queryFn: () => industryRulesApi.getRuleset(selectedRuleset.trim()),
  })
  const glossarySuggestionsQuery = useQuery({
    queryKey: queryKeys.industryRules.glossarySuggestions(
      selectedDatasetId,
      selectedRuleset,
      { limit: 20 }
    ),
    enabled: Boolean(selectedDatasetId.trim() && selectedRuleset.trim()),
    queryFn: () =>
      datasetApi.getAnalysisRuleSuggestions(selectedDatasetId.trim(), {
        ruleset: selectedRuleset.trim(),
        limit: 20,
      }),
  })

  const rulesets = useMemo(
    () => rulesetsQuery.data?.rulesets || [],
    [rulesetsQuery.data?.rulesets]
  )
  const canManageRules = rulesetsQuery.data?.can_manage === true
  const datasets = useMemo(
    () => datasetsQuery.data || [],
    [datasetsQuery.data]
  )
  const loadingMeta = rulesetsQuery.isFetching || datasetsQuery.isFetching
  const metaError = rulesetsQuery.error || datasetsQuery.error
  const loadingRuleset = rulesetDetailQuery.isFetching
  const loadingSuggestions = glossarySuggestionsQuery.isFetching
  const draftUnavailable =
    savedFingerprints === null || !selectedRuleset.trim() || refreshing
  const glossaryEditingDisabled =
    !canManageRules || draftUnavailable || savingGlossary
  const patternsEditingDisabled =
    !canManageRules || draftUnavailable || savingPatterns
  const intentsEditingDisabled =
    !canManageRules || draftUnavailable || savingIntents
  const currentFingerprints = useMemo(
    () =>
      industryRulesDraftFingerprints({
        glossaryEntries,
        patternEntries,
        intentEntries,
      }),
    [glossaryEntries, intentEntries, patternEntries]
  )
  const dirtySections = useMemo(
    () => ({
      glossary:
        savedFingerprints !== null &&
        currentFingerprints.glossary !== savedFingerprints.glossary,
      patterns:
        savedFingerprints !== null &&
        currentFingerprints.patterns !== savedFingerprints.patterns,
      intents:
        savedFingerprints !== null &&
        currentFingerprints.intents !== savedFingerprints.intents,
    }),
    [currentFingerprints, savedFingerprints]
  )
  const dirtySectionCount = Object.values(dirtySections).filter(Boolean).length
  const hasUnsavedChanges = dirtySectionCount > 0
  const navigate = useCallback((href: string) => router.push(href), [router])
  const navigationGuard = useUnsavedNavigationGuard({
    enabled: hasUnsavedChanges,
    onNavigate: navigate,
  })
  const cancelNavigation = navigationGuard.cancelNavigation

  const hydrateRulesetDraft = useCallback(
    (detail: IndustryRulesetDetail, detailVersion = 0) => {
      const nextDraft = draftEntriesFromDetail(detail)
      setGlossaryEntries(nextDraft.glossaryEntries)
      setPatternEntries(nextDraft.patternEntries)
      setIntentEntries(nextDraft.intentEntries)
      setSavedFingerprints(industryRulesDraftFingerprints(nextDraft))
      hydratedRulesetRef.current = detail.name
      hydratedDetailVersionRef.current = detailVersion
    },
    []
  )

  const resetRulesetDraft = useCallback(() => {
    setGlossaryEntries([])
    setPatternEntries([])
    setIntentEntries([])
    setSavedFingerprints(null)
    hydratedRulesetRef.current = null
    hydratedDetailVersionRef.current = 0
  }, [])

  const applyRulesetSelection = useCallback(
    (rulesetName: string) => {
      const nextRuleset = rulesetName.trim()
      if (!nextRuleset) return
      resetRulesetDraft()
      setSelectedRuleset(nextRuleset)
      setGlossarySuggestions([])
      setSelectedSuggestionTokens({})
      setDismissedSuggestionTokens({})
      setResult(null)
      setPreview(null)
      setPreviewError(null)
    },
    [resetRulesetDraft]
  )

  const handleRulesetSelection = useCallback(
    (rulesetName: string) => {
      if (rulesetName === selectedRuleset) return
      if (hasUnsavedChanges) {
        setPendingRuleAction({
          type: 'switch-ruleset',
          ruleset: rulesetName,
        })
        return
      }
      applyRulesetSelection(rulesetName)
    },
    [applyRulesetSelection, hasUnsavedChanges, selectedRuleset]
  )

  const updateCachedRuleset = useCallback(
    (rulesetName: string, patch: Partial<IndustryRulesetDetail>) => {
      queryClient.setQueryData<IndustryRulesetDetailResponse>(
        queryKeys.industryRules.ruleset(rulesetName),
        (current) => {
          if (!current || current.ruleset.name !== rulesetName) return current
          return {
            ...current,
            ruleset: { ...current.ruleset, ...patch },
          }
        }
      )
    },
    [queryClient]
  )

  const refreshWorkspace = async () => {
    if (savingRules || refreshing) return
    setRefreshing(true)
    const activeRuleset = selectedRuleset.trim()
    const cachedDetail = rulesetDetailQuery.data?.ruleset
    if (cachedDetail?.name === activeRuleset) {
      hydrateRulesetDraft(cachedDetail, rulesetDetailQuery.dataUpdatedAt)
    } else {
      resetRulesetDraft()
    }
    hydratedRulesetRef.current = null
    hydratedDetailVersionRef.current = 0
    try {
      const detailRequest = activeRuleset
        ? rulesetDetailQuery.refetch()
        : Promise.resolve(null)
      const suggestionsRequest =
        activeRuleset && selectedDatasetId.trim()
          ? glossarySuggestionsQuery.refetch()
          : Promise.resolve(null)
      const [, , detailResult] = await Promise.all([
        rulesetsQuery.refetch(),
        datasetsQuery.refetch(),
        detailRequest,
        suggestionsRequest,
      ])
      if (
        detailResult?.data?.ruleset?.name === activeRuleset &&
        selectedRuleset === activeRuleset
      ) {
        hydrateRulesetDraft(
          detailResult.data.ruleset,
          detailResult.dataUpdatedAt
        )
      }
    } finally {
      setRefreshing(false)
    }
  }

  const requestWorkspaceRefresh = () => {
    if (savingRules || refreshing) return
    if (hasUnsavedChanges) {
      setPendingRuleAction({ type: 'refresh' })
      return
    }
    detachPromise(refreshWorkspace())
  }

  useEffect(() => {
    if (metaError) {
      toast.error(formatApiError(metaError, '加载规则集或数据集失败'))
    }
  }, [metaError])

  useEffect(() => {
    if (!rulesetDetailQuery.error) return
    toast.error(formatApiError(rulesetDetailQuery.error, '加载规则详情失败'))
  }, [rulesetDetailQuery.error])

  useEffect(() => {
    if (!glossarySuggestionsQuery.error) return
    toast.error(formatApiError(glossarySuggestionsQuery.error, '加载规则候选失败'))
  }, [glossarySuggestionsQuery.error])

  useEffect(() => {
    if (!selectedRuleset && rulesets[0]?.name)
      applyRulesetSelection(rulesets[0].name)
  }, [applyRulesetSelection, rulesets, selectedRuleset])

  useEffect(() => {
    if (!selectedDatasetId && datasets[0]?.id)
      setSelectedDatasetId(String(datasets[0].id))
  }, [datasets, selectedDatasetId])

  useEffect(() => {
    const detail = rulesetDetailQuery.data?.ruleset
    if (!detail || detail.name !== selectedRuleset || hasUnsavedChanges) return
    if (
      hydratedRulesetRef.current === detail.name &&
      hydratedDetailVersionRef.current === rulesetDetailQuery.dataUpdatedAt
    ) {
      return
    }
    hydrateRulesetDraft(detail, rulesetDetailQuery.dataUpdatedAt)
  }, [
    hasUnsavedChanges,
    hydrateRulesetDraft,
    rulesetDetailQuery.data,
    rulesetDetailQuery.dataUpdatedAt,
    selectedRuleset,
  ])

  useEffect(() => {
    if (!glossarySuggestionsQuery.data) return
    setGlossarySuggestions(suggestionRowsFromPayload(glossarySuggestionsQuery.data))
    setSelectedSuggestionTokens({})
    setDismissedSuggestionTokens({})
  }, [glossarySuggestionsQuery.data])

  useEffect(() => {
    previewRequests.invalidate()
    setPreviewing(false)
    setPreview(null)
    setPreviewError(null)
    const ruleset = selectedRuleset.trim()
    const query = previewQuery.trim()
    if (!ruleset || !query) {
      return
    }
    const timer = globalThis.window.setTimeout(() => {
      setPreviewing(true)
      detachPromise(
        (async () => {
          const outcome = await previewRequests.run(() =>
            industryRulesApi.previewRewrite({ ruleset, query })
          )
          if (outcome.status === 'stale') return
          if (!outcome.ok) {
            const message = formatApiError(outcome.error, '改写预览失败')
            setPreview(null)
            setPreviewError(message)
            toast.error(message)
            setPreviewing(false)
            return
          }
          setPreviewError(null)
          setPreview({
            originalQuery: outcome.value.original_query,
            expandedQuery: outcome.value.expanded_query,
            changed: outcome.value.changed,
          })
          setPreviewing(false)
        })()
      )
    }, 280)
    return () => {
      globalThis.window.clearTimeout(timer)
      previewRequests.invalidate()
    }
  }, [previewQuery, previewRequests, selectedRuleset])

  useEffect(() => {
    if (!hasUnsavedChanges) cancelNavigation()
  }, [cancelNavigation, hasUnsavedChanges])

  const selectedDataset = useMemo(
    () =>
      datasets.find((item) => String(item.id) === selectedDatasetId) || null,
    [datasets, selectedDatasetId]
  )
  const visibleGlossaryEntries = useMemo(() => {
    const keyword = searchValue.trim().toLowerCase()
    if (!keyword) return glossaryEntries
    return glossaryEntries.filter((entry) => {
      const haystack = `${entry.term} ${entry.aliasesText}`.toLowerCase()
      return haystack.includes(keyword)
    })
  }, [glossaryEntries, searchValue])
  const visibleGlossarySuggestions = useMemo(() => {
    const existingTerms = new Set(
      glossaryEntries.map((entry) => entry.term.trim()).filter(Boolean)
    )
    return glossarySuggestions.filter(
      (entry) =>
        !dismissedSuggestionTokens[entry.token] &&
        !existingTerms.has(entry.token)
    )
  }, [dismissedSuggestionTokens, glossaryEntries, glossarySuggestions])
  const selectedSuggestionCount = selectedMapValues(
    selectedSuggestionTokens
  ).length

  const setGlossaryEntry = (id: string, patch: Partial<GlossaryEntry>) => {
    if (glossaryEditingDisabled) return
    setGlossaryEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
    )
  }

  const setPatternEntry = (id: string, patch: Partial<PatternEntry>) => {
    if (patternsEditingDisabled) return
    setPatternEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
    )
  }

  const setIntentEntry = (id: string, patch: Partial<IntentEntry>) => {
    if (intentsEditingDisabled) return
    setIntentEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
    )
  }

  const addGlossarySuggestion = (token: string) => {
    if (glossaryEditingDisabled) return
    const term = token.trim()
    if (!term) return
    setGlossaryEntries((prev) => {
      if (prev.some((entry) => entry.term.trim() === term)) return prev
      return [
        ...prev,
        { id: makeLocalId('glossary', term), term, aliasesText: '' },
      ]
    })
    setDismissedSuggestionTokens((prev) => ({ ...prev, [term]: true }))
  }

  const acceptSelectedSuggestions = () => {
    if (glossaryEditingDisabled) return
    for (const token of selectedMapValues(selectedSuggestionTokens)) {
      addGlossarySuggestion(token)
    }
    setSelectedSuggestionTokens({})
  }

  const saveGlossary = async () => {
    if (!canManageRules) {
      toast.error('当前账号只有查看权限')
      return
    }
    if (draftUnavailable || savingGlossary) return
    const ruleset = selectedRuleset.trim()
    if (!ruleset || !dirtySections.glossary) return
    const validationError = glossaryDraftValidationError(glossaryEntries)
    if (validationError) {
      toast.error(`${validationError}，请补充后再保存`)
      return
    }
    const glossary = buildGlossaryPayload(glossaryEntries)
    const submittedFingerprint = currentFingerprints.glossary
    const savedEntries = glossaryEntriesFromPayload(glossary)
    const savedFingerprint = glossaryDraftFingerprint(savedEntries)
    setSavingGlossary(true)
    try {
      await queryClient.cancelQueries({
        queryKey: queryKeys.industryRules.ruleset(ruleset),
      })
      const payload = await industryRulesApi.updateGlossary(ruleset, {
        glossary,
      })
      await queryClient.cancelQueries({
        queryKey: queryKeys.industryRules.ruleset(ruleset),
      })
      updateCachedRuleset(ruleset, {
        glossary,
        glossary_count: Object.keys(glossary).length,
      })
      setSavedFingerprints((current) =>
        current ? { ...current, glossary: savedFingerprint } : current
      )
      setGlossaryEntries((current) =>
        glossaryDraftFingerprint(current) === submittedFingerprint
          ? savedEntries
          : current
      )
      setResult({
        title: '已保存术语',
        detail: `${ruleset} · 更新 ${String(payload.updated_count)} 条术语`,
      })
      toast.success('术语已保存')
    } catch (error) {
      toast.error(formatApiError(error, '保存术语失败'))
    } finally {
      setSavingGlossary(false)
    }
  }

  const savePatterns = async () => {
    if (!canManageRules) {
      toast.error('当前账号只有查看权限')
      return
    }
    if (draftUnavailable || savingPatterns) return
    const ruleset = selectedRuleset.trim()
    if (!ruleset || !dirtySections.patterns) return
    const validationError = patternsDraftValidationError(patternEntries)
    if (validationError) {
      toast.error(`${validationError}，请补充后再保存`)
      return
    }
    const patterns = buildPatternsPayload(patternEntries)
    const submittedFingerprint = currentFingerprints.patterns
    const savedEntries = patternEntriesFromPayload(patterns)
    const savedFingerprint = patternsDraftFingerprint(savedEntries)
    setSavingPatterns(true)
    try {
      await queryClient.cancelQueries({
        queryKey: queryKeys.industryRules.ruleset(ruleset),
      })
      const payload = await industryRulesApi.updatePatterns(ruleset, {
        patterns,
      })
      await queryClient.cancelQueries({
        queryKey: queryKeys.industryRules.ruleset(ruleset),
      })
      updateCachedRuleset(ruleset, {
        patterns,
        pattern_count: patterns.length,
      })
      setSavedFingerprints((current) =>
        current ? { ...current, patterns: savedFingerprint } : current
      )
      setPatternEntries((current) =>
        patternsDraftFingerprint(current) === submittedFingerprint
          ? savedEntries
          : current
      )
      setResult({
        title: '已保存问题模式',
        detail: `${ruleset} · 更新 ${String(payload.updated_count)} 条模式`,
      })
      toast.success('问题模式已保存')
    } catch (error) {
      toast.error(formatApiError(error, '保存问题模式失败'))
    } finally {
      setSavingPatterns(false)
    }
  }

  const saveIntents = async () => {
    if (!canManageRules) {
      toast.error('当前账号只有查看权限')
      return
    }
    if (draftUnavailable || savingIntents) return
    const ruleset = selectedRuleset.trim()
    if (!ruleset || !dirtySections.intents) return
    const validationError = intentsDraftValidationError(intentEntries)
    if (validationError) {
      toast.error(`${validationError}，请补充后再保存`)
      return
    }
    const intents = buildIntentsPayload(intentEntries)
    const submittedFingerprint = currentFingerprints.intents
    const savedEntries = intentEntriesFromPayload(intents)
    const savedFingerprint = intentsDraftFingerprint(savedEntries)
    setSavingIntents(true)
    try {
      await queryClient.cancelQueries({
        queryKey: queryKeys.industryRules.ruleset(ruleset),
      })
      const payload = await industryRulesApi.updateIntents(ruleset, {
        intents,
      })
      await queryClient.cancelQueries({
        queryKey: queryKeys.industryRules.ruleset(ruleset),
      })
      updateCachedRuleset(ruleset, {
        intents,
        intent_count: intents.length,
      })
      setSavedFingerprints((current) =>
        current ? { ...current, intents: savedFingerprint } : current
      )
      setIntentEntries((current) =>
        intentsDraftFingerprint(current) === submittedFingerprint
          ? savedEntries
          : current
      )
      setResult({
        title: '已保存意图分类',
        detail: `${ruleset} · 更新 ${String(payload.updated_count)} 条意图`,
      })
      toast.success('意图分类已保存')
    } catch (error) {
      toast.error(formatApiError(error, '保存意图分类失败'))
    } finally {
      setSavingIntents(false)
    }
  }

  const exportCurrentRuleset = () => {
    const payload = {
      ruleset: selectedRuleset,
      glossary: buildGlossaryPayload(glossaryEntries),
      patterns: buildPatternsPayload(patternEntries),
      intents: buildIntentsPayload(intentEntries),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${selectedRuleset || 'industry-rules'}.json`
    anchor.click()
    globalThis.window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const cancelPendingAction = () => {
    setPendingRuleAction(null)
    cancelNavigation()
  }

  const confirmPendingAction = () => {
    if (savingRules) return
    const action = pendingRuleAction
    setPendingRuleAction(null)
    if (action?.type === 'switch-ruleset') {
      applyRulesetSelection(action.ruleset)
      return
    }
    if (action?.type === 'refresh') {
      detachPromise(refreshWorkspace())
      return
    }
    navigationGuard.confirmNavigation()
  }

  return (
    <PageScaffold
      title="行业规则库"
      description={
        canManageRules
          ? '维护术语、问题模式和意图分类，并用已保存规则验证问题改写。'
          : '当前账号可查看、预览和导出规则，只有平台所有者可以修改。'
      }
      icon={ShieldCheck}
      badge={!rulesetsQuery.isLoading && !canManageRules ? '只读' : undefined}
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {hasUnsavedChanges ? (
            <Badge variant="outline">{dirtySectionCount} 组修改未保存</Badge>
          ) : null}
          <Button
            variant="outline"
            className={DENSE_BUTTON}
            aria-label="刷新工作台"
            disabled={loadingMeta || loadingRuleset || savingRules || refreshing}
            onClick={requestWorkspaceRefresh}
          >
            {loadingMeta || loadingRuleset || refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            刷新
          </Button>
          <Button
            variant="outline"
            className={DENSE_BUTTON}
            disabled={!selectedRuleset.trim()}
            onClick={exportCurrentRuleset}
          >
            <ExternalLink className="h-4 w-4" />
            导出
          </Button>
        </div>
      }
      density="system-dense"
      size="full"
      top={
        <div className="border-y border-border py-3">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="industry-rules-ruleset">规则集</Label>
                <Select
                  value={selectedRuleset}
                  onValueChange={handleRulesetSelection}
                  disabled={
                    loadingMeta || loadingRuleset || savingRules || refreshing
                  }
                >
                  <SelectTrigger id="industry-rules-ruleset" className={DENSE_FIELD}>
                    <SelectValue
                      placeholder={loadingMeta ? '正在加载规则集' : '选择规则集'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {rulesets.map((item) => (
                      <SelectItem key={item.name} value={item.name}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="industry-rules-dataset">候选来源数据集</Label>
                <Select
                  value={selectedDatasetId}
                  onValueChange={setSelectedDatasetId}
                  disabled={loadingMeta || refreshing}
                >
                  <SelectTrigger id="industry-rules-dataset" className={DENSE_FIELD}>
                    <SelectValue
                      placeholder={loadingMeta ? '正在加载数据集' : '选择数据集'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {datasets.map((item) => (
                      <SelectItem key={String(item.id)} value={String(item.id)}>
                        {item.name || item.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <dl className="grid grid-cols-4 gap-x-4 gap-y-2 text-sm sm:flex sm:flex-wrap sm:justify-end">
              <div><dt className="text-muted-foreground">术语</dt><dd className="font-semibold">{glossaryEntries.length}</dd></div>
              <div><dt className="text-muted-foreground">模式</dt><dd className="font-semibold">{patternEntries.length}</dd></div>
              <div><dt className="text-muted-foreground">意图</dt><dd className="font-semibold">{intentEntries.length}</dd></div>
              <div><dt className="text-muted-foreground">候选</dt><dd className="font-semibold">{visibleGlossarySuggestions.length}</dd></div>
            </dl>
          </div>
        </div>
      }
      topClassName="[&>div]:max-w-[1580px]"
      bodyContainerClassName="max-w-[1580px]"
    >
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div
          className={cn(
            WORKBENCH_SECTION,
            'flex min-h-[560px] min-w-0 flex-col overflow-hidden'
          )}
        >
          <Tabs defaultValue="glossary" className="flex h-full flex-col">
            <div className="border-b border-border p-2">
              <TabsList className="grid h-10 w-full grid-cols-3 rounded-lg bg-muted p-1 sm:w-auto sm:min-w-[360px]">
                <TabsTrigger
                  value="glossary"
                  className="h-8 rounded-md px-3 text-sm font-medium data-[state=active]:bg-background data-[state=active]:text-foreground"
                >
                  术语
                </TabsTrigger>
                <TabsTrigger
                  value="patterns"
                  className="h-8 rounded-md px-3 text-sm font-medium data-[state=active]:bg-background data-[state=active]:text-foreground"
                >
                  问题模式
                </TabsTrigger>
                <TabsTrigger
                  value="intents"
                  className="h-8 rounded-md px-3 text-sm font-medium data-[state=active]:bg-background data-[state=active]:text-foreground"
                >
                  意图分类
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="glossary" className="m-0 flex flex-1 flex-col p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex w-full min-w-0 items-center gap-2 rounded-md border border-border bg-background px-3 sm:w-auto sm:min-w-[260px]">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchValue}
                    onChange={(event) => setSearchValue(event.target.value)}
                    placeholder="搜索术语或别名"
                    className="h-9 border-0 px-0 text-sm shadow-none focus-visible:ring-2 focus-visible:ring-primary/20"
                  />
                </div>
                <div className="flex w-full gap-2 sm:w-auto">
                  <Button
                    variant="outline"
                    className={cn(DENSE_BUTTON, 'flex-1 sm:flex-none')}
                    disabled={glossaryEditingDisabled}
                    onClick={() =>
                      setGlossaryEntries((prev) => [
                        ...prev,
                        {
                          id: makeLocalId('glossary'),
                          term: '',
                          aliasesText: '',
                        },
                      ])
                    }
                  >
                    <Plus className="h-4 w-4" />
                    新增术语
                  </Button>
                  <Button
                    className="h-9 flex-1 rounded-md px-3 text-sm font-medium sm:flex-none"
                    disabled={
                      glossaryEditingDisabled ||
                      !dirtySections.glossary
                    }
                    onClick={() => detachPromise(saveGlossary())}
                  >
                    {savingGlossary ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {savingGlossary
                      ? '保存中…'
                      : dirtySections.glossary
                        ? '保存术语'
                        : '术语已保存'}
                  </Button>
                </div>
              </div>

              <div className="hidden flex-1 overflow-x-auto rounded-lg border border-border md:block">
                <table className="min-w-[680px] w-full text-left text-sm">
                  <thead className="bg-muted/50 text-xs font-medium text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">术语</th>
                      <th className="px-4 py-3">别名</th>
                      <th className="px-4 py-3">来源</th>
                      <th className="px-4 py-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleGlossaryEntries.map((entry) => (
                      <tr
                        key={entry.id}
                        className="border-t border-border align-top"
                      >
                        <td className="px-4 py-3">
                          <Input
                            value={entry.term}
                            aria-label="术语名称"
                            readOnly={glossaryEditingDisabled}
                            onChange={(event) =>
                              setGlossaryEntry(entry.id, {
                                term: event.target.value,
                              })
                            }
                            placeholder="术语"
                            className={DENSE_FIELD}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Input
                            value={entry.aliasesText}
                            aria-label="术语别名"
                            readOnly={glossaryEditingDisabled}
                            onChange={(event) =>
                              setGlossaryEntry(entry.id, {
                                aliasesText: event.target.value,
                              })
                            }
                            placeholder="别名，逗号分隔"
                            className={DENSE_FIELD}
                          />
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          规则库
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={glossaryEditingDisabled}
                            className="h-8 w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label="删除术语"
                            onClick={() =>
                              setGlossaryEntries((prev) =>
                                prev.filter((item) => item.id !== entry.id)
                              )
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {visibleGlossaryEntries.length ? null : (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-4 py-10 text-center text-sm text-muted-foreground"
                        >
                          当前规则集还没有可展示的术语，或搜索条件为空。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div
                data-testid="industry-rules-glossary-mobile"
                className="divide-y divide-border rounded-lg border border-border md:hidden"
              >
                {visibleGlossaryEntries.map((entry, index) => (
                  <div key={entry.id} className="space-y-3 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium">术语 {index + 1}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={glossaryEditingDisabled}
                        className="h-8 w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="删除术语"
                        onClick={() =>
                          setGlossaryEntries((prev) =>
                            prev.filter((item) => item.id !== entry.id)
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`industry-rules-mobile-term-${index}`}>
                        术语名称
                      </Label>
                      <Input
                        id={`industry-rules-mobile-term-${index}`}
                        value={entry.term}
                        aria-label="术语名称"
                        readOnly={glossaryEditingDisabled}
                        onChange={(event) =>
                          setGlossaryEntry(entry.id, { term: event.target.value })
                        }
                        placeholder="输入标准术语"
                        className={DENSE_FIELD}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`industry-rules-mobile-aliases-${index}`}>
                        别名
                      </Label>
                      <Input
                        id={`industry-rules-mobile-aliases-${index}`}
                        value={entry.aliasesText}
                        aria-label="术语别名"
                        readOnly={glossaryEditingDisabled}
                        onChange={(event) =>
                          setGlossaryEntry(entry.id, {
                            aliasesText: event.target.value,
                          })
                        }
                        placeholder="多个别名用逗号分隔"
                        className={DENSE_FIELD}
                      />
                    </div>
                  </div>
                ))}
                {visibleGlossaryEntries.length ? null : (
                  <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                    当前规则集还没有可展示的术语，或没有匹配的搜索结果。
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="patterns" className="m-0 flex flex-1 flex-col p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  维护触发词、澄清话术与启用状态。
                </div>
                <div className="flex w-full gap-2 sm:w-auto">
                  <Button
                    variant="outline"
                    className={cn(DENSE_BUTTON, 'flex-1 sm:flex-none')}
                    disabled={patternsEditingDisabled}
                    onClick={() =>
                      setPatternEntries((prev) => [
                        ...prev,
                        {
                          id: makeLocalId('pattern'),
                          markersText: '',
                          followup: '',
                          enabled: true,
                        },
                      ])
                    }
                  >
                    <Plus className="h-4 w-4" />
                    新增模式
                  </Button>
                  <Button
                    className="h-9 flex-1 rounded-md px-3 text-sm font-medium sm:flex-none"
                    disabled={
                      patternsEditingDisabled ||
                      !dirtySections.patterns
                    }
                    onClick={() => detachPromise(savePatterns())}
                  >
                    {savingPatterns ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {savingPatterns
                      ? '保存中…'
                      : dirtySections.patterns
                        ? '保存模式'
                        : '模式已保存'}
                  </Button>
                </div>
              </div>

              <div className="divide-y divide-border border-y border-border">
                {patternEntries.map((entry) => (
                  <div key={entry.id} className="py-4">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_120px_40px] lg:items-center">
                      <Input
                        value={entry.markersText}
                        aria-label="问题模式触发词"
                        readOnly={patternsEditingDisabled}
                        onChange={(event) =>
                          setPatternEntry(entry.id, {
                            markersText: event.target.value,
                          })
                        }
                        placeholder="触发词，逗号分隔"
                        className={DENSE_FIELD}
                      />
                      <Input
                        value={entry.followup}
                        aria-label="问题模式澄清话术"
                        readOnly={patternsEditingDisabled}
                        onChange={(event) =>
                          setPatternEntry(entry.id, {
                            followup: event.target.value,
                          })
                        }
                        placeholder="澄清话术"
                        className={DENSE_FIELD}
                      />
                      <label className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted-foreground">
                        <Checkbox
                          disabled={patternsEditingDisabled}
                          checked={entry.enabled}
                          onCheckedChange={(value) =>
                            setPatternEntry(entry.id, {
                              enabled: value === true,
                            })
                          }
                        />
                        启用
                      </label>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={patternsEditingDisabled}
                        className="h-9 w-9 justify-self-end rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="删除问题模式"
                        onClick={() =>
                          setPatternEntries((prev) =>
                            prev.filter((item) => item.id !== entry.id)
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {patternEntries.length ? null : (
                  <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                    当前规则集没有问题模式。
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="intents" className="m-0 flex flex-1 flex-col p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  维护意图名称、关键词与路由策略。
                </div>
                <div className="flex w-full gap-2 sm:w-auto">
                  <Button
                    variant="outline"
                    className={cn(DENSE_BUTTON, 'flex-1 sm:flex-none')}
                    disabled={intentsEditingDisabled}
                    onClick={() =>
                      setIntentEntries((prev) => [
                        ...prev,
                        {
                          id: makeLocalId('intent'),
                          name: '',
                          keywordsText: '',
                          route: 'default',
                        },
                      ])
                    }
                  >
                    <Plus className="h-4 w-4" />
                    新增意图
                  </Button>
                  <Button
                    className="h-9 flex-1 rounded-md px-3 text-sm font-medium sm:flex-none"
                    disabled={
                      intentsEditingDisabled ||
                      !dirtySections.intents
                    }
                    onClick={() => detachPromise(saveIntents())}
                  >
                    {savingIntents ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {savingIntents
                      ? '保存中…'
                      : dirtySections.intents
                        ? '保存意图'
                        : '意图已保存'}
                  </Button>
                </div>
              </div>

              <div className="divide-y divide-border border-y border-border">
                {intentEntries.map((entry) => (
                  <div key={entry.id} className="py-4">
                    <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_180px_40px] lg:items-center">
                      <Input
                        value={entry.name}
                        aria-label="意图名称"
                        readOnly={intentsEditingDisabled}
                        onChange={(event) =>
                          setIntentEntry(entry.id, { name: event.target.value })
                        }
                        placeholder="意图名称"
                        className={DENSE_FIELD}
                      />
                      <Input
                        value={entry.keywordsText}
                        aria-label="意图关键词"
                        readOnly={intentsEditingDisabled}
                        onChange={(event) =>
                          setIntentEntry(entry.id, {
                            keywordsText: event.target.value,
                          })
                        }
                        placeholder="关键词，逗号分隔"
                        className={DENSE_FIELD}
                      />
                      <Input
                        value={entry.route}
                        aria-label="意图路由"
                        readOnly={intentsEditingDisabled}
                        onChange={(event) =>
                          setIntentEntry(entry.id, {
                            route: event.target.value,
                          })
                        }
                        placeholder="路由"
                        className={DENSE_FIELD}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={intentsEditingDisabled}
                        className="h-9 w-9 justify-self-end rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="删除意图"
                        onClick={() =>
                          setIntentEntries((prev) =>
                            prev.filter((item) => item.id !== entry.id)
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {intentEntries.length ? null : (
                  <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                    当前规则集没有意图分类。
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <aside className={cn(WORKBENCH_SECTION, 'overflow-hidden')}>
          <section className="p-4">
            <div className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              改写预览
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              使用已保存规则测试问题改写；未保存的本地编辑不会参与预览。
            </p>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="industry-rules-preview-query">
                输入问题
              </Label>
              <Input
                id="industry-rules-preview-query"
                value={previewQuery}
                onChange={(event) => setPreviewQuery(event.target.value)}
                placeholder="输入要测试的问题"
                className={DENSE_FIELD}
              />
            </div>
            <div className="mt-4 border-t border-border pt-4">
              {previewing ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在计算改写预览…
                </div>
              ) : previewError ? (
                <div
                  role="alert"
                  className="text-sm leading-6 text-destructive"
                >
                  {previewError}，请稍后重试。
                </div>
              ) : preview ? (
                <div className="space-y-4 text-sm">
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">原问题</div>
                    <div className="break-words text-foreground">
                      {preview.originalQuery}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">改写结果</div>
                    <div className="break-words rounded-md bg-muted px-3 py-2 text-foreground">
                      {preview.expandedQuery}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        preview.changed
                          ? 'border-success/30 bg-success/10 text-success'
                          : 'border-border bg-card text-muted-foreground'
                      )}
                    >
                      {preview.changed ? '已命中规则并改写' : '未触发改写'}
                    </Badge>
                    <Badge variant="outline">
                      规则集 {selectedRuleset || '-'}
                    </Badge>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  输入问题后这里会展示改写结果。
                </div>
              )}
            </div>
          </section>

          <section className="border-t border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Database className="h-4 w-4 text-primary" />
                待审核候选
              </div>
              <Button
                variant="outline"
                className={DENSE_BUTTON}
                disabled={
                  !selectedDatasetId.trim() ||
                  !selectedRuleset.trim() ||
                  loadingSuggestions
                }
                onClick={() =>
                  detachPromise(
                    glossarySuggestionsQuery.refetch()
                  )
                }
              >
                {loadingSuggestions ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                刷新
              </Button>
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              接受的候选会先进入术语草稿，保存术语后才会生效。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline">规则集 {selectedRuleset || '-'}</Badge>
              <Badge variant="outline">
                数据集 {selectedDataset?.name || selectedDataset?.id || '-'}
              </Badge>
              <Badge variant="outline">
                候选 {visibleGlossarySuggestions.length}
              </Badge>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="text-sm text-muted-foreground">
                已选 {selectedSuggestionCount} 条
              </div>
              <Button
                variant="outline"
                className={DENSE_BUTTON}
                disabled={
                  glossaryEditingDisabled ||
                  !selectedSuggestionCount
                }
                onClick={acceptSelectedSuggestions}
              >
                <Check className="h-3.5 w-3.5" />
                批量接受
              </Button>
            </div>
            <div className="mt-3 max-h-[520px] divide-y divide-border overflow-auto border-y border-border">
              {visibleGlossarySuggestions.map((entry) => (
                <div key={entry.token} className="py-3">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      disabled={glossaryEditingDisabled}
                      checked={selectedSuggestionTokens[entry.token] === true}
                      onCheckedChange={(value) =>
                        setSelectedSuggestionTokens((prev) => ({
                          ...prev,
                          [entry.token]: value === true,
                        }))
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm font-medium text-foreground">
                          {entry.token}
                        </div>
                        <Badge variant="outline">{entry.count} 次</Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        来源：{entry.source}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="outline"
                      disabled={glossaryEditingDisabled}
                      className="h-8 flex-1 rounded-md border-border bg-background px-2.5 text-sm font-medium hover:bg-muted"
                      onClick={() => addGlossarySuggestion(entry.token)}
                    >
                      <Check className="h-3.5 w-3.5" />
                      接受
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={glossaryEditingDisabled}
                      className="h-8 rounded-md px-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() =>
                        setDismissedSuggestionTokens((prev) => ({
                          ...prev,
                          [entry.token]: true,
                        }))
                      }
                    >
                      <X className="h-3.5 w-3.5" />
                      拒绝
                    </Button>
                  </div>
                </div>
              ))}
              {visibleGlossarySuggestions.length ? null : (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  当前数据集暂无新的术语候选，或候选已被处理。
                </div>
              )}
            </div>
          </section>

          {result ? (
            <section className="border-t border-border bg-muted/40 p-4 text-sm">
              <div className="text-xs font-medium text-muted-foreground">最近操作</div>
              <div className="mt-2 font-medium text-foreground">
                {result.title}
              </div>
              <div className="mt-1 text-muted-foreground">{result.detail}</div>
            </section>
          ) : null}
        </aside>
      </div>
      <UnsavedChangesDialog
        open={
          pendingRuleAction !== null || navigationGuard.navigationPending
        }
        onOpenChange={(open) => {
          if (!open) cancelPendingAction()
        }}
        onDiscard={confirmPendingAction}
        discardDisabled={savingRules}
        title="放弃未保存的规则修改？"
        description={
          savingRules
            ? '规则正在保存，请等待保存完成后再离开、刷新或切换规则集。'
            : '术语、问题模式或意图分类尚未保存。继续后，本次修改将丢失。'
        }
      />
    </PageScaffold>
  )
}
