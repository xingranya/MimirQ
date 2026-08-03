'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Database,
  Hash,
  Loader2,
  RefreshCw,
  Search,
  Sliders,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react'

import { Link, useRouter } from '@/i18n/navigation'
import { PageScaffold } from '@/components/ui/page-scaffold'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'

import { datasetApi, pipelineApi } from '@/lib/api'
import type { BuiltinProcessingScript } from '@/lib/api/pipeline'
import { formatApiError } from '@/lib/api-errors'
import { queryKeys } from '@/lib/query-keys'
import { cn, detachPromise } from '@/lib/utils'

import type {
  GovernanceCommonLineCandidate,
  GovernanceCommonLinesLearnResponse,
  GovernanceProfileSummary,
  GovernanceProcessingScript,
  RegexRuleModel,
} from '@/types'

function escapeRegex(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}

function buildLineRegexRule(sample: string): RegexRuleModel | null {
  const raw = String(sample || '').trim()
  if (!raw) return null
  const tokens = raw.split(/\s+/).filter(Boolean)
  if (!tokens.length) return null
  const body = tokens.map(escapeRegex).join(String.raw`\s+`)
  // 使用多行和忽略大小写模式，兼容不同解析器产生的大小写差异。
  const pattern = String.raw`(?mi)^\s*${body}\s*$`
  return { pattern, repl: '', flags: 0 }
}

const SCRIPT_UPLOAD_ACCEPT = '.js,.ts,.py,.rs'
const MAX_PROCESSING_SCRIPT_CHARS = 200_000
const COMMON_LINES_PROFILE_PARAMS = {
  include_builtin: false,
  limit: 200,
} as const

function detectScriptLanguage(
  filename: string
): GovernanceProcessingScript['language'] | null {
  const ext = filename.trim().toLowerCase().split('.').pop()
  if (ext === 'js') return 'javascript'
  if (ext === 'ts') return 'typescript'
  if (ext === 'py') return 'python'
  if (ext === 'rs') return 'rust'
  return null
}

async function listWritableCommonLineProfiles(): Promise<
  GovernanceProfileSummary[]
> {
  const profResp = await pipelineApi.listGovernanceProfiles(
    COMMON_LINES_PROFILE_PARAMS
  )
  return (profResp.items || []).filter((profile) => !profile.is_system)
}

