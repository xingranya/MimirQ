'use client'

import type { ConnectorRunOut, Dataset, DocumentAccessMode, WebCrawlAuthConfig } from '@/types'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { ChunkStrategyDropdown } from '@/components/business/chunk-strategy-dropdown'
import { ParserDropdown } from '@/components/business/parser-dropdown'
import { GroupChipsInput } from '@/components/groups/group-chips-input'
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
import { detachPromise, trimTrailingSlashes } from '@/lib/utils'
import { buildJiraProjectRunPayload } from './knowledge-jira-project-dialog.payload'

type KnowledgeJiraProjectDialogProps = {
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

const JIRA_SYNC_MODE_VALUES = ['auto', 'full', 'incremental'] as const
const JIRA_AUTH_TYPE_VALUES = ['none', 'cookie', 'bearer', 'basic'] as const
const SOURCE_ACL_FALLBACK_MODE_VALUES = ['only_me', 'partial_members'] as const
const DOCUMENT_ACCESS_MODE_VALUES = ['inherit', 'only_me', 'partial_members', 'all_team_members'] as const
const DETAILS_CLASS = 'group rounded-md border border-border bg-background'
const SUMMARY_CLASS =
  'flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden'

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.host)
  } catch {
    return false
  }
}

function countUniqueMembers(raw: string): number {
  return new Set(
    raw
      .split(/[\n,;]+/g)
      .map((value) => value.trim())
      .filter(Boolean)
  ).size
}

