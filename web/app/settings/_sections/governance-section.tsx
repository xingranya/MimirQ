'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DangerZonePanel } from '@/components/settings/danger-zone-panel'
import { GovernanceOpsPanel } from '@/components/settings/governance-ops-panel'
import { SettingsSwitch } from '@/components/settings/settings-switch'
import { settingsTextTokens, systemWorkbenchTokens } from '@/components/ui/system-page-tokens'
import { rbacApi, rtbfApi, type SystemSettings, type TenantMember } from '@/lib/api'
import { formatApiError } from '@/lib/api-errors'
import { queryKeys } from '@/lib/query-keys'
import { cn, detachPromise } from '@/lib/utils'
import { AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type GovernanceSettings = NonNullable<SystemSettings['governance']>

type GovernanceSectionProps = {
  isGovernanceEnabled: boolean
  isPiiAnonymizeEnabled: boolean
  isSecretsRedactEnabled: boolean
  isQuarantineOnDropEnabled: boolean
  updateGovernance: (patch: Partial<GovernanceSettings>) => void
}

const FIELD_LABEL = settingsTextTokens.fieldLabel
const RTBF_MEMBERS_PARAMS = { limit: 500 } as const
const RTBF_CURRENT_ACCOUNT_VALUE = '__current_account__'
const RTBF_MANUAL_ACCOUNT_VALUE = '__manual_account__'

type RtbfTone = 'idle' | 'info' | 'success' | 'danger'
type RtbfSubjectSource = 'current' | 'member' | 'manual'
type RtbfPreviewSnapshot = {
  subjectAccountId: string
  maxDocs: number
  eligible: number
  fingerprint: string
}

type RtbfResultView = {
  title: string
  description: string
  tone: RtbfTone
  badge: string
  metrics: Array<{ label: string; value: string; hint?: string }>
  rawText: string | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function stringValue(value: unknown, fallback = '-'): string {
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? '是' : '否'
  return fallback
}

function numberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function formatRtbfRaw(value: unknown): string | null {
  if (value == null) return null
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return '无法序列化的响应'
  }
}

function rtbfResultTitle(errors: number, dryRun: boolean): string {
  if (errors > 0) return '个人数据操作存在错误'
  if (dryRun) return '安全预演完成'
  return '级联删除已执行'
}

function rtbfResultDescription(
  note: string,
  message: string,
  dryRun: boolean,
  eligible: number,
  deleted: number
): string {
  if (note) return note
  if (message) return message
  if (dryRun) return `本次只评估影响范围，命中 ${eligible} 个候选文档，未执行删除`
  return `本次已执行级联删除，删除 ${deleted}/${eligible} 个候选文档`
}

function rtbfResultTone(errors: number): RtbfTone {
  if (errors > 0) return 'danger'
  return 'success'
}

function rtbfResultBadge(errors: number, dryRun: boolean): string {
  if (errors > 0) return '需排查'
  if (dryRun) return '安全预演'
  return '已执行'
}

function selectedRtbfSubjectValue(
  source: RtbfSubjectSource,
  selectedMember: TenantMember | null
): string {
  if (source === 'current') return RTBF_CURRENT_ACCOUNT_VALUE
  if (source === 'member' && selectedMember) {
    return String(selectedMember.user_id || '').trim()
  }
  return RTBF_MANUAL_ACCOUNT_VALUE
}

function rtbfSubjectSourceLabel(source: RtbfSubjectSource): string {
  if (source === 'current') return '当前账号自动绑定'
  if (source === 'member') return '成员列表选择'
  return '手动覆盖'
}

function rtbfModeButtonClass(isActive: boolean, tone: 'info' | 'destructive') {
  if (isActive && tone === 'info') {
    return 'border-info/30 bg-info/10 text-info'
  }
  if (isActive && tone === 'destructive') {
    return 'border-destructive/35 bg-destructive/10 text-destructive'
  }
  if (tone === 'info') {
    return 'border-border/60 bg-background/70 text-muted-foreground hover:border-info/25 hover:bg-info/5 hover:text-foreground/78'
  }
  return 'border-border/60 bg-background/70 text-muted-foreground hover:border-destructive/25 hover:bg-destructive/5 hover:text-foreground/78'
}

function buildRtbfResultView(value: unknown): RtbfResultView {
  const record = asRecord(value)
  if (!record) {
    return {
      title: '尚未执行个人数据操作',
      description:
        '默认绑定当前账号。需要处理其他成员时，从成员列表选择；只有列表中找不到时才手动输入账号 ID。',
      tone: 'idle',
      badge: '默认自动绑定',
      metrics: [
        { label: '目标账号', value: '自动', hint: '当前账号或成员列表' },
        { label: '第一步', value: '安全预演', hint: '只评估，不删除' },
        { label: '第二步', value: '确认删除', hint: '核对范围后执行' },
      ],
      rawText: null,
    }
  }

  const eligible = numberValue(record.eligible)
  const deleted = numberValue(record.deleted)
  const errors = numberValue(record.errors)
  const cacheInvalidations = numberValue(record.cache_invalidations)
  const documents = Array.isArray(record.documents) ? record.documents.length : eligible
  const dryRun = record.dry_run !== false
  const subject = stringValue(record.subject_account_id, '')
  const note = stringValue(record.note, '')
  const message = stringValue(record.message, '')
  const title = rtbfResultTitle(errors, dryRun)
  const description = rtbfResultDescription(note, message, dryRun, eligible, deleted)

  return {
    title,
    description,
    tone: rtbfResultTone(errors),
    badge: rtbfResultBadge(errors, dryRun),
    metrics: [
      { label: '候选文档', value: String(eligible || documents || 0), hint: subject ? `账号 ${subject}` : '按账号匹配' },
      { label: '已删除', value: String(deleted), hint: dryRun ? '安全预演未删除' : '实际删除数' },
      { label: '错误', value: String(errors), hint: errors > 0 ? '查看原始响应' : '无错误' },
      { label: '缓存刷新', value: String(cacheInvalidations), hint: '相关数据集缓存' },
    ],
    rawText: formatRtbfRaw(value),
  }
}

function rtbfToneClass(tone: RtbfTone): string {
  if (tone === 'danger') return 'border-destructive/25 bg-destructive/10 text-destructive'
  if (tone === 'success') return 'border-success/25 bg-success/10 text-success'
  if (tone === 'info') return 'border-info/25 bg-info/10 text-info'
  return 'border-border/70 bg-muted/40 text-muted-foreground'
}

function rtbfMemberLabel(member: TenantMember): { primary: string; secondary: string } {
  const id = String(member.user_id || '').trim()
  if (!id) return { primary: '未知成员', secondary: '缺少账号 ID' }
  if (id.includes('@')) {
    const [name, domain] = id.split('@')
    return { primary: name || id, secondary: domain || id }
  }
  return { primary: id.length > 18 ? `${id.slice(0, 10)}...${id.slice(-6)}` : id, secondary: '账号 ID' }
}

function RtbfResultSummary({ value }: Readonly<{ value: unknown }>) {
  const result = buildRtbfResultView(value)

  return (
    <div
      data-testid="rtbf-result-summary"
      className="mt-3 rounded-md border border-border bg-background p-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">个人数据操作结果</div>
          <div className="mt-1 text-sm font-medium text-foreground">{result.title}</div>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">{result.description}</p>
        </div>
        <span className={cn('inline-flex min-h-7 w-fit shrink-0 items-center rounded-md border px-2 text-xs font-medium', rtbfToneClass(result.tone))}>
          {result.badge}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {result.metrics.map((metric) => (
          <div key={metric.label} className="rounded-md border border-border bg-muted/10 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-xs font-medium text-muted-foreground">{metric.label}</div>
              <div className="rounded-md bg-background px-2 py-0.5 text-xs font-medium text-foreground">{metric.value}</div>
            </div>
            {metric.hint ? <div className="mt-1.5 truncate text-xs text-muted-foreground">{metric.hint}</div> : null}
          </div>
        ))}
      </div>

      <details
        data-testid="rtbf-raw-response"
        className="group mt-3 rounded-md border border-border bg-muted/15 px-3 py-2 text-xs text-muted-foreground"
      >
        <summary className="cursor-pointer select-none font-medium text-muted-foreground transition-colors hover:text-primary">
          原始响应（排障时展开）
        </summary>
        {result.rawText ? (
          <pre className="mt-2 max-h-44 overflow-auto rounded-md border border-border bg-background p-3 font-mono text-xs leading-5 text-muted-foreground whitespace-pre-wrap break-words">
            {result.rawText}
          </pre>
        ) : (
          <div className="mt-2 rounded-md border border-dashed border-border bg-background px-3 py-2 text-xs text-muted-foreground">
            暂无操作结果。完成安全预演或删除后，可在这里查看完整返回内容。
          </div>
        )}
      </details>
    </div>
  )
}

export function GovernanceSection({
  isGovernanceEnabled,
  isPiiAnonymizeEnabled,
  isSecretsRedactEnabled,
  isQuarantineOnDropEnabled,
  updateGovernance,
}: Readonly<GovernanceSectionProps>) {
  const [rtbfAccountId, setRtbfAccountId] = useState('')
  const [rtbfDryRun, setRtbfDryRun] = useState(true)
  const [rtbfMaxDocs, setRtbfMaxDocs] = useState(100)
  const [rtbfMaxRetries, setRtbfMaxRetries] = useState(1)
  const [rtbfRunningKey, setRtbfRunningKey] = useState<string | null>(null)
  const [rtbfResult, setRtbfResult] = useState<unknown>(null)
  const [rtbfPreviewSnapshot, setRtbfPreviewSnapshot] =
    useState<RtbfPreviewSnapshot | null>(null)
  const [rtbfDeleteDialogOpen, setRtbfDeleteDialogOpen] = useState(false)
  const [rtbfDeleteConfirmValue, setRtbfDeleteConfirmValue] = useState('')
  const [rtbfSubjectSource, setRtbfSubjectSource] =
    useState<RtbfSubjectSource>('current')

  const currentAccessQuery = useQuery({
    queryKey: queryKeys.access.current,
    queryFn: () => rbacApi.getCurrentTenantAccess(),
    retry: false,
  })
  const membersQuery = useQuery({
    queryKey: queryKeys.rbac.members(RTBF_MEMBERS_PARAMS),
    queryFn: async () => {
      const res = await rbacApi.listTenantMembers(RTBF_MEMBERS_PARAMS)
      return Array.isArray(res.items) ? res.items : []
    },
    retry: false,
  })
  const members = useMemo(() => membersQuery.data || [], [membersQuery.data])
  const currentAccountId = String(currentAccessQuery.data?.account_id || '').trim()
  const currentMember = useMemo(() => {
    return (
      members.find((member) => member.is_current && String(member.user_id || '').trim()) ||
      members.find((member) => String(member.user_id || '').trim() === currentAccountId) ||
      null
    )
  }, [currentAccountId, members])
  const autoSubjectId = String(currentMember?.user_id || currentAccountId || '').trim()
  const selectableMembers = useMemo(() => {
    const seen = new Set<string>()
    return members.filter((member) => {
      const id = String(member.user_id || '').trim()
      if (!id || id === autoSubjectId || seen.has(id)) return false
      seen.add(id)
      return true
    })
  }, [autoSubjectId, members])
  const selectedMember = useMemo(
    () => members.find((member) => String(member.user_id || '').trim() === rtbfAccountId.trim()) || null,
    [members, rtbfAccountId]
  )
  const selectedSubjectValue = selectedRtbfSubjectValue(
    rtbfSubjectSource,
    selectedMember
  )
  const subjectSourceLabel = rtbfSubjectSourceLabel(rtbfSubjectSource)
  const isDeleteMode = rtbfDryRun === false
  const normalizedRtbfAccountId = rtbfAccountId.trim()
  const previewMatchesCurrentTarget = Boolean(
    rtbfPreviewSnapshot &&
      rtbfPreviewSnapshot.subjectAccountId === normalizedRtbfAccountId &&
      rtbfPreviewSnapshot.maxDocs === rtbfMaxDocs
  )
  const deleteConfirmationMatches =
    rtbfDeleteConfirmValue.trim() === normalizedRtbfAccountId

  useEffect(() => {
    if (rtbfSubjectSource !== 'current') return
    if (!autoSubjectId) return
    setRtbfAccountId(autoSubjectId)
  }, [autoSubjectId, rtbfSubjectSource])

  useEffect(() => {
    if (previewMatchesCurrentTarget) return
    setRtbfDryRun(true)
    setRtbfDeleteDialogOpen(false)
    setRtbfDeleteConfirmValue('')
  }, [previewMatchesCurrentTarget])

  async function runRtbfAction(
    key: string,
    title: string,
    action: () => Promise<unknown>
  ): Promise<unknown | null> {
    setRtbfRunningKey(key)
    try {
      const payload = await action()
      setRtbfResult(payload)
      toast.success(`${title}完成`)
      return payload
    } catch (error) {
      toast.error(formatApiError(error, `${title}失败`))
      return null
    } finally {
      setRtbfRunningKey(null)
    }
  }

  async function runRtbfPreview() {
    const requestedAccountId = normalizedRtbfAccountId
    const requestedMaxDocs = rtbfMaxDocs
    const payload = await runRtbfAction('RTBF 请求', '安全预演', () =>
      rtbfApi.request({
        subject_account_id: requestedAccountId,
        dry_run: true,
        max_docs: requestedMaxDocs,
        max_retries: rtbfMaxRetries,
      })
    )
    const record = asRecord(payload)
    const fingerprint =
      typeof record?.preview_fingerprint === 'string'
        ? record.preview_fingerprint.trim()
        : ''
    const responseSubject =
      typeof record?.subject_account_id === 'string'
        ? record.subject_account_id.trim()
        : ''
    if (
      !record ||
      record.dry_run !== true ||
      !fingerprint ||
      responseSubject !== requestedAccountId
    ) {
      setRtbfPreviewSnapshot(null)
      toast.error('预演结果不完整，已阻止进入删除步骤')
      return
    }
    setRtbfPreviewSnapshot({
      subjectAccountId: requestedAccountId,
      maxDocs: requestedMaxDocs,
      eligible: numberValue(record.eligible),
      fingerprint,
    })
  }

  async function executeRtbfDeletion() {
    if (!rtbfPreviewSnapshot || !previewMatchesCurrentTarget) {
      toast.error('目标或候选数据已变化，请重新安全预演')
      return
    }
    const payload = await runRtbfAction('RTBF 请求', '个人数据删除', () =>
      rtbfApi.request({
        subject_account_id: normalizedRtbfAccountId,
        dry_run: false,
        max_docs: rtbfMaxDocs,
        max_retries: rtbfMaxRetries,
        preview_fingerprint: rtbfPreviewSnapshot.fingerprint,
      })
    )
    if (!payload) return
    setRtbfDeleteDialogOpen(false)
    setRtbfDeleteConfirmValue('')
    setRtbfPreviewSnapshot(null)
    setRtbfDryRun(true)
  }

  return (
    <section>
      <div className={cn(systemWorkbenchTokens.panel, 'space-y-3 p-3.5')}>
        <div className="flex items-start justify-between gap-3">
          <Alert className="flex-1 p-3 shadow-none [&>svg]:left-3 [&>svg]:top-3 [&>svg~*]:pl-6">
            <AlertCircle className="h-3.5 w-3.5" />
            <div>
              <AlertTitle className="text-xs">默认治理规则</AlertTitle>
              <AlertDescription className={settingsTextTokens.helpText}>
                这些开关会影响“入库前清洗/脱敏”，用于没有单独配置数据集或文档级管线时的默认行为
              </AlertDescription>
            </div>
          </Alert>
          <div className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
            保存后通常可立即生效
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
            <div>
              <div className={settingsTextTokens.panelTitle}>启用数据治理</div>
              <div className={cn(settingsTextTokens.helpText, 'mt-0.5')}>打开后才会应用下方治理项（对新入库文档生效）</div>
            </div>
            <SettingsSwitch
              checked={isGovernanceEnabled}
              onCheckedChange={(checked) => updateGovernance({ enabled: checked })}
              className="shrink-0"
              aria-label="切换数据治理开关（governance.enabled）"
            />
          </div>

          <div className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
            <div>
              <div className={settingsTextTokens.panelTitle}>个人信息脱敏</div>
              <div className={cn(settingsTextTokens.helpText, 'mt-0.5')}>
                尝试识别并匿名化手机号/邮箱等个人信息（可能影响检索/可读性）
              </div>
            </div>
            <SettingsSwitch
              checked={isPiiAnonymizeEnabled}
              onCheckedChange={(checked) => updateGovernance({ pii_anonymize: checked })}
              className="shrink-0"
              aria-label="切换 PII 脱敏（governance.pii_anonymize）"
            />
          </div>

          <div className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
            <div>
              <div className={settingsTextTokens.panelTitle}>密钥信息脱敏</div>
              <div className={cn(settingsTextTokens.helpText, 'mt-0.5')}>
                尝试识别并遮蔽 API 密钥、访问令牌等敏感凭据
              </div>
            </div>
            <SettingsSwitch
              checked={isSecretsRedactEnabled}
              onCheckedChange={(checked) => updateGovernance({ secrets_redact: checked })}
              className="shrink-0"
              aria-label="切换密钥信息脱敏（governance.secrets_redact）"
            />
          </div>

          <div className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
            <div>
              <div className={settingsTextTokens.panelTitle}>质量过滤触发时隔离</div>
              <div className={cn(settingsTextTokens.helpText, 'mt-0.5')}>
                当触发“低密度/仅目录”等过滤时，将文档标记为“已隔离（quarantined）”（便于排查）
              </div>
            </div>
            <SettingsSwitch
              checked={isQuarantineOnDropEnabled}
              onCheckedChange={(checked) => updateGovernance({ quarantine_on_drop: checked })}
              className="shrink-0"
              aria-label="切换过滤后隔离（governance.quarantine_on_drop）"
            />
          </div>
        </div>

        <DangerZonePanel
          title="个人数据删除"
          impact="会按账号级联影响文档、分块、向量、图谱和缓存；默认只做安全预演，确认范围后才执行删除"
          badge="默认收起"
          compact
          tone="neutral"
          icon="help"
        >
          <div className="grid gap-2 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setRtbfDryRun(true)}
              className={cn(
                'rounded-md border px-3 py-2 text-left transition-colors',
                rtbfModeButtonClass(rtbfDryRun, 'info')
              )}
              aria-pressed={rtbfDryRun}
            >
              <div className="text-sm font-medium">安全预演</div>
              <div className="mt-1 text-xs leading-relaxed opacity-80">推荐先点这个，只返回命中文档和影响范围，不删除数据</div>
            </button>
            <button
              type="button"
              onClick={() => {
                if (!previewMatchesCurrentTarget) {
                  toast.info('请先完成当前目标的安全预演')
                  return
                }
                setRtbfDryRun(false)
              }}
              className={cn(
                'rounded-md border px-3 py-2 text-left transition-colors',
                rtbfModeButtonClass(isDeleteMode, 'destructive')
              )}
              aria-pressed={isDeleteMode}
            >
              <div className="text-sm font-medium">执行删除</div>
              <div className="mt-1 text-xs leading-relaxed opacity-80">
                {previewMatchesCurrentTarget
                  ? `已绑定本次预演，共 ${rtbfPreviewSnapshot?.eligible ?? 0} 个候选文档`
                  : '完成安全预演后才能进入，目标或候选变化会自动失效'}
              </div>
            </button>
          </div>

          <div className="mt-3 rounded-md border border-border bg-background p-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1.5 md:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="rtbf-subject-select" className={FIELD_LABEL}>
                    目标账号
                  </label>
                  <span className="rounded-md border border-info/20 bg-info/10 px-2 py-0.5 text-xs font-medium text-info">
                    {subjectSourceLabel}
                  </span>
                </div>
                <Select
                  value={selectedSubjectValue}
                  onValueChange={(value) => {
                    if (value === RTBF_CURRENT_ACCOUNT_VALUE) {
                      setRtbfSubjectSource('current')
                      if (autoSubjectId) setRtbfAccountId(autoSubjectId)
                      return
                    }
                    if (value === RTBF_MANUAL_ACCOUNT_VALUE) {
                      setRtbfSubjectSource('manual')
                      return
                    }
                    setRtbfSubjectSource('member')
                    setRtbfAccountId(value)
                  }}
                >
                  <SelectTrigger
                    id="rtbf-subject-select"
                    className="h-9 rounded-md border-border bg-background text-sm"
                  >
                    <SelectValue placeholder="自动绑定当前账号" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={RTBF_CURRENT_ACCOUNT_VALUE}>
                      当前账号（自动绑定）{autoSubjectId ? ` · ${autoSubjectId}` : ' · 加载中'}
                    </SelectItem>
                    {selectableMembers.map((member) => {
                      const id = String(member.user_id || '').trim()
                      const label = rtbfMemberLabel(member)
                      return (
                        <SelectItem key={id} value={id}>
                          {label.primary} · {label.secondary}
                        </SelectItem>
                      )
                    })}
                    <SelectItem value={RTBF_MANUAL_ACCOUNT_VALUE}>
                      手动输入账号标识
                    </SelectItem>
                  </SelectContent>
                </Select>
                <div
                  className={cn(
                    'rounded-md border border-border/60 bg-muted/10 px-2.5 py-2',
                    settingsTextTokens.microText
                  )}
                >
                  当前目标：
                  <span className="break-all font-mono text-foreground/78">
                    {rtbfAccountId.trim() || '等待自动绑定'}
                  </span>
                  {membersQuery.isError
                    ? '。成员列表加载失败，仍可手动输入账号标识。'
                    : '。默认使用当前账号，也可切换到其他成员。'}
                </div>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label htmlFor="rtbf-manual-account" className={FIELD_LABEL}>
                  手动输入（找不到成员时使用）
                </label>
                <Input
                  id="rtbf-manual-account"
                  value={rtbfSubjectSource === 'manual' ? rtbfAccountId : ''}
                  onChange={(event) => {
                    setRtbfSubjectSource('manual')
                    setRtbfAccountId(event.target.value)
                  }}
                  className="h-9 rounded-md border-border bg-background text-sm"
                  placeholder="例如 user-123、acct-1 或用户 UUID"
                />
                <div className={settingsTextTokens.microText}>
                  系统会匹配文档归属账号和生命周期负责人。请从成员管理或审计日志复制准确标识，不要填写昵称。
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="rtbf-max-docs" className={FIELD_LABEL}>
                  最多扫描文档
                </label>
                <Input
                  id="rtbf-max-docs"
                  type="number"
                  min={1}
                  max={1000}
                  step={1}
                  value={String(rtbfMaxDocs)}
                  onChange={(event) => setRtbfMaxDocs(Number.parseInt(event.target.value || '0', 10) || 100)}
                  className="h-9 rounded-md border-border bg-background text-sm"
                  inputMode="numeric"
                />
                <div className={settingsTextTokens.microText}>可填写 1 到 1000，用于控制单次扫描范围。</div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="rtbf-max-retries" className={FIELD_LABEL}>
                  失败重试
                </label>
                <Input
                  id="rtbf-max-retries"
                  type="number"
                  min={0}
                  max={10}
                  step={1}
                  value={String(rtbfMaxRetries)}
                  onChange={(event) => setRtbfMaxRetries(Number.parseInt(event.target.value || '0', 10) || 1)}
                  className="h-9 rounded-md border-border bg-background text-sm"
                  inputMode="numeric"
                />
                <div className={settingsTextTokens.microText}>可填写 0 到 10，仅在删除失败时重试。</div>
              </div>
              <div className="flex flex-col gap-2 md:col-span-4">
                <div className={cn('rounded-lg border border-dashed border-border/70 bg-muted/15 px-2.5 py-2', settingsTextTokens.helpText)}>
                  操作顺序：确认目标账号 → 安全预演 → 核对候选数量 → 输入目标账号二次确认 → 执行删除。当前删除结果会即时返回，不提供工单状态查询。
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={rtbfDryRun ? 'outline' : 'destructive'}
                    className="h-9 gap-2 rounded-md px-3 text-sm font-medium"
                    disabled={
                      Boolean(rtbfRunningKey) ||
                      !normalizedRtbfAccountId ||
                      (!rtbfDryRun && !previewMatchesCurrentTarget)
                    }
                    onClick={() => {
                      if (rtbfDryRun) {
                        detachPromise(runRtbfPreview())
                        return
                      }
                      setRtbfDeleteDialogOpen(true)
                    }}
                  >
                    {rtbfRunningKey === 'RTBF 请求' ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : null}
                    {rtbfDryRun ? '开始安全预演' : '继续确认删除'}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <RtbfResultSummary value={rtbfResult} />

          <AlertDialog
            open={rtbfDeleteDialogOpen}
            onOpenChange={(open) => {
              if (!open && rtbfRunningKey) return
              setRtbfDeleteDialogOpen(open)
              if (!open) setRtbfDeleteConfirmValue('')
            }}
          >
            <AlertDialogContent className="max-w-lg">
              <AlertDialogHeader>
                <AlertDialogTitle>确认删除该账号的个人数据</AlertDialogTitle>
                <AlertDialogDescription>
                  本次预演找到 {rtbfPreviewSnapshot?.eligible ?? 0} 个候选文档。删除会同步清理文档、分块、向量、图谱和相关缓存，无法撤销。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-2">
                <label htmlFor="rtbf-delete-confirm" className="text-sm font-medium text-foreground">
                  输入目标账号 <span className="break-all">“{normalizedRtbfAccountId}”</span> 以确认
                </label>
                <Input
                  id="rtbf-delete-confirm"
                  value={rtbfDeleteConfirmValue}
                  onChange={(event) => setRtbfDeleteConfirmValue(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel disabled={Boolean(rtbfRunningKey)}>
                  取消
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={
                    Boolean(rtbfRunningKey) ||
                    !previewMatchesCurrentTarget ||
                    !deleteConfirmationMatches
                  }
                  onClick={(event) => {
                    event.preventDefault()
                    detachPromise(executeRtbfDeletion())
                  }}
                >
                  {rtbfRunningKey === 'RTBF 请求' ? (
                    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  ) : null}
                  确认并执行删除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DangerZonePanel>

        <GovernanceOpsPanel />
      </div>
    </section>
  )
}