export function GovernanceCommonLinesPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const uploadInputRef = useRef<HTMLInputElement | null>(null)

  const [datasetId, setDatasetId] = useState<string>('')
  const [profileRef, setProfileRef] = useState<string>('')

  const [limitDocs, setLimitDocs] = useState(20)
  const [useOriginal, setUseOriginal] = useState(true)
  const [minDocs, setMinDocs] = useState(3)
  const [minRatio, setMinRatio] = useState(0.5)
  const [maxLineLength, setMaxLineLength] = useState(120)
  const [maxCandidates, setMaxCandidates] = useState(50)
  const [loading, setLoading] = useState(false)
  const [importingScript, setImportingScript] = useState(false)
  const [resp, setResp] = useState<GovernanceCommonLinesLearnResponse | null>(
    null
  )
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [templateLibraryOpen, setTemplateLibraryOpen] = useState(false)
  const [selectedTemplateKeys, setSelectedTemplateKeys] = useState<Set<string>>(
    () => new Set()
  )
  const [templateSearch, setTemplateSearch] = useState('')

  const datasetsQuery = useQuery({
    queryKey: queryKeys.datasets.exhaustive({ purpose: 'governance-common-lines' }),
    queryFn: () => datasetApi.listAll(),
  })
  const profilesQuery = useQuery({
    queryKey: queryKeys.governance.profiles(COMMON_LINES_PROFILE_PARAMS),
    queryFn: listWritableCommonLineProfiles,
  })
  const templateLibraryQuery = useQuery({
    queryKey: ['governance-processing-scripts', 'builtins'] as const,
    queryFn: () => pipelineApi.listBuiltinProcessingScripts(),
    staleTime: 30 * 60 * 1000,
  })

  const datasets = useMemo(
    () => datasetsQuery.data || [],
    [datasetsQuery.data]
  )
  const profiles = useMemo(
    () => profilesQuery.data || [],
    [profilesQuery.data]
  )
  const loadingMeta = datasetsQuery.isFetching || profilesQuery.isFetching
  const metaError = datasetsQuery.error || profilesQuery.error

  const refreshMeta = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.datasets.exhaustive({ purpose: 'governance-common-lines' }),
    })
    queryClient.invalidateQueries({
      queryKey: queryKeys.governance.profiles(COMMON_LINES_PROFILE_PARAMS),
    })
  }, [queryClient])

  useEffect(() => {
    if (metaError) {
      toast.error(formatApiError(metaError, '加载数据集或治理模板失败'))
    }
  }, [metaError])

  useEffect(() => {
    if (!datasetId && datasets.length) setDatasetId(String(datasets[0].id || ''))
  }, [datasetId, datasets])

  useEffect(() => {
    const profileStillExists = profiles.some((p) => {
      const id = String(p.id || '').trim()
      return profileRef === p.key || (!!id && profileRef === id)
    })
    if ((!profileRef || !profileStillExists) && profiles.length)
      setProfileRef(String(profiles[0].id || profiles[0].key || ''))
  }, [profileRef, profiles])

  const candidates: GovernanceCommonLineCandidate[] = useMemo(
    () => resp?.candidates || [],
    [resp?.candidates]
  )
  const sortedCandidates = useMemo(
    () =>
      [...candidates].sort((a, b) => {
        const docsDelta = Number(b.docs || 0) - Number(a.docs || 0)
        if (docsDelta !== 0) return docsDelta
        return Number(b.ratio || 0) - Number(a.ratio || 0)
      }),
    [candidates]
  )
  const selectedCandidates = useMemo(
    () => candidates.filter((c) => selected[String(c.signature || '')]),
    [candidates, selected]
  )

  const toggleAll = useCallback(
    (on: boolean) => {
      const next: Record<string, boolean> = {}
      for (const c of candidates) {
        const sig = String(c.signature || '')
        if (!sig) continue
        next[sig] = on
      }
      setSelected(next)
    },
    [candidates]
  )

  const runLearn = useCallback(async () => {
    const dsId = datasetId.trim()
    if (!dsId) {
      toast.error('请先选择数据集')
      return
    }
    setLoading(true)
    setResp(null)
    setSelected({})
    try {
      const out = await pipelineApi.learnCommonLines({
        dataset_id: dsId,
        limit_docs: Math.max(2, Math.min(50, Number(limitDocs || 20))),
        use_original: Boolean(useOriginal),
        min_docs: Math.max(2, Math.min(50, Number(minDocs || 3))),
        min_ratio: Math.max(0, Math.min(1, Number(minRatio || 0.5))),
        max_line_length: Math.max(
          20,
          Math.min(400, Number(maxLineLength || 120))
        ),
        max_candidates: Math.max(1, Math.min(200, Number(maxCandidates || 50))),
      })
      setResp(out)
      toast.success(`已生成候选行：${(out.candidates || []).length}`)
    } catch (err: unknown) {
      toast.error(formatApiError(err, '扫描重复行失败'))
    } finally {
      setLoading(false)
    }
  }, [
    datasetId,
    limitDocs,
    maxCandidates,
    maxLineLength,
    minDocs,
    minRatio,
    useOriginal,
  ])

  const importProcessingScripts = useCallback(
    async (files: File[]) => {
      const ref = profileRef.trim()
      if (!ref) {
        toast.error('请先选择目标治理模板')
        return
      }
      if (!files.length) return

      setImportingScript(true)
      try {
        const prof = await pipelineApi.getGovernanceProfile(ref)
        if (prof.is_system) {
          toast.error('系统治理模板只读，请选择团队模板')
          return
        }

        const drafts: GovernanceProcessingScript[] = []
        for (const file of files) {
          const language = detectScriptLanguage(file.name)
          if (!language) {
            toast.warning(`已跳过不支持的脚本类型：${file.name}`)
            continue
          }
          const content = await file.text()
          if (content.length > MAX_PROCESSING_SCRIPT_CHARS) {
            toast.warning(`已跳过过大的脚本：${file.name}`)
            continue
          }
          drafts.push({
            name: file.name,
            language,
            stage: 'post_governance',
            content,
            enabled: false,
            description: '从本地导入的脚本草稿，默认停用。',
            created_at: new Date().toISOString(),
          })
        }

        if (!drafts.length) {
          toast.error('没有可导入的处理脚本，仅支持 .js/.ts/.py/.rs')
          return
        }

        const existing = prof.payload.processing_scripts ?? []
        const byKey = new Map<string, GovernanceProcessingScript>()
        for (const item of existing)
          byKey.set(`${item.language}:${item.name}`, item)
        for (const item of drafts)
          byKey.set(`${item.language}:${item.name}`, item)
        const nextScripts = Array.from(byKey.values())
        if (nextScripts.length > 10) {
          toast.error('最多保留 10 个处理脚本，请先删除不再使用的脚本')
          return
        }

        await pipelineApi.updateGovernanceProfile(ref, {
          payload: {
            ...prof.payload,
            processing_scripts: nextScripts,
          },
        })
        toast.success(`已导入 ${drafts.length} 个处理脚本草案`)
      } catch (err: unknown) {
        toast.error(formatApiError(err, '导入处理脚本失败'))
      } finally {
        setImportingScript(false)
      }
    },
    [profileRef]
  )

  const appendBuiltinScripts = useCallback(
    async (templates: BuiltinProcessingScript[]) => {
      const ref = profileRef.trim()
      if (!ref) {
        toast.error('请先选择目标治理模板')
        return
      }
      if (!templates.length) {
        toast.error('请先选择至少一个模板')
        return
      }

      setImportingScript(true)
      try {
        const prof = await pipelineApi.getGovernanceProfile(ref)
        if (prof.is_system) {
          toast.error('系统治理模板只读，请选择团队模板')
          return
        }

        const drafts: GovernanceProcessingScript[] = templates.map((tpl) => ({
          name: tpl.name,
          language: tpl.language,
          stage: tpl.stage,
          content: tpl.content,
          enabled: false,
          description: tpl.description,
          created_at: new Date().toISOString(),
        }))

        const existing = prof.payload.processing_scripts ?? []
        const byKey = new Map<string, GovernanceProcessingScript>()
        for (const item of existing)
          byKey.set(`${item.language}:${item.name}`, item)
        for (const item of drafts)
          byKey.set(`${item.language}:${item.name}`, item)
        const nextScripts = Array.from(byKey.values())
        if (nextScripts.length > 10) {
          toast.error('最多保留 10 个处理脚本，请先删除不再使用的脚本')
          return
        }

        await pipelineApi.updateGovernanceProfile(ref, {
          payload: {
            ...prof.payload,
            processing_scripts: nextScripts,
          },
        })
        toast.success(`已从模板库添加 ${drafts.length} 个处理脚本`)
        setTemplateLibraryOpen(false)
        setSelectedTemplateKeys(new Set())
      } catch (err: unknown) {
        toast.error(formatApiError(err, '从模板库添加处理脚本失败'))
      } finally {
        setImportingScript(false)
      }
    },
    [profileRef]
  )

  const filteredTemplates = useMemo(() => {
    const all = templateLibraryQuery.data?.items ?? []
    const q = templateSearch.trim().toLowerCase()
    if (!q) return all
    return all.filter((tpl) =>
      [tpl.name, tpl.description, tpl.key, ...(tpl.tags ?? [])]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q))
    )
  }, [templateLibraryQuery.data?.items, templateSearch])

  const toggleTemplateSelection = useCallback((key: string) => {
    setSelectedTemplateKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const confirmAddFromTemplateLibrary = useCallback(() => {
    const all = templateLibraryQuery.data?.items ?? []
    const picked = all.filter((tpl) => selectedTemplateKeys.has(tpl.key))
    detachPromise(appendBuiltinScripts(picked))
  }, [
    appendBuiltinScripts,
    selectedTemplateKeys,
    templateLibraryQuery.data?.items,
  ])

  const applyToProfile = useCallback(async () => {
    const ref = profileRef.trim()
    if (!ref) {
      toast.error('请选择一个团队治理模板')
      return
    }
    if (!selectedCandidates.length) {
      toast.error('请先勾选要写入的行')
      return
    }

    setLoading(true)
    try {
      const prof = await pipelineApi.getGovernanceProfile(ref)
      if (prof.is_system) {
        toast.error('系统治理模板只读，请选择团队模板')
        return
      }

      const existingRules: RegexRuleModel[] = Array.isArray(
        prof.payload?.regex_rules
      )
        ? prof.payload.regex_rules
        : []
      const patterns = new Set(
        existingRules.map((r) => String(r?.pattern || ''))
      )
      const nextRules = [...existingRules]

      let added = 0
      for (const c of selectedCandidates) {
        const rule =
          buildLineRegexRule(String(c.sample || '')) ||
          buildLineRegexRule(String(c.signature || ''))
        if (!rule) continue
        if (patterns.has(rule.pattern)) continue
        patterns.add(rule.pattern)
        nextRules.push(rule)
        added += 1
      }

      if (!added) {
        toast.info('没有新增规则（可能已存在或候选为空）')
        return
      }

      await pipelineApi.updateGovernanceProfile(ref, {
        payload: {
          ...prof.payload,
          regex_rules: nextRules,
        },
      })
      toast.success(`已写入治理模板：新增 ${added} 条规则`)
      router.push('/data-governance/profiles')
    } catch (err: unknown) {
      toast.error(formatApiError(err, '写入治理模板失败'))
    } finally {
      setLoading(false)
    }
  }, [profileRef, router, selectedCandidates])

  return (
    <PageScaffold
      title="重复内容治理"
      iconImage="profile-discovery"
      icon={Hash}
      iconColor="text-primary"
      description="识别多份文档中重复出现的页眉、页脚、导航和免责声明。"
      size="full"
      density="system-dense"
      bodyContainerClassName="max-w-none"
      actions={
        <Button
          size="sm"
          className="h-9 rounded-md px-4"
          onClick={() => detachPromise(runLearn())}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Wand2 className="size-4" />
          )}
          扫描文档
        </Button>
      }
      toolbar={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            候选 {candidates.length} 条，已选 {selectedCandidates.length} 条
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-md"
            onClick={refreshMeta}
            disabled={loadingMeta}
          >
            <RefreshCw
              className={cn(
                'size-4',
                loadingMeta && 'animate-spin motion-reduce:animate-none'
              )}
            />
            刷新数据
          </Button>
        </div>
      }
    >
      <input
        ref={uploadInputRef}
        type="file"
        multiple
        accept={SCRIPT_UPLOAD_ACCEPT}
        className="sr-only"
        onChange={(event) => {
          const files = Array.from(event.target.files || [])
          event.target.value = ''
          detachPromise(importProcessingScripts(files))
        }}
      />
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="min-w-0 xl:sticky xl:top-3 xl:self-start">
          <div
            data-testid="common-lines-control-panel"
            className="overflow-hidden rounded-md border border-border bg-card"
          >
              <section className="border-b border-border px-4 py-4">
                <h2 className="text-base font-semibold text-foreground">
                  扫描范围
                </h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  从解析后的正文中识别跨文档重复内容。
                </p>
              </section>

              <section className="border-b border-border">
                <div className="flex items-center gap-2 px-4 py-3">
                  <Database className="size-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">
                    目标
                  </h2>
                </div>
                <div className="space-y-4 px-4 pb-4">
                  <div className="min-w-0 space-y-2">
                    <Label className="text-xs font-semibold text-foreground">
                      数据集
                    </Label>
                    <Select
                      value={datasetId || ''}
                      onValueChange={(v) => setDatasetId(v)}
                    >
                      <SelectTrigger className="h-10 rounded-md border-border bg-card text-sm shadow-none">
                        <SelectValue placeholder="选择数据集" />
                      </SelectTrigger>
                      <SelectContent>
                        {datasets.length ? (
                          datasets.map((d) => (
                            <SelectItem key={d.id} value={String(d.id)}>
                              {d.name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="__none__" disabled>
                            暂无数据集
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <p className="text-xs leading-5 text-muted-foreground">
                      数据集需要保留解析后的正文，否则可能无法生成候选内容。
                    </p>
                  </div>

                  <div className="min-w-0 space-y-2">
                    <Label className="text-xs font-semibold text-foreground">
                      目标治理模板
                    </Label>
                    <Select
                      value={profileRef || ''}
                      onValueChange={(v) => setProfileRef(v)}
                    >
                      <SelectTrigger className="h-10 rounded-md border-border bg-card text-sm shadow-none">
                        <SelectValue placeholder="选择团队治理模板" />
                      </SelectTrigger>
                      <SelectContent>
                        {profiles.length ? (
                          profiles.map((p) => (
                            <SelectItem
                              key={p.key}
                              value={String(p.id || p.key)}
                            >
                              {p.name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="__none__" disabled>
                            暂无团队治理模板
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {profiles.length ? (
                      <p className="text-xs leading-5 text-muted-foreground">
                        候选规则会追加到所选模板，不会覆盖原有规则。
                      </p>
                    ) : loadingMeta ? null : (
                      <Button
                        asChild
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 w-full rounded-md"
                      >
                        <Link href="/data-governance/profiles">
                          新建治理模板
                        </Link>
                      </Button>
                    )}
                  </div>

                  <details className="rounded-md border border-border bg-background">
                    <summary className="cursor-pointer px-3 py-2.5 text-xs font-medium text-foreground">
                      处理脚本（高级）
                    </summary>
                    <div className="space-y-2 border-t border-border p-3">
                      <p className="text-xs leading-5 text-muted-foreground">
                        脚本会以停用草稿保存到当前治理模板，不会自动执行。
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 w-full rounded-md"
                        disabled={
                          importingScript || loading || !profileRef.trim()
                        }
                        onClick={() => uploadInputRef.current?.click()}
                      >
                        {importingScript ? (
                          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                        ) : (
                          <Upload className="size-4" />
                        )}
                        {importingScript ? '正在导入' : '导入本地脚本'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 w-full rounded-md"
                        disabled={
                          importingScript ||
                          loading ||
                          !profileRef.trim() ||
                          templateLibraryQuery.isFetching
                        }
                        onClick={() => {
                          setSelectedTemplateKeys(new Set())
                          setTemplateSearch('')
                          setTemplateLibraryOpen(true)
                        }}
                      >
                        <Sparkles className="size-4" />
                        从模板中选择
                      </Button>
                    </div>
                  </details>
                </div>
              </section>

              <section>
                <div className="flex items-center gap-2 px-4 py-3">
                  <Sliders className="size-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">
                    扫描条件
                  </h2>
                </div>
                <div className="grid grid-cols-2 gap-3 px-4 pb-4">
                  <div className="min-w-0 space-y-1.5">
                    <Label className="text-xs font-medium text-foreground">
                      扫描文档数
                    </Label>
                    <Input
                      type="number"
                      value={String(limitDocs)}
                      onChange={(e) =>
                        setLimitDocs(Number(e.target.value || 0))
                      }
                      className="h-9 rounded-md border-border bg-card text-sm tabular-nums shadow-none"
                    />
                  </div>

                  <div className="min-w-0 space-y-1.5">
                    <Label className="text-xs font-medium text-foreground">
                      最少命中文档
                    </Label>
                    <Input
                      type="number"
                      value={String(minDocs)}
                      onChange={(e) => setMinDocs(Number(e.target.value || 0))}
                      className="h-9 rounded-md border-border bg-card text-sm tabular-nums shadow-none"
                    />
                  </div>

                  <div className="min-w-0 space-y-1.5">
                    <Label className="text-xs font-medium text-foreground">
                      最小命中比例
                    </Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={String(minRatio)}
                      onChange={(e) => setMinRatio(Number(e.target.value || 0))}
                      className="h-9 rounded-md border-border bg-card text-sm tabular-nums shadow-none"
                    />
                  </div>

                  <div className="min-w-0 space-y-1.5">
                    <Label className="text-xs font-medium text-foreground">
                      最大行长度
                    </Label>
                    <Input
                      type="number"
                      value={String(maxLineLength)}
                      onChange={(e) =>
                        setMaxLineLength(Number(e.target.value || 0))
                      }
                      className="h-9 rounded-md border-border bg-card text-sm tabular-nums shadow-none"
                    />
                  </div>

                  <div className="col-span-2 min-w-0 space-y-1.5">
                    <Label className="text-xs font-medium text-foreground">
                      最多候选数
                    </Label>
                    <Input
                      type="number"
                      value={String(maxCandidates)}
                      onChange={(e) =>
                        setMaxCandidates(Number(e.target.value || 0))
                      }
                      className="h-9 rounded-md border-border bg-card text-sm tabular-nums shadow-none"
                    />
                  </div>
                </div>

                <label className="flex cursor-pointer items-start gap-3 border-t border-border px-4 py-3 text-xs leading-5 text-foreground transition-colors hover:bg-muted/30">
                  <Checkbox
                    checked={useOriginal}
                    onCheckedChange={(v) => setUseOriginal(Boolean(v))}
                    className="mt-0.5 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                  />
                  <span>优先基于治理前的原始解析结果进行识别</span>
                </label>
              </section>
          </div>
        </aside>

        <section className="min-w-0">
          <div className="flex min-h-[640px] flex-col overflow-hidden rounded-md border border-border bg-card">
            <div className="flex flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  候选内容
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {resp
                    ? `已扫描 ${resp.used_documents} / ${resp.total_documents} 份文档`
                    : '等待扫描'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {resp && candidates.length ? (
                  <>
                    <span className="inline-flex h-9 items-center rounded-md border border-border bg-muted px-3 text-xs font-medium tabular-nums text-muted-foreground">
                      {sortedCandidates.length} 条候选，已选{' '}
                      {selectedCandidates.length} 条
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-md px-3 text-xs"
                      onClick={() => toggleAll(true)}
                    >
                      全选
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-md px-3 text-xs"
                      onClick={() => toggleAll(false)}
                    >
                      全不选
                    </Button>
                    <Button
                      size="sm"
                      className="h-9 rounded-md px-4 text-xs"
                      onClick={() => detachPromise(applyToProfile())}
                      disabled={loading || !selectedCandidates.length}
                    >
                      {loading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" />
                      ) : (
                        <Hash className="w-3.5 h-3.5" />
                      )}
                      写入模板 ({selectedCandidates.length})
                    </Button>
                  </>
                ) : null}
              </div>
            </div>

            {resp && candidates.length ? (
              <div>
                <div className="hidden grid-cols-[40px_minmax(0,1fr)_7rem_7rem] items-center gap-3 border-b border-border bg-muted/35 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
                  <span />
                  <span>重复内容</span>
                  <span className="text-right">命中文档</span>
                  <span className="text-right">命中比例</span>
                </div>
                <div className="divide-y divide-border">
                  {sortedCandidates.map((candidate) => {
                    const signature = String(candidate.signature || '')
                    const checked = Boolean(selected[signature])
                    const ratio = Number(candidate.ratio || 0)
                    return (
                      <div
                        key={signature}
                        className={cn(
                          'grid grid-cols-[32px_minmax(0,1fr)] items-start gap-3 px-4 py-3 transition-colors md:grid-cols-[40px_minmax(0,1fr)_7rem_7rem]',
                          checked ? 'bg-primary/5' : 'hover:bg-muted/25'
                        )}
                      >
                        <div className="pt-0.5">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) =>
                              setSelected((previous) => ({
                                ...previous,
                                [signature]: Boolean(value),
                              }))
                            }
                          />
                        </div>
                        <div className="min-w-0">
                          <div
                            className="line-clamp-3 break-words text-sm leading-5 text-foreground"
                            title={candidate.sample || candidate.signature}
                          >
                            {candidate.sample || candidate.signature}
                          </div>
                          <div
                            className="mt-1 truncate font-mono text-xs text-muted-foreground"
                            title={candidate.signature}
                          >
                            {candidate.signature}
                          </div>
                          <div className="mt-2 flex gap-3 text-xs text-muted-foreground md:hidden">
                            <span>命中文档 {candidate.docs}</span>
                            <span>命中比例 {ratio.toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="hidden pt-0.5 text-right font-mono text-xs tabular-nums text-foreground md:block">
                          {candidate.docs}
                        </div>
                        <div className="hidden pt-0.5 text-right font-mono text-xs font-medium tabular-nums text-foreground md:block">
                          {ratio.toFixed(2)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
                <div className="mb-4 flex size-12 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                  <Search className="size-5" />
                </div>
                <div className="text-base font-semibold text-foreground">
                  {resp ? '未发现符合条件的重复内容' : '尚未扫描文档'}
                </div>
                {resp ? (
                  <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    可以降低最小命中比例或增加扫描文档数后重试。
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </section>
      </div>

      <Dialog
        open={templateLibraryOpen}
        onOpenChange={(open) => {
          setTemplateLibraryOpen(open)
          if (!open) {
            setSelectedTemplateKeys(new Set())
            setTemplateSearch('')
          }
        }}
      >
        <DialogContent className="max-w-3xl rounded-md">
          <DialogHeader>
            <DialogTitle>选择处理脚本模板</DialogTitle>
            <DialogDescription>
              选中的脚本会以停用草稿保存到当前治理模板，不会自动执行。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Search className="size-4 text-muted-foreground" />
              <Input
                value={templateSearch}
                onChange={(event) => setTemplateSearch(event.target.value)}
                placeholder="搜索名称、说明或标签"
                className="h-9 flex-1 rounded-md text-sm"
              />
            </div>

            <div className="max-h-[480px] overflow-y-auto rounded-md border border-border">
              {templateLibraryQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                  正在加载模板
                </div>
              ) : templateLibraryQuery.error ? (
                <div className="px-4 py-8 text-center text-sm text-destructive">
                  加载模板失败：
                  {formatApiError(templateLibraryQuery.error, '未知错误')}
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {templateSearch ? '没有匹配的模板' : '暂无处理脚本模板'}
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {filteredTemplates.map((tpl) => {
                    const picked = selectedTemplateKeys.has(tpl.key)
                    return (
                      <li
                        key={tpl.key}
                        className={cn(
                          'px-4 py-3 transition-colors hover:bg-muted/40',
                          picked && 'bg-primary/5'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={picked}
                            onCheckedChange={() =>
                              toggleTemplateSelection(tpl.key)
                            }
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`选择 ${tpl.name}`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">
                                {tpl.name}
                              </span>
                              <Badge
                                variant="secondary"
                                className="h-6 rounded-md px-2 text-xs font-medium"
                              >
                                {tpl.language}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="h-6 rounded-md px-2 text-xs font-medium"
                              >
                                {tpl.stage === 'post_parse'
                                  ? '解析后'
                                  : '治理后'}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              {tpl.description}
                            </p>
                            {tpl.tags?.length ? (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {tpl.tags
                                  .filter((t) => t !== 'builtin')
                                  .slice(0, 6)
                                  .map((tag) => (
                                    <span
                                      key={tag}
                                      className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <div className="mr-auto self-center text-xs text-muted-foreground">
              已选 {selectedTemplateKeys.size} / {filteredTemplates.length}
            </div>
            <Button
              variant="outline"
              onClick={() => setTemplateLibraryOpen(false)}
              disabled={importingScript}
            >
              取消
            </Button>
            <Button
              onClick={confirmAddFromTemplateLibrary}
              disabled={importingScript || selectedTemplateKeys.size === 0}
              className="gap-2"
            >
              {importingScript ? (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Sparkles className="size-4" />
              )}
              添加到治理模板
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageScaffold>
  )
}