export function KnowledgeJiraProjectDialog({
  open,
  onOpenChange,
  datasets,
  datasetsLoading,
  selectedDatasetId,
  datasetDefaultValue,
  loadDocuments,
  loadConnectorRuns,
  onRunCreated,
}: Readonly<KnowledgeJiraProjectDialogProps>) {
  const { parserBackend, setParserBackend } = useParserBackendPreference()
  const { chunkStrategy, setChunkStrategy } = useChunkStrategyPreference()
  const { enabled: pipelineOverridesEnabled, options: pipelineOptions } = usePipelineOptions()

  const [baseUrl, setBaseUrl] = useState('https://example.atlassian.net')
  const [projectKey, setProjectKey] = useState('')
  const [jql, setJql] = useState('')
  const [datasetId, setDatasetId] = useState<string>(datasetDefaultValue)
  const [syncMode, setSyncMode] = useState<'auto' | 'full' | 'incremental'>('auto')
  const [maxIssues, setMaxIssues] = useState(50)
  const [pageSize, setPageSize] = useState(25)
  const [includeComments, setIncludeComments] = useState(true)
  const [maxCommentsPerIssue, setMaxCommentsPerIssue] = useState(20)
  const [userAgent, setUserAgent] = useState('')
  const [authType, setAuthType] = useState<WebCrawlAuthConfig['type']>('none')
  const [authCookie, setAuthCookie] = useState('')
  const [authToken, setAuthToken] = useState('')
  const [authUsername, setAuthUsername] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [accessMode, setAccessMode] = useState<DocumentAccessMode>('inherit')
  const [accessMembers, setAccessMembers] = useState('')
  const [accessGroupIds, setAccessGroupIds] = useState<string[]>([])
  const [sourceAclEnabled, setSourceAclEnabled] = useState(false)
  const [sourceAclFallbackMode, setSourceAclFallbackMode] = useState<'only_me' | 'partial_members'>('partial_members')
  const [submitting, setSubmitting] = useState(false)

  const normalizedBaseUrl = trimTrailingSlashes(baseUrl)
  const normalizedProjectKey = projectKey.trim().toUpperCase()
  const accessMemberCount = useMemo(() => countUniqueMembers(accessMembers), [accessMembers])
  const baseUrlInvalid = !isValidHttpUrl(normalizedBaseUrl) || normalizedBaseUrl.length > 2000
  const projectKeyInvalid = !normalizedProjectKey || normalizedProjectKey.length > 255
  const jqlInvalid = jql.length > 2000
  const maxIssuesInvalid = !Number.isInteger(maxIssues) || maxIssues < 1 || maxIssues > 500
  const pageSizeInvalid = !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100
  const maxCommentsInvalid =
    includeComments &&
    (!Number.isInteger(maxCommentsPerIssue) || maxCommentsPerIssue < 0 || maxCommentsPerIssue > 200)
  const userAgentInvalid = userAgent.length > 200
  const accessMembersInvalid = accessMemberCount > 200
  const authCredentialsMissing =
    (authType === 'cookie' && !authCookie.trim()) ||
    (authType === 'bearer' && !authToken.trim()) ||
    (authType === 'basic' && (!authUsername.trim() || !authPassword.trim()))
  const hasBlockingError =
    baseUrlInvalid ||
    projectKeyInvalid ||
    jqlInvalid ||
    maxIssuesInvalid ||
    pageSizeInvalid ||
    maxCommentsInvalid ||
    userAgentInvalid ||
    accessMembersInvalid ||
    authCredentialsMissing
  const effectiveChunkStrategy = chunkStrategy === 'langchain_recursive' ? 'jira_ticket' : chunkStrategy
  const hasManualAccessOverride = accessMode !== 'inherit'

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
    if (baseUrlInvalid) {
      toast.error('请输入完整的 Jira 地址，需以 http:// 或 https:// 开头')
      return
    }
    if (projectKeyInvalid) {
      toast.error('请输入 Jira 项目 Key')
      return
    }
    if (jqlInvalid || userAgentInvalid) {
      toast.error('请缩短超出长度限制的内容')
      return
    }
    if (maxIssuesInvalid || pageSizeInvalid || maxCommentsInvalid) {
      toast.error('请修正同步数量设置')
      return
    }
    if (accessMembersInvalid) {
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
        buildJiraProjectRunPayload({
          datasetId,
          datasetDefaultValue,
          baseUrl: normalizedBaseUrl,
          projectKey: normalizedProjectKey,
          jql,
          auth,
          syncMode,
          maxIssues,
          pageSize,
          includeComments,
          maxCommentsPerIssue,
          userAgent,
          parserBackend,
          chunkStrategy: effectiveChunkStrategy,
          pipeline: pipelineOverridesEnabled ? pipelineOptions : undefined,
          accessMode,
          accessMembers,
          accessGroupIds,
          sourceAclEnabled,
          sourceAclFallbackMode,
        })
      )

      toast.success(`已创建 Jira 导入任务：${run.id.slice(0, 8)}`, {
        action: onRunCreated
          ? {
              label: '查看任务',
              onClick: () => onRunCreated(run),
            }
          : undefined,
      })
      clearCredentials()
      onOpenChange(false)
      setProjectKey('')
      setJql('')
      setSyncMode('auto')
      setMaxIssues(50)
      setPageSize(25)
      setIncludeComments(true)
      setMaxCommentsPerIssue(20)
      setUserAgent('')
      setAuthType('none')
      setAccessMode('inherit')
      setAccessMembers('')
      setAccessGroupIds([])
      setSourceAclEnabled(false)
      setSourceAclFallbackMode('partial_members')
      detachPromise(loadConnectorRuns({ datasetId: run.dataset_id || undefined }))
      detachPromise(loadDocuments())
    } catch (error: unknown) {
      toast.error(formatApiError(error, '创建 Jira 导入任务失败'))
    } finally {
      setSubmitting(false)
    }
  }, [
    accessGroupIds,
    accessMembers,
    accessMembersInvalid,
    accessMode,
    authCookie,
    authPassword,
    authToken,
    authType,
    authUsername,
    baseUrlInvalid,
    clearCredentials,
    datasetDefaultValue,
    datasetId,
    effectiveChunkStrategy,
    includeComments,
    jql,
    jqlInvalid,
    loadConnectorRuns,
    loadDocuments,
    maxCommentsInvalid,
    maxCommentsPerIssue,
    maxIssues,
    maxIssuesInvalid,
    normalizedBaseUrl,
    normalizedProjectKey,
    onOpenChange,
    onRunCreated,
    pageSize,
    pageSizeInvalid,
    parserBackend,
    pipelineOptions,
    pipelineOverridesEnabled,
    projectKeyInvalid,
    sourceAclEnabled,
    sourceAclFallbackMode,
    syncMode,
    userAgent,
    userAgentInvalid,
  ])

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="grid h-[min(92dvh,800px)] max-h-[calc(100dvh-1rem)] grid-rows-[auto,1fr,auto] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-4 py-4 pr-14 text-left sm:px-6">
          <DialogTitle>导入 Jira 项目</DialogTitle>
          <DialogDescription>同步 Jira 问题及评论并导入知识库。网页导入服务需由管理员启用。</DialogDescription>
        </DialogHeader>

        <form
          id="jira-project-form"
          className="min-h-0 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6"
          onSubmit={(event) => {
            event.preventDefault()
            void handleSubmit()
          }}
        >
          <div className="space-y-6">
            <section className="space-y-4" aria-labelledby="jira-project-source-heading">
              <div>
                <h3 id="jira-project-source-heading" className="text-sm font-semibold text-foreground">
                  Jira 项目
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">填写项目地址和 Key，即可使用默认设置开始同步。</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="jira-project-base-url">Jira 地址</Label>
                  <Input
                    id="jira-project-base-url"
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                    placeholder="https://example.atlassian.net"
                    maxLength={2000}
                    aria-invalid={baseUrlInvalid}
                    aria-describedby="jira-project-base-url-error"
                    autoFocus
                  />
                  {baseUrlInvalid ? (
                    <p id="jira-project-base-url-error" className="text-xs text-destructive">
                      请输入完整的 http:// 或 https:// 地址。
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jira-project-key">项目 Key</Label>
                  <Input
                    id="jira-project-key"
                    value={projectKey}
                    onChange={(event) => setProjectKey(event.target.value.toUpperCase())}
                    placeholder="PLAT"
                    maxLength={255}
                    aria-invalid={projectKey.length > 0 && projectKeyInvalid}
                    aria-describedby="jira-project-key-help"
                    autoCapitalize="characters"
                  />
                  <p
                    id="jira-project-key-help"
                    className={projectKey.length > 0 && projectKeyInvalid ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
                  >
                    填写 Jira 项目页面中显示的短标识。
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="jira-project-dataset">目标知识库</Label>
                <Select value={datasetId} onValueChange={setDatasetId} disabled={datasetsLoading}>
                  <SelectTrigger id="jira-project-dataset" className="h-10 bg-background">
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
            </section>

            <div className="space-y-3 border-t border-border pt-5">
              <details className={DETAILS_CLASS}>
                <summary className={SUMMARY_CLASS}>
                  <span>同步范围</span>
                  <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                </summary>
                <div className="space-y-4 border-t border-border p-4">
                  <div className="space-y-2">
                    <Label htmlFor="jira-project-jql">筛选条件（可选）</Label>
                    <Textarea
                      id="jira-project-jql"
                      value={jql}
                      onChange={(event) => setJql(event.target.value)}
                      placeholder={'statusCategory != Done\nassignee = currentUser()'}
                      className="min-h-24 font-mono"
                      maxLength={2000}
                      aria-invalid={jqlInvalid}
                      aria-describedby="jira-project-jql-help"
                    />
                    <p id="jira-project-jql-help" className={jqlInvalid ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                      系统会将条件追加到当前项目的查询中，最多 2000 个字符。
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="jira-project-sync-mode">同步方式</Label>
                      <Select
                        value={syncMode}
                        onValueChange={(value) => setSyncMode(coerceOneOf(JIRA_SYNC_MODE_VALUES, value, 'auto'))}
                      >
                        <SelectTrigger id="jira-project-sync-mode" className="h-10 bg-background">
                          <SelectValue placeholder="选择同步方式" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">自动</SelectItem>
                          <SelectItem value="full">全部重新同步</SelectItem>
                          <SelectItem value="incremental">仅同步更新</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="jira-project-max-issues">最多同步问题数</Label>
                      <Input
                        id="jira-project-max-issues"
                        type="number"
                        value={maxIssues}
                        onChange={(event) => setMaxIssues(Number(event.target.value))}
                        min={1}
                        max={500}
                        inputMode="numeric"
                        aria-invalid={maxIssuesInvalid}
                        aria-describedby="jira-project-max-issues-error"
                      />
                      {maxIssuesInvalid ? (
                        <p id="jira-project-max-issues-error" className="text-xs text-destructive">请输入 1 到 500 之间的整数。</p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="jira-project-page-size">每次读取数量</Label>
                      <Input
                        id="jira-project-page-size"
                        type="number"
                        value={pageSize}
                        onChange={(event) => setPageSize(Number(event.target.value))}
                        min={1}
                        max={100}
                        inputMode="numeric"
                        aria-invalid={pageSizeInvalid}
                        aria-describedby="jira-project-page-size-error"
                      />
                      {pageSizeInvalid ? (
                        <p id="jira-project-page-size-error" className="text-xs text-destructive">请输入 1 到 100 之间的整数。</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="divide-y divide-border border-y border-border">
                    <div className="flex min-h-14 items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Label htmlFor="jira-project-include-comments">同步评论</Label>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">评论会随问题正文一起导入，便于检索上下文。</p>
                      </div>
                      <Switch id="jira-project-include-comments" checked={includeComments} onCheckedChange={setIncludeComments} />
                    </div>
                  </div>

                  {includeComments ? (
                    <div className="space-y-2">
                      <Label htmlFor="jira-project-max-comments">每个问题最多同步评论数</Label>
                      <Input
                        id="jira-project-max-comments"
                        type="number"
                        value={maxCommentsPerIssue}
                        onChange={(event) => setMaxCommentsPerIssue(Number(event.target.value))}
                        min={0}
                        max={200}
                        inputMode="numeric"
                        aria-invalid={maxCommentsInvalid}
                        aria-describedby="jira-project-max-comments-help"
                      />
                      <p id="jira-project-max-comments-help" className={maxCommentsInvalid ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                        可填写 0 到 200；填 0 时不读取评论内容。
                      </p>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <Label htmlFor="jira-project-user-agent">访问标识（可选）</Label>
                    <Input
                      id="jira-project-user-agent"
                      value={userAgent}
                      onChange={(event) => setUserAgent(event.target.value)}
                      placeholder="SEEWAY/1.0"
                      maxLength={200}
                      aria-invalid={userAgentInvalid}
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
                    <Label htmlFor="jira-project-auth-type">访问 Jira</Label>
                    <Select
                      value={authType}
                      onValueChange={(value) => setAuthType(coerceOneOf(JIRA_AUTH_TYPE_VALUES, value, 'none'))}
                    >
                      <SelectTrigger id="jira-project-auth-type" className="h-10 bg-background">
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
                      <Label htmlFor="jira-project-auth-cookie">Cookie</Label>
                      <Input
                        id="jira-project-auth-cookie"
                        type="password"
                        value={authCookie}
                        onChange={(event) => setAuthCookie(event.target.value)}
                        placeholder="session=...; other=..."
                        maxLength={20000}
                        autoComplete="off"
                        aria-invalid={!authCookie.trim()}
                        aria-describedby="jira-project-auth-cookie-help"
                      />
                      <p id="jira-project-auth-cookie-help" className={!authCookie.trim() ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                        请输入 Jira 会话 Cookie。
                      </p>
                    </div>
                  ) : null}
                  {authType === 'bearer' ? (
                    <div className="space-y-2">
                      <Label htmlFor="jira-project-auth-token">访问令牌</Label>
                      <Input
                        id="jira-project-auth-token"
                        type="password"
                        value={authToken}
                        onChange={(event) => setAuthToken(event.target.value)}
                        maxLength={10000}
                        autoComplete="off"
                        aria-invalid={!authToken.trim()}
                        aria-describedby="jira-project-auth-token-help"
                      />
                      <p id="jira-project-auth-token-help" className={!authToken.trim() ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                        请输入 Jira 访问令牌。
                      </p>
                    </div>
                  ) : null}
                  {authType === 'basic' ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="jira-project-auth-username">用户名或邮箱</Label>
                        <Input
                          id="jira-project-auth-username"
                          value={authUsername}
                          onChange={(event) => setAuthUsername(event.target.value)}
                          maxLength={500}
                          autoComplete="username"
                          aria-invalid={!authUsername.trim()}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="jira-project-auth-password">密码或 API 令牌</Label>
                        <Input
                          id="jira-project-auth-password"
                          type="password"
                          value={authPassword}
                          onChange={(event) => setAuthPassword(event.target.value)}
                          maxLength={10000}
                          autoComplete="current-password"
                          aria-invalid={!authPassword.trim()}
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
                <div className="space-y-5 border-t border-border p-4">
                  <div className="space-y-2">
                    <Label htmlFor="jira-project-access-mode">文档可见范围</Label>
                    <Select
                      value={accessMode}
                      onValueChange={(value) => setAccessMode(coerceOneOf(DOCUMENT_ACCESS_MODE_VALUES, value, 'inherit'))}
                    >
                      <SelectTrigger id="jira-project-access-mode" className="h-10 bg-background">
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
                        <div id="jira-project-access-groups-label" className="text-sm font-medium text-foreground">
                          允许访问的成员组（可选）
                        </div>
                        <div role="group" aria-labelledby="jira-project-access-groups-label">
                          <GroupChipsInput
                            value={accessGroupIds}
                            onChange={setAccessGroupIds}
                            placeholder="选择成员组"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="jira-project-access-members">允许访问的成员账号（可选）</Label>
                        <Textarea
                          id="jira-project-access-members"
                          value={accessMembers}
                          onChange={(event) => setAccessMembers(event.target.value)}
                          placeholder={'alice\nbob\ncharlie'}
                          className="min-h-24 font-mono"
                          aria-invalid={accessMembersInvalid}
                          aria-describedby="jira-project-access-members-help"
                        />
                        <p
                          id="jira-project-access-members-help"
                          className={accessMembersInvalid ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
                        >
                          已输入 {accessMemberCount} 个账号，最多 200 个；成员组最多选择 200 个。
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-4 border-t border-border pt-4">
                    <div className="flex min-h-14 items-center justify-between gap-4">
                      <div className="min-w-0">
                        <Label htmlFor="jira-project-source-acl">继承 Jira 可见范围</Label>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          按 Jira 中的问题安全级别、角色和评论可见范围限制访问。
                        </p>
                      </div>
                      <Switch
                        id="jira-project-source-acl"
                        checked={sourceAclEnabled}
                        onCheckedChange={setSourceAclEnabled}
                        disabled={hasManualAccessOverride}
                      />
                    </div>
                    {hasManualAccessOverride ? (
                      <p className="text-xs text-warning">使用自定义文档权限时，不会同时继承 Jira 权限。</p>
                    ) : null}

                    {sourceAclEnabled && !hasManualAccessOverride ? (
                      <div className="space-y-2">
                        <Label htmlFor="jira-project-acl-fallback">无法识别 Jira 权限时</Label>
                        <Select
                          value={sourceAclFallbackMode}
                          onValueChange={(value) =>
                            setSourceAclFallbackMode(
                              coerceOneOf(SOURCE_ACL_FALLBACK_MODE_VALUES, value, 'partial_members')
                            )
                          }
                        >
                          <SelectTrigger id="jira-project-acl-fallback" className="h-10 bg-background">
                            <SelectValue placeholder="选择处理方式" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="partial_members">仅允许已识别的成员和成员组</SelectItem>
                            <SelectItem value="only_me">仅本次同步的执行者可见</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs leading-5 text-muted-foreground">默认采用更严格的访问范围，避免文档意外开放。</p>
                      </div>
                    ) : null}
                  </div>
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
                      <div id="jira-project-parser-label" className="text-sm font-medium text-foreground">解析方式</div>
                      <div role="group" aria-labelledby="jira-project-parser-label">
                        <ParserDropdown value={parserBackend} onChange={setParserBackend} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div id="jira-project-chunk-label" className="text-sm font-medium text-foreground">切片策略</div>
                      <div role="group" aria-labelledby="jira-project-chunk-label">
                        <ChunkStrategyDropdown value={effectiveChunkStrategy} onChange={setChunkStrategy} />
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
            form="jira-project-form"
            disabled={submitting || datasetsLoading || hasBlockingError}
            className="w-full gap-2 sm:w-auto"
          >
            {submitting ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
            {submitting ? '正在创建任务' : '创建 Jira 导入任务'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
