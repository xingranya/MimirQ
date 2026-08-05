'use client'

import type { ConnectorRunOut, Dataset, DocumentAccessMode, WebCrawlAuthConfig } from '@/types'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { ChunkStrategyDropdown } from '@/components/business/chunk-strategy-dropdown'
import { ParserDropdown } from '@/components/business/parser-dropdown'
import { GroupChipsInput } from '@/components/groups/group-chips-input'
import {
  analyzeWebCrawlUrls,
  buildWebCrawlRunPayload,
} from '@/components/knowledge/import/knowledge-web-crawl-dialog.payload'
import { PipelineOptionsPanel } from '@/components/pipeline-options-panel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useChunkStrategyPreference } from '@/contexts/chunk-strategy-context'
import { useParserBackendPreference } from '@/contexts/parser-backend-context'
import { usePipelineOptions } from '@/contexts/pipeline-options-context'
import { connectorApi } from '@/lib/api'
import { formatApiError } from '@/lib/api-errors'
import { coerceOneOf } from '@/lib/one-of'
import { detachPromise } from '@/lib/utils'

type KnowledgeWebCrawlDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  datasets: Dataset[]
  datasetsLoading: boolean
  selectedDatasetId?: string
  datasetDefaultValue: string
  loadDocuments: () => void | Promise<void>
  loadConnectorRuns: (params?: { datasetId?: string }) => void | Promise<void>
  onRunCreated?: (run: ConnectorRunOut) => void
}

const WEB_CRAWL_AUTH_TYPES = ['none', 'cookie', 'bearer', 'basic'] as const
const DOCUMENT_ACCESS_MODE_VALUES = ['inherit', 'only_me', 'partial_members', 'all_team_members'] as const
const DETAILS_CLASS = 'group rounded-md border border-border bg-background'
const SUMMARY_CLASS =
  'flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden'

function splitNonEmptyLines(raw: string): string[] {
  return raw
    .split(/\n+/g)
    .map((value) => value.trim())
    .filter(Boolean)
}

function countUniqueMembers(raw: string): number {
  return new Set(
    raw
      .split(/[\n,;]+/g)
      .map((value) => value.trim())
      .filter(Boolean)
  ).size
}

