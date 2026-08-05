'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import { settingsTextTokens } from '@/components/ui/system-page-tokens'
import { rbacApi, rtbfApi, type SystemSettings, type TenantMember } from '@/lib/api'
import { formatApiError } from '@/lib/api-errors'
import { queryKeys } from '@/lib/query-keys'
import {
  TENANT_PERMISSIONS,
  tenantAccessAllows,
  tenantAccessCanEditDatasets,
} from '@/lib/tenant-permissions'
import { cn, detachPromise } from '@/lib/utils'
import { AlertCircle, ChevronDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type GovernanceSettings = NonNullable<SystemSettings['governance']>

type GovernanceSectionProps = {
  settingsWritable: boolean
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
const PERSONAL_DATA_ACTION_KEY = 'personal-data-action'

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

function GovernanceToggleRow({
  title,
  description,
  checked,
  disabled = false,
  onCheckedChange,
  ariaLabel,
}: Readonly<{
  title: string
  description: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
  ariaLabel: string
}>) {
  return (
    <div
      className={cn(
        'flex min-h-16 items-start justify-between gap-4 px-3 py-3 sm:px-4',
        disabled && 'opacity-60'
      )}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
      <SettingsSwitch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className="shrink-0"
        aria-label={ariaLabel}
      />
    </div>
  )
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
      { label: '错误', value: String(errors), hint: errors > 0 ? '查看处理详情' : '无错误' },
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
      className="mt-4 border-t border-border pt-4"
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

      <dl className="mt-3 grid border-y border-border sm:grid-cols-2 lg:grid-cols-4">
        {result.metrics.map((metric) => (
          <div
            key={metric.label}
            className="min-w-0 border-b border-border px-3 py-2 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0"
          >
            <dt className="text-xs font-medium text-muted-foreground">{metric.label}</dt>
            <dd className="mt-1 text-sm font-medium text-foreground">{metric.value}</dd>
            {metric.hint ? (
              <div className="mt-1 truncate text-xs text-muted-foreground">{metric.hint}</div>
            ) : null}
          </div>
        ))}
      </dl>

      <details
        data-testid="rtbf-raw-response"
        className="group mt-3 border-b border-border pb-3 text-xs text-muted-foreground"
      >
        <summary className="cursor-pointer select-none font-medium text-muted-foreground transition-colors hover:text-primary">
          处理详情（排查问题时展开）
        </summary>
        {result.rawText ? (
          <pre className="mt-2 max-h-44 overflow-auto rounded-md border border-border bg-background p-3 font-mono text-xs leading-5 text-muted-foreground whitespace-pre-wrap break-words">
            {result.rawText}
          </pre>
        ) : (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            完成安全预演或删除后，可在这里查看完整处理结果。
          </p>
        )}
      </details>
    </div>
  )
}

export function GovernanceSection({
  settingsWritable,
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
  const [rtbfError, setRtbfError] = useState<string | null>(null)
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
  const canManagePersonalData = tenantAccessAllows(
    currentAccessQuery.data,
    TENANT_PERMISSIONS.LIFECYCLE_MANAGE
  )
  const canManageDatasetOperations = tenantAccessCanEditDatasets(
    currentAccessQuery.data
  )
  const membersQuery = useQuery({
    queryKey: queryKeys.rbac.members(RTBF_MEMBERS_PARAMS),
    queryFn: async () => {
      const res = await rbacApi.listTenantMembers(RTBF_MEMBERS_PARAMS)
      return Array.isArray(res.items) ? res.items : []
    },
    enabled: canManagePersonalData,
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
    setRtbfError(null)
    try {
      const payload = await action()
      setRtbfResult(payload)
      toast.success(`${title}完成`)
      return payload
    } catch (error) {
      const message = formatApiError(error, `${title}失败`)
      setRtbfResult(null)
      setRtbfError(message)
      toast.error(message)
      return null
    } finally {
      setRtbfRunningKey(null)
    }
  }

  async function runRtbfPreview() {
    const requestedAccountId = normalizedRtbfAccountId
    const requestedMaxDocs = rtbfMaxDocs
    const payload = await runRtbfAction(PERSONAL_DATA_ACTION_KEY, '安全预演', () =>
      rtbfApi.request({
        subject_account_id: requestedAccountId,
        dry_run: true,
        max_docs: requestedMaxDocs,
        max_retries: rtbfMaxRetries,
      })
    )
    if (!payload) {
      setRtbfPreviewSnapshot(null)
      return
    }
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
    const payload = await runRtbfAction(PERSONAL_DATA_ACTION_KEY, '个人数据删除', () =>
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
    <section className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">默认治理策略</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            用于未单独设置治理策略的数据集和文档，只影响后续入库。
          </p>
        </div>
        <span className="text-xs leading-5 text-muted-foreground">
          保存后对新任务生效
        </span>
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
        <GovernanceToggleRow
          title="启用默认数据治理"
          description="关闭后，下方默认策略不会应用到新的入库任务。"
          checked={isGovernanceEnabled}
          disabled={!settingsWritable}
          onCheckedChange={(checked) => updateGovernance({ enabled: checked })}
          ariaLabel="启用或关闭默认数据治理"
        />
        <GovernanceToggleRow
          title="个人信息脱敏"
          description="识别并替换手机号、邮箱等个人信息，可能影响原文可读性和精确检索。"
          checked={isPiiAnonymizeEnabled}
          disabled={!settingsWritable || !isGovernanceEnabled}
          onCheckedChange={(checked) => updateGovernance({ pii_anonymize: checked })}
          ariaLabel="启用或关闭个人信息脱敏"
        />
        <GovernanceToggleRow
          title="密钥信息脱敏"
          description="识别并遮蔽 API 密钥、访问令牌等敏感凭据。"
          checked={isSecretsRedactEnabled}
          disabled={!settingsWritable || !isGovernanceEnabled}
          onCheckedChange={(checked) => updateGovernance({ secrets_redact: checked })}
          ariaLabel="启用或关闭密钥信息脱敏"
        />
        <GovernanceToggleRow
          title="质量过滤后隔离"
          description="文档因内容过少或只有目录被过滤时，将其标记为已隔离，便于后续复核。"
          checked={isQuarantineOnDropEnabled}
          disabled={!settingsWritable || !isGovernanceEnabled}
          onCheckedChange={(checked) => updateGovernance({ quarantine_on_drop: checked })}
          ariaLabel="启用或关闭质量过滤隔离"
        />
      </div>

      <details className="group border-t border-border pt-3">
        <summary className="flex min-h-10 cursor-pointer list-none items-start justify-between gap-3 rounded-md px-1 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">治理运维</span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              个人数据删除、待复核查询和切块预设维护
            </span>
          </span>
          <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </summary>

        <div className="mt-3 space-y-3">

        <DangerZonePanel
          title="个人数据删除"
          impact="会按账号级联影响文档、分块、向量、图谱和缓存；默认只做安全预演，确认范围后才执行删除"
          badge={canManagePersonalData ? '安全操作' : '无操作权限'}
          compact
          tone="neutral"
          icon="help"
        >
          {currentAccessQuery.isError ? (
            <div role="alert" className="mb-3 flex items-start gap-2 border-b border-destructive/20 pb-3 text-xs leading-5 text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              权限状态加载失败，已暂停个人数据操作。请刷新设置页后重试。
            </div>
          ) : !currentAccessQuery.isLoading && !canManagePersonalData ? (
            <p className="mb-3 border-b border-border pb-3 text-xs leading-5 text-muted-foreground">
              当前账号可以查看流程，但没有管理个人数据的权限。
            </p>
          ) : null}
          <fieldset disabled={!canManagePersonalData} className="contents">
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

          <div className="mt-3 border-t border-border pt-3">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1.5 md:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="rtbf-subject-select" className={FIELD_LABEL}>
                    目标账号
                  </label>
                  <span className="text-xs font-medium text-muted-foreground">
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
                  maxLength={255}
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
                  onChange={(event) => {
                    const value = Number.parseInt(event.target.value || '0', 10)
                    setRtbfMaxDocs(Number.isFinite(value) ? Math.min(1000, Math.max(1, value)) : 100)
                  }}
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
                  onChange={(event) => {
                    const value = Number.parseInt(event.target.value || '0', 10)
                    setRtbfMaxRetries(Number.isFinite(value) ? Math.min(10, Math.max(0, value)) : 1)
                  }}
                  className="h-9 rounded-md border-border bg-background text-sm"
                  inputMode="numeric"
                />
                <div className={settingsTextTokens.microText}>可填写 0 到 10，仅在删除失败时重试。</div>
              </div>
              <div className="flex flex-col gap-2 md:col-span-4">
                <p className={settingsTextTokens.helpText}>
                  先确认目标账号并完成安全预演，核对候选数量后再执行删除。处理结果会在本页显示。
                </p>
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
                    {rtbfRunningKey === PERSONAL_DATA_ACTION_KEY ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : null}
                    {rtbfDryRun ? '开始安全预演' : '继续确认删除'}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {rtbfError ? (
            <div role="alert" className="mt-3 flex items-start gap-2 border-t border-destructive/20 pt-3 text-xs leading-5 text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{rtbfError}。请检查目标账号和权限后重试。</span>
            </div>
          ) : null}

          {rtbfResult ? <RtbfResultSummary value={rtbfResult} /> : null}

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
                  {rtbfRunningKey === PERSONAL_DATA_ACTION_KEY ? (
                    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  ) : null}
                  确认并执行删除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          </fieldset>
        </DangerZonePanel>

          <GovernanceOpsPanel
            canManage={canManageDatasetOperations}
            accessLoading={currentAccessQuery.isLoading}
          />
        </div>
      </details>
    </section>
  )
}