export function KnowledgeWebCrawlDialog({
  open,
  onOpenChange,
  datasets,
  datasetsLoading,
  selectedDatasetId,
  datasetDefaultValue,
  loadDocuments,
  loadConnectorRuns,
  onRunCreated,
}: Readonly<KnowledgeWebCrawlDialogProps>) {
  const { parserBackend, setParserBackend } = useParserBackendPreference()
  const { chunkStrategy, setChunkStrategy } = useChunkStrategyPreference()
  const { enabled: pipelineOverridesEnabled, options: pipelineOptions } = usePipelineOptions()

  const [startUrls, setStartUrls] = useState('')
  const [filename, setFilename] = useState('')
  const [datasetId, setDatasetId] = useState<string>(datasetDefaultValue)
  const [maxPages, setMaxPages] = useState(50)
  const [maxDepth, setMaxDepth] = useState(3)
  const [sameHostOnly, setSameHostOnly] = useState(true)
  const [includePatterns, setIncludePatterns] = useState('')
  const [excludePatterns, setExcludePatterns] = useState('')
  const [useSitemaps, setUseSitemaps] = useState(false)
  const [sitemapUrls, setSitemapUrls] = useState('')
  const [respectRobots, setRespectRobots] = useState(false)
  const [dedupCanonical, setDedupCanonical] = useState(true)
  const [userAgent, setUserAgent] = useState('')
  const [authType, setAuthType] = useState<(typeof WEB_CRAWL_AUTH_TYPES)[number]>('none')
  const [authCookie, setAuthCookie] = useState('')
  const [authToken, setAuthToken] = useState('')
  const [authUsername, setAuthUsername] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [accessMode, setAccessMode] = useState<DocumentAccessMode>('inherit')
  const [accessMembers, setAccessMembers] = useState('')
  const [accessGroupIds, setAccessGroupIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  const startUrlAnalysis = useMemo(() => analyzeWebCrawlUrls(startUrls, 5), [startUrls])
  const sitemapUrlAnalysis = useMemo(() => analyzeWebCrawlUrls(sitemapUrls, 10), [sitemapUrls])
  const validStartUrlCount = startUrlAnalysis.urls.length
  const includePatternEntries = useMemo(() => splitNonEmptyLines(includePatterns), [includePatterns])
  const excludePatternEntries = useMemo(() => splitNonEmptyLines(excludePatterns), [excludePatterns])
  const accessMemberCount = useMemo(() => countUniqueMembers(accessMembers), [accessMembers])
  const maxPagesInvalid = !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 500
  const maxDepthInvalid = !Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 10
  const includePatternsInvalid =
    includePatternEntries.length > 30 || includePatternEntries.some((pattern) => pattern.length > 500)
  const excludePatternsInvalid =
    excludePatternEntries.length > 60 || excludePatternEntries.some((pattern) => pattern.length > 500)
  const startUrlsInvalid = startUrlAnalysis.invalidCount > 0 || startUrlAnalysis.overflowCount > 0
  const sitemapUrlsInvalid =
    useSitemaps && (sitemapUrlAnalysis.invalidCount > 0 || sitemapUrlAnalysis.overflowCount > 0)
  const hasBlockingError =
    startUrlsInvalid ||
    sitemapUrlsInvalid ||
    maxPagesInvalid ||
    maxDepthInvalid ||
    includePatternsInvalid ||
    excludePatternsInvalid ||
    accessMemberCount > 200

  useEffect(() => {
    if (!open) return
    setDatasetId(selectedDatasetId || datasetDefaultValue)
  }, [datasetDefaultValue, open, selectedDatasetId])

  const clearCredentials = useCallback(() => {
    setAuthCookie('')
    setAuthToken('')
    setAuthUsername('')
    setAuthPassword('')
  }, [])

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && submitting) return
      if (!nextOpen) clearCredentials()
      onOpenChange(nextOpen)
    },
    [clearCredentials, onOpenChange, submitting]
  )

  const handleSubmit = useCallback(async () => {
    if (!validStartUrlCount) {
      toast.error('请输入至少一个有效网址，地址需以 http:// 或 https:// 开头')
      return
    }
    if (startUrlsInvalid || sitemapUrlsInvalid) {
      toast.error('请修正格式不正确或超出数量上限的网址')
      return
    }
    if (maxPagesInvalid || maxDepthInvalid) {
      toast.error('请修正抓取页数或链接深度')
      return
    }
    if (includePatternsInvalid || excludePatternsInvalid) {
      toast.error('请修正抓取规则的数量或长度')
      return
    }
    if (accessMemberCount > 200) {
      toast.error('允许访问的成员账号不能超过 200 个')
      return
    }

    let auth: WebCrawlAuthConfig | null = null
    if (authType === 'cookie') {
      const cookie = authCookie.trim()
      if (!cookie) {
        toast.error('请输入 Cookie')
        return
      }
      auth = { type: 'cookie', cookie }
    } else if (authType === 'bearer') {
      const token = authToken.trim()
      if (!token) {
        toast.error('请输入访问令牌')
        return
      }
      auth = { type: 'bearer', token }
    } else if (authType === 'basic') {
      const username = authUsername.trim()
      const password = authPassword.trim()
      if (!username || !password) {
        toast.error('请输入用户名和密码')
        return
      }
      auth = { type: 'basic', username, password }
    }

    setSubmitting(true)
    try {
      const run = await connectorApi.createRun(
        buildWebCrawlRunPayload({
          datasetId,
          datasetDefaultValue,
          startUrls,
          filename,
          maxPages,
          maxDepth,
          sameHostOnly,
          includePatterns,
          excludePatterns,
          useSitemaps,
          sitemapUrls,
          respectRobots,
          dedupCanonical,
          userAgent,
          auth,
          parserBackend,
          chunkStrategy,
          pipeline: pipelineOverridesEnabled ? pipelineOptions : undefined,
          accessMode,
          accessMembers,
          accessGroupIds,
        })
      )

      toast.success(`已创建网页抓取任务：${run.id.slice(0, 8)}`, {
        action: onRunCreated
          ? {
              label: '查看任务',
              onClick: () => onRunCreated(run),
            }
          : undefined,
      })
      clearCredentials()
      onOpenChange(false)
      setStartUrls('')
      setFilename('')
      setMaxPages(50)
      setMaxDepth(3)
      setSameHostOnly(true)
      setIncludePatterns('')
      setExcludePatterns('')
      setUseSitemaps(false)
      setSitemapUrls('')
      setRespectRobots(false)
      setDedupCanonical(true)
      setUserAgent('')
      setAuthType('none')
      setAccessMode('inherit')
      setAccessMembers('')
      setAccessGroupIds([])
      detachPromise(loadConnectorRuns({ datasetId: run.dataset_id || undefined }))
      detachPromise(loadDocuments())
    } catch (error: unknown) {
      toast.error(formatApiError(error, '创建网页抓取任务失败'))
    } finally {
      setSubmitting(false)
    }
  }, [
    accessGroupIds,
    accessMembers,
    accessMode,
    accessMemberCount,
    authCookie,
    authPassword,
    authToken,
    authType,
    authUsername,
    chunkStrategy,
    clearCredentials,
    datasetDefaultValue,
    datasetId,
    dedupCanonical,
    excludePatterns,
    excludePatternsInvalid,
    filename,
    includePatterns,
    includePatternsInvalid,
    loadConnectorRuns,
    loadDocuments,
    maxDepth,
    maxDepthInvalid,
    maxPages,
    maxPagesInvalid,
    onOpenChange,
    onRunCreated,
    parserBackend,
    pipelineOptions,
    pipelineOverridesEnabled,
    respectRobots,
    sameHostOnly,
    sitemapUrlsInvalid,
    sitemapUrls,
    startUrls,
    startUrlsInvalid,
    useSitemaps,
    userAgent,
    validStartUrlCount,
  ])

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="grid h-[min(92dvh,800px)] max-h-[calc(100dvh-1rem)] grid-rows-[auto,1fr,auto] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-4 py-4 pr-14 text-left sm:px-6">
          <DialogTitle>抓取网站内容</DialogTitle>
          <DialogDescription>从指定页面开始抓取并导入知识库。网页导入服务需由管理员启用。</DialogDescription>
        </DialogHeader>

        <form
          id="web-crawl-form"
          className="min-h-0 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6"
          onSubmit={(event) => {
            event.preventDefault()
            void handleSubmit()
          }}
        >
          <div className="space-y-6">
            <section className="space-y-4" aria-labelledby="web-crawl-source-heading">
              <div>
                <h3 id="web-crawl-source-heading" className="text-sm font-semibold text-foreground">
                  抓取来源
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">每行输入一个起始网址，最多 5 个。</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="web-crawl-start-urls">起始网址</Label>
                <Textarea
                  id="web-crawl-start-urls"
                  value={startUrls}
                  onChange={(event) => setStartUrls(event.target.value)}
                  placeholder={'https://example.com\nhttps://docs.example.com'}
                  className="min-h-28 font-mono"
                  aria-describedby="web-crawl-start-urls-status"
                  aria-invalid={startUrlsInvalid}
                  autoFocus
                />
                <p
                  id="web-crawl-start-urls-status"
                  className={startUrlsInvalid ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
                  aria-live="polite"
                >
                  {validStartUrlCount} 个有效网址
                  {startUrlAnalysis.invalidCount ? `，${startUrlAnalysis.invalidCount} 个格式不正确` : ''}
                  {startUrlAnalysis.duplicateCount ? `，${startUrlAnalysis.duplicateCount} 个重复` : ''}
                  {startUrlAnalysis.overflowCount ? `，${startUrlAnalysis.overflowCount} 个超出上限` : ''}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="web-crawl-dataset">目标知识库</Label>
                  <Select value={datasetId} onValueChange={setDatasetId} disabled={datasetsLoading}>
                    <SelectTrigger id="web-crawl-dataset" className="h-10 bg-background">
                      <SelectValue placeholder={datasetsLoading ? '正在加载知识库' : '选择知识库'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={datasetDefaultValue}>自动选择可写知识库</SelectItem>
                      {datasets.map((dataset) => (
                        <SelectItem key={dataset.id} value={dataset.id}>
                          {dataset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="web-crawl-filename">文档名称（可选）</Label>
                  <Input
                    id="web-crawl-filename"
                    value={filename}
                    onChange={(event) => setFilename(event.target.value)}
                    placeholder="例如：产品中心.html"
                    maxLength={500}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="web-crawl-max-pages">最多抓取页数</Label>
                  <Input
                    id="web-crawl-max-pages"
                    type="number"
                    value={maxPages}
                    onChange={(event) => setMaxPages(Number(event.target.value))}
                    min={1}
                    max={500}
                    inputMode="numeric"
                    aria-invalid={maxPagesInvalid}
                    aria-describedby="web-crawl-max-pages-error"
                  />
                  {maxPagesInvalid ? (
                    <p id="web-crawl-max-pages-error" className="text-xs text-destructive">请输入 1 到 500 之间的整数。</p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="web-crawl-max-depth">链接深度</Label>
                  <Input
                    id="web-crawl-max-depth"
                    type="number"
                    value={maxDepth}
                    onChange={(event) => setMaxDepth(Number(event.target.value))}
                    min={0}
                    max={10}
                    inputMode="numeric"
                    aria-invalid={maxDepthInvalid}
                    aria-describedby="web-crawl-max-depth-error"
                  />
                  {maxDepthInvalid ? (
                    <p id="web-crawl-max-depth-error" className="text-xs text-destructive">请输入 0 到 10 之间的整数。</p>
                  ) : null}
                </div>
              </div>

              <div className="flex min-h-12 items-center justify-between gap-4 border-t border-border pt-4">
                <div className="min-w-0">
                  <Label htmlFor="web-crawl-same-host">只抓取同一站点</Label>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">避免任务继续访问外部链接。</p>
                </div>
                <Switch id="web-crawl-same-host" checked={sameHostOnly} onCheckedChange={setSameHostOnly} />
              </div>
            </section>

            <div className="space-y-3 border-t border-border pt-5">
              <details className={DETAILS_CLASS}>
                <summary className={SUMMARY_CLASS}>
                  <span>抓取规则</span>
                  <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                </summary>
                <div className="space-y-4 border-t border-border p-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="web-crawl-include-patterns">仅抓取匹配规则（可选）</Label>
                      <Textarea
                        id="web-crawl-include-patterns"
                        value={includePatterns}
                        onChange={(event) => setIncludePatterns(event.target.value)}
                        placeholder={'^/docs/.*\n^/help/.*'}
                        className="min-h-24 font-mono"
                        aria-invalid={includePatternsInvalid}
                        aria-describedby="web-crawl-include-patterns-help"
                      />
                      <p
                        id="web-crawl-include-patterns-help"
                        className={includePatternsInvalid ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
                      >
                        每行一条，最多 30 条，每条不超过 500 个字符。
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="web-crawl-exclude-patterns">排除匹配规则（可选）</Label>
                      <Textarea
                        id="web-crawl-exclude-patterns"
                        value={excludePatterns}
                        onChange={(event) => setExcludePatterns(event.target.value)}
                        placeholder={'^/blog/.*\n.*\\.(png|jpg|svg)$'}
                        className="min-h-24 font-mono"
                        aria-invalid={excludePatternsInvalid}
                        aria-describedby="web-crawl-exclude-patterns-help"
                      />
                      <p
                        id="web-crawl-exclude-patterns-help"
                        className={excludePatternsInvalid ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
                      >
                        每行一条，最多 60 条，每条不超过 500 个字符。
                      </p>
                    </div>
                  </div>

                  <div className="divide-y divide-border border-y border-border">
                    <div className="flex min-h-14 items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Label htmlFor="web-crawl-use-sitemaps">使用站点地图</Label>
                        <p className="mt-1 text-xs text-muted-foreground">优先从 sitemap.xml 和 robots.txt 发现页面。</p>
                      </div>
                      <Switch id="web-crawl-use-sitemaps" checked={useSitemaps} onCheckedChange={setUseSitemaps} />
                    </div>
                    <div className="flex min-h-14 items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Label htmlFor="web-crawl-respect-robots">遵循 robots.txt</Label>
                        <p className="mt-1 text-xs text-muted-foreground">按站点声明的抓取规则限制访问。</p>
                      </div>
                      <Switch id="web-crawl-respect-robots" checked={respectRobots} onCheckedChange={setRespectRobots} />
                    </div>
                    <div className="flex min-h-14 items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Label htmlFor="web-crawl-dedup-canonical">合并规范链接</Label>
                        <p className="mt-1 text-xs text-muted-foreground">按页面声明的 canonical 地址去除重复内容。</p>
                      </div>
                      <Switch id="web-crawl-dedup-canonical" checked={dedupCanonical} onCheckedChange={setDedupCanonical} />
                    </div>
                  </div>

                  {useSitemaps ? (
                    <div className="space-y-2">
                      <Label htmlFor="web-crawl-sitemap-urls">站点地图地址（可选）</Label>
                      <Textarea
                        id="web-crawl-sitemap-urls"
                        value={sitemapUrls}
                        onChange={(event) => setSitemapUrls(event.target.value)}
                        placeholder={'https://example.com/sitemap.xml\nhttps://example.com/sitemap-index.xml'}
                        className="min-h-24 font-mono"
                        aria-describedby="web-crawl-sitemap-status"
                        aria-invalid={sitemapUrlsInvalid}
                      />
                      <p
                        id="web-crawl-sitemap-status"
                        className={sitemapUrlsInvalid ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
                        aria-live="polite"
                      >
                        {sitemapUrlAnalysis.urls.length} 个有效地址
                        {sitemapUrlAnalysis.invalidCount ? `，${sitemapUrlAnalysis.invalidCount} 个格式不正确` : ''}
                        {sitemapUrlAnalysis.duplicateCount ? `，${sitemapUrlAnalysis.duplicateCount} 个重复` : ''}
                        {sitemapUrlAnalysis.overflowCount ? `，${sitemapUrlAnalysis.overflowCount} 个超出上限` : ''}
                        ；留空时自动查找。
                      </p>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <Label htmlFor="web-crawl-user-agent">User-Agent（可选）</Label>
                    <Input
                      id="web-crawl-user-agent"
                      value={userAgent}
                      onChange={(event) => setUserAgent(event.target.value)}
                      placeholder="SEEWAY/1.0"
                      maxLength={200}
                    />
                  </div>
                </div>
              </details>

              <details className={DETAILS_CLASS}>
                <summary className={SUMMARY_CLASS}>
                  <span>认证方式</span>
                  <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                </summary>
                <div className="space-y-4 border-t border-border p-4">
                  <div className="space-y-2">
                    <Label htmlFor="web-crawl-auth-type">访问受限网页</Label>
                    <Select
                      value={authType}
                      onValueChange={(value) => setAuthType(coerceOneOf(WEB_CRAWL_AUTH_TYPES, value, 'none'))}
                    >
                      <SelectTrigger id="web-crawl-auth-type" className="h-10 bg-background">
                        <SelectValue placeholder="选择认证方式" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">无需认证</SelectItem>
                        <SelectItem value="cookie">Cookie</SelectItem>
                        <SelectItem value="bearer">访问令牌</SelectItem>
                        <SelectItem value="basic">用户名和密码</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {authType === 'cookie' ? (
                    <div className="space-y-2">
                      <Label htmlFor="web-crawl-auth-cookie">Cookie</Label>
                      <Input
                        id="web-crawl-auth-cookie"
                        type="password"
                        value={authCookie}
                        onChange={(event) => setAuthCookie(event.target.value)}
                        placeholder="session=...; other=..."
                        autoComplete="off"
                      />
                    </div>
                  ) : null}
                  {authType === 'bearer' ? (
                    <div className="space-y-2">
                      <Label htmlFor="web-crawl-auth-token">访问令牌</Label>
                      <Input
                        id="web-crawl-auth-token"
                        type="password"
                        value={authToken}
                        onChange={(event) => setAuthToken(event.target.value)}
                        autoComplete="off"
                      />
                    </div>
                  ) : null}
                  {authType === 'basic' ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="web-crawl-auth-username">用户名</Label>
                        <Input
                          id="web-crawl-auth-username"
                          value={authUsername}
                          onChange={(event) => setAuthUsername(event.target.value)}
                          autoComplete="username"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="web-crawl-auth-password">密码</Label>
                        <Input
                          id="web-crawl-auth-password"
                          type="password"
                          value={authPassword}
                          onChange={(event) => setAuthPassword(event.target.value)}
                          autoComplete="current-password"
                        />
                      </div>
                    </div>
                  ) : null}
                  <p className="text-xs leading-5 text-muted-foreground">认证信息只随本次任务提交，关闭弹窗后会从页面清除。</p>
                </div>
              </details>

              <details className={DETAILS_CLASS}>
                <summary className={SUMMARY_CLASS}>
                  <span>访问权限</span>
                  <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                </summary>
                <div className="space-y-4 border-t border-border p-4">
                  <div className="space-y-2">
                    <Label htmlFor="web-crawl-access-mode">文档可见范围</Label>
                    <Select
                      value={accessMode}
                      onValueChange={(value) =>
                        setAccessMode(coerceOneOf(DOCUMENT_ACCESS_MODE_VALUES, value, 'inherit'))
                      }
                    >
                      <SelectTrigger id="web-crawl-access-mode" className="h-10 bg-background">
                        <SelectValue placeholder="选择可见范围" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inherit">继承知识库权限</SelectItem>
                        <SelectItem value="only_me">仅我可见</SelectItem>
                        <SelectItem value="partial_members">指定成员或成员组</SelectItem>
                        <SelectItem value="all_team_members">全部团队成员</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {accessMode === 'partial_members' ? (
                    <div className="space-y-4 border-t border-border pt-4">
                      <div className="space-y-2">
                        <div id="web-crawl-access-groups-label" className="text-sm font-medium text-foreground">
                          允许访问的成员组（可选）
                        </div>
                        <div role="group" aria-labelledby="web-crawl-access-groups-label">
                          <GroupChipsInput
                            value={accessGroupIds}
                            onChange={setAccessGroupIds}
                            placeholder="选择成员组"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="web-crawl-access-members">允许访问的成员账号（可选）</Label>
                        <Textarea
                          id="web-crawl-access-members"
                          value={accessMembers}
                          onChange={(event) => setAccessMembers(event.target.value)}
                          placeholder={'alice\nbob\ncharlie'}
                          className="min-h-24 font-mono"
                          aria-invalid={accessMemberCount > 200}
                          aria-describedby="web-crawl-access-members-help"
                        />
                        <p
                          id="web-crawl-access-members-help"
                          className={accessMemberCount > 200 ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
                        >
                          已输入 {accessMemberCount} 个账号，最多 200 个；成员组最多选择 200 个。
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </details>

              <details className={DETAILS_CLASS}>
                <summary className={SUMMARY_CLASS}>
                  <span>解析与入库</span>
                  <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                </summary>
                <div className="space-y-4 border-t border-border p-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <div id="web-crawl-parser-label" className="text-sm font-medium text-foreground">解析方式</div>
                      <div role="group" aria-labelledby="web-crawl-parser-label">
                        <ParserDropdown value={parserBackend} onChange={setParserBackend} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div id="web-crawl-chunk-label" className="text-sm font-medium text-foreground">切片策略</div>
                      <div role="group" aria-labelledby="web-crawl-chunk-label">
                        <ChunkStrategyDropdown value={chunkStrategy} onChange={setChunkStrategy} />
                      </div>
                    </div>
                  </div>
                  <PipelineOptionsPanel compact />
                </div>
              </details>
            </div>
          </div>
        </form>

        <div className="flex flex-col-reverse gap-2 border-t border-border bg-background p-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleDialogOpenChange(false)}
            disabled={submitting}
            className="w-full sm:w-auto"
          >
            取消
          </Button>
          <Button
            type="submit"
            form="web-crawl-form"
            disabled={submitting || !validStartUrlCount || hasBlockingError}
            className="w-full gap-2 sm:w-auto"
          >
            {submitting ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
            {submitting ? '正在创建任务' : '创建抓取任务'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
