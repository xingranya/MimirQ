'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserCog,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { TenantPermissionGate } from '@/components/auth/tenant-permission-gate'
import { AppFrame } from '@/components/app-frame'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageScaffold } from '@/components/ui/page-scaffold'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatApiError } from '@/lib/api-errors'
import { TENANT_PERMISSIONS, tenantAccessAllows } from '@/lib/tenant-permissions'
import { cn } from '@/lib/utils'
import { rbacApi, type TenantInvitation, type TenantMember } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { EmptyState } from '@/components/ui/empty-state'
import { QueryErrorState } from '@/components/ui/query-error-state'
import { SamlOpsPanel } from '@/components/settings/saml-ops-panel'
import { ScimProvisioningPanel } from '@/components/settings/scim-provisioning-panel'
import { useTenantAccess } from '@/hooks/use-tenant-access'

const ROLE_OPTIONS = [
  {
    key: 'owner',
    label: '所有者',
    cn: 'border-primary/20 bg-primary/10 text-primary',
  },
  {
    key: 'admin',
    label: '管理员',
    cn: 'border-accent/20 bg-accent/10 text-accent',
  },
  {
    key: 'auditor',
    label: '审计员',
    cn: 'border-warning/20 bg-warning/10 text-warning',
  },
  { key: 'editor', label: '编辑者', cn: 'border-info/25 bg-info/10 text-info' },
  {
    key: 'dataset_operator',
    label: '数据集运维',
    cn: 'border-success/20 bg-success/10 text-success',
  },
  {
    key: 'viewer',
    label: '查看者',
    cn: 'border-border/60 bg-muted/45 text-muted-foreground',
  },
]

const PAGE_SIZE_OPTIONS = [7, 10, 20, 50]
const RBAC_MEMBERS_PARAMS = { limit: 500 } as const
const RBAC_INVITATIONS_PARAMS = { status: 'pending', limit: 100 } as const
const CARD_CLASS =
  'rounded-md border border-border bg-card'
const RBAC_FIELD_LABEL_CLASS =
  'text-xs font-medium text-muted-foreground'
const RBAC_INPUT_CLASS =
  'h-9 rounded-md border-border bg-background text-sm'
const RBAC_SOFT_BUTTON_CLASS =
  'h-8 rounded-md border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted'
const RBAC_MUTED_CHIP_CLASS =
  'h-9 w-fit rounded-md border border-border bg-muted/40 px-3 text-xs font-medium text-muted-foreground'
const ROLE_DOT_TONES: Record<string, string> = {
  owner: 'bg-primary',
  admin: 'bg-accent',
  auditor: 'bg-warning',
  editor: 'bg-info',
  dataset_operator: 'bg-success',
  viewer: 'bg-muted-foreground/55',
}

type RbacMembersSnapshot = {
  items: TenantMember[]
  total: number
}

function userDisplay(userId?: string | null) {
  const value = String(userId || '').trim()
  if (!value) return { primary: '未知成员', secondary: '缺少成员标识' }
  const [name, domain] = value.includes('@')
    ? value.split('@')
    : [value, '成员标识']
  return { primary: name || value, secondary: domain || value }
}

function initials(userId?: string | null) {
  const value = String(userId || '').trim()
  if (!value) return '?'
  const head = value.includes('@') ? value.split('@')[0] : value
  return head.slice(0, 1).toUpperCase()
}

function avatarTone(userId?: string | null) {
  const tones = [
    'border-primary/20 bg-primary/10 text-primary',
    'border-success/20 bg-success/10 text-success',
    'border-warning/20 bg-warning/10 text-warning',
    'border-accent/20 bg-accent/10 text-accent',
    'border-border/60 bg-muted/55 text-muted-foreground',
  ]
  const raw = String(userId || '')
  const sum = raw.split('').reduce((acc, char) => acc + (char.codePointAt(0) ?? 0), 0)
  return tones[sum % tones.length]
}

function roleDotTone(roleKey: string): string {
  return ROLE_DOT_TONES[roleKey] ?? ROLE_DOT_TONES.viewer
}

function removeMemberDescription({
  canRemove,
  isSelf,
  displayName,
}: {
  canRemove: boolean
  isSelf: boolean
  displayName: string
}): string {
  if (canRemove) {
    return `将把 ${displayName} 从当前组织移除，并撤销组和单独授予的访问权限。`
  }
  if (isSelf) return '不能移除当前用户。请切换到其他管理员账号后再操作。'
  return '缺少成员标识，无法移除。'
}

function fmtDateTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(date)
    .replaceAll('/', '-')
}

export default function SettingsRbacPage() {
  return (
    <TenantPermissionGate
      permission={TENANT_PERMISSIONS.SETTINGS_READ}
      pageName="成员权限"
    >
      <SettingsRbacPageContent />
    </TenantPermissionGate>
  )
}

function SettingsRbacPageContent() {
  const queryClient = useQueryClient()
  const tenantAccessQuery = useTenantAccess()
  const [roleDraft, setRoleDraft] = useState<Record<string, string>>({})
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({})
  const [removingIds, setRemovingIds] = useState<Record<string, boolean>>({})
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(7)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('viewer')
  const [inviteId, setInviteId] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [inviteExpiresAt, setInviteExpiresAt] = useState('')
  const [inviteCopied, setInviteCopied] = useState(false)

  const membersQuery = useQuery<RbacMembersSnapshot>({
    queryKey: queryKeys.rbac.members(RBAC_MEMBERS_PARAMS),
    retry: false,
    queryFn: async () => {
      const res = await rbacApi.listTenantMembers(RBAC_MEMBERS_PARAMS)
      const items = Array.isArray(res.items) ? res.items : []
      return {
        items,
        total: Number(res.total || items.length || 0),
      }
    },
  })

  const members = useMemo(
    () => membersQuery.data?.items || [],
    [membersQuery.data?.items]
  )
  const currentAccountId = String(tenantAccessQuery.data?.account_id || '').trim()
  const canManageMembers = tenantAccessAllows(
    tenantAccessQuery.data,
    TENANT_PERMISSIONS.SETTINGS_WRITE
  )
  const invitationsQuery = useQuery({
    queryKey: queryKeys.rbac.invitations(RBAC_INVITATIONS_PARAMS),
    enabled: canManageMembers,
    retry: false,
    queryFn: () => rbacApi.listTenantInvitations(RBAC_INVITATIONS_PARAMS),
  })
  const pendingInvitations = useMemo<TenantInvitation[]>(
    () => invitationsQuery.data?.items || [],
    [invitationsQuery.data?.items]
  )
  const totalMembers = Number(membersQuery.data?.total ?? members.length)
  const hasMembersSnapshot = membersQuery.data !== undefined
  const hasInvitationsSnapshot = invitationsQuery.data !== undefined
  const membersLoadError = membersQuery.error
    ? formatApiError(membersQuery.error, '成员列表加载失败')
    : null
  const invitationsLoadError = invitationsQuery.error
    ? formatApiError(invitationsQuery.error, '邀请列表加载失败')
    : null
  const membersUnavailable = Boolean(membersLoadError) && !hasMembersSnapshot
  const invitationsUnavailable =
    Boolean(invitationsLoadError) && !hasInvitationsSnapshot
  const loadingMembers = membersQuery.isFetching
  const loadingInvitations = invitationsQuery.isFetching
  const refreshing = loadingMembers || (canManageMembers && loadingInvitations)
  const hasMemberFilters =
    Boolean(query.trim()) || roleFilter !== 'all' || statusFilter !== 'all'

  const filtered = useMemo(() => {
    const q = String(query || '')
      .trim()
      .toLowerCase()
    return (members || []).filter((m) => {
      const uid = String(m.user_id || '').toLowerCase()
      const role = String(m.role || '').toLowerCase()
      const matchesQuery = !q || uid.includes(q) || role.includes(q)
      const matchesRole = roleFilter === 'all' || role === roleFilter
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'current' && m.is_current) ||
        (statusFilter === 'members' && !m.is_current) ||
        (statusFilter === 'unassigned' && !role)
      return matchesQuery && matchesRole && matchesStatus
    })
  }, [members, query, roleFilter, statusFilter])

  const adminCount = useMemo(
    () =>
      members.filter((member) =>
        ['owner', 'admin'].includes(String(member.role || '').toLowerCase())
      ).length,
    [members]
  )
  const unassignedCount = useMemo(
    () => members.filter((member) => !String(member.role || '').trim()).length,
    [members]
  )
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const pagedMembers = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  )
  const pagedMemberRows = pagedMembers.map((member, index) => {
    const uid = String(member.user_id || '').trim()
    const currentRole = String(member.role || 'viewer')
    const draft = uid
      ? String(roleDraft[uid] || currentRole)
      : currentRole
    const display = userDisplay(uid)
    const isSelf = Boolean(uid) && (
      uid === currentAccountId || (!currentAccountId && member.is_current)
    )
    const canRemove = Boolean(uid) && !isSelf
    return {
      member,
      uid,
      key: uid || String(member.id || `member-${safePage}-${index}`),
      currentRole,
      draft,
      roleChanged: draft !== currentRole,
      saving: uid ? Boolean(savingIds[uid]) : false,
      removing: uid ? Boolean(removingIds[uid]) : false,
      display,
      isSelf,
      canRemove,
      removeDescription: removeMemberDescription({
        canRemove,
        isSelf,
        displayName: display.primary,
      }),
    }
  })

  const saveRoleMutation = useMutation({
    mutationFn: async ({
      uid,
      desired,
    }: {
      uid: string
      desired: string
    }) => {
      return rbacApi.patchTenantMemberRole(uid, { role: desired })
    },
    onMutate: ({ uid }) => {
      setSavingIds((prev) => ({ ...prev, [uid]: true }))
    },
    onSuccess: (updated, { uid, desired }) => {
      queryClient.setQueryData<RbacMembersSnapshot>(
        queryKeys.rbac.members(RBAC_MEMBERS_PARAMS),
        (prev) => {
          const previousItems = Array.isArray(prev?.items) ? prev.items : []
          const nextItems = previousItems.map((member) =>
            String(member.user_id || '') === uid ? updated : member
          )
          return {
            items: nextItems.length ? nextItems : [updated],
            total: Number(prev?.total ?? (nextItems.length || 1)),
          }
        }
      )
      setRoleDraft((prev) => {
        const next = { ...prev }
        delete next[uid]
        return next
      })
      const roleLabel =
        ROLE_OPTIONS.find((option) => option.key === desired)?.label ??
        '未知角色'
      toast.success(`已将 ${uid} 的角色更新为${roleLabel}`)
      queryClient.invalidateQueries({
        queryKey: queryKeys.rbac.members(RBAC_MEMBERS_PARAMS),
      })
    },
    onError: (err: unknown) => {
      toast.error(formatApiError(err, '更新角色失败'))
    },
    onSettled: (_data, _error, variables) => {
      if (!variables?.uid) return
      setSavingIds((prev) => ({ ...prev, [variables.uid]: false }))
    },
  })

  function saveRole(userId: string): void {
    const uid = String(userId || '').trim()
    if (!uid) return
    const currentRole =
      members.find((member) => String(member.user_id || '') === uid)?.role ||
      'viewer'
    const desired = String(roleDraft[uid] || currentRole || 'viewer').trim()
    saveRoleMutation.mutate({ uid, desired: desired || 'viewer' })
  }

  const removeMemberMutation = useMutation({
    mutationFn: async (uid: string) => rbacApi.removeTenantMember(uid),
    onMutate: (uid) => {
      setRemovingIds((prev) => ({ ...prev, [uid]: true }))
    },
    onSuccess: (_result, uid) => {
      queryClient.setQueryData<RbacMembersSnapshot>(
        queryKeys.rbac.members(RBAC_MEMBERS_PARAMS),
        (prev) => {
          const previousItems = Array.isArray(prev?.items) ? prev.items : []
          const nextItems = previousItems.filter(
            (member) => String(member.user_id || '') !== uid
          )
          return {
            items: nextItems,
            total: Math.max(0, Number(prev?.total ?? previousItems.length) - 1),
          }
        }
      )
      setRoleDraft((prev) => {
        const next = { ...prev }
        delete next[uid]
        return next
      })
      toast.success(`已移除成员：${uid}`)
      queryClient.invalidateQueries({
        queryKey: queryKeys.rbac.members(RBAC_MEMBERS_PARAMS),
      })
    },
    onError: (err: unknown) => {
      toast.error(formatApiError(err, '移除成员失败'))
    },
    onSettled: (_data, _error, uid) => {
      if (!uid) return
      setRemovingIds((prev) => ({ ...prev, [uid]: false }))
    },
  })

  function removeMember(userId: string): void {
    const uid = String(userId || '').trim()
    if (!uid) return
    removeMemberMutation.mutate(uid)
  }

  const inviteMutation = useMutation({
    mutationFn: async () =>
      rbacApi.createTenantInvitation({
        email: inviteEmail.trim(),
        role: inviteRole,
    }),
    onSuccess: (invitation) => {
      const token = encodeURIComponent(invitation.token)
      setInviteId(invitation.id)
      setInviteLink(`${globalThis.location.origin}/auth/invite#token=${token}`)
      setInviteExpiresAt(invitation.expires_at)
      setInviteCopied(false)
      toast.success('邀请链接已生成')
      queryClient.invalidateQueries({
        queryKey: queryKeys.rbac.invitations(RBAC_INVITATIONS_PARAMS),
      })
    },
    onError: (err: unknown) => {
      toast.error(formatApiError(err, '生成邀请链接失败'))
    },
  })

  const revokeInvitationMutation = useMutation({
    mutationFn: (invitationId: string) =>
      rbacApi.revokeTenantInvitation(invitationId),
    onSuccess: (_result, invitationId) => {
      toast.success('邀请已撤销')
      queryClient.invalidateQueries({
        queryKey: queryKeys.rbac.invitations(RBAC_INVITATIONS_PARAMS),
      })
      if (invitationId === inviteId) {
        setInviteOpen(false)
        resetInvitationForm()
      }
    },
    onError: (err: unknown) => {
      toast.error(formatApiError(err, '撤销邀请失败'))
    },
  })

  async function copyInviteLink(): Promise<void> {
    if (!inviteLink || !globalThis.navigator?.clipboard?.writeText) {
      toast.error('当前浏览器无法自动复制，请手动选择链接')
      return
    }
    try {
      await globalThis.navigator.clipboard.writeText(inviteLink)
      setInviteCopied(true)
      toast.success('邀请链接已复制')
    } catch {
      toast.error('复制失败，请手动选择链接')
    }
  }

  function resetInvitationForm(): void {
    setInviteEmail('')
    setInviteRole('viewer')
    setInviteId('')
    setInviteLink('')
    setInviteExpiresAt('')
    setInviteCopied(false)
    inviteMutation.reset()
  }

  return (
    <AppFrame>
      <PageScaffold
        title="成员权限"
        description="管理成员角色、访问范围和权限状态"
        iconImage="members-rbac"
        icon={ShieldCheck}
        iconColor="text-primary"
        size="full"
        compact
        bodyGutter="dense"
        bodyClassName="bg-transparent pb-6"
        headerClassName="[&_.text-muted-foreground]:text-muted-foreground"
        top={
          <div className="grid overflow-hidden rounded-md border border-border bg-border md:grid-cols-3 md:gap-px">
            <StatCard
              icon={Users}
              label="总成员"
              value={hasMembersSnapshot ? String(totalMembers || members.length) : '--'}
              detail="可管理成员"
              tone="blue"
            />
            <StatCard
              icon={UserCog}
              label="管理员"
              value={hasMembersSnapshot ? String(adminCount) : '--'}
              detail="高权限成员"
              tone="green"
            />
            <StatCard
              icon={UserPlus}
              label="未分配角色"
              value={hasMembersSnapshot ? String(unassignedCount) : '--'}
              detail="待补齐角色"
              tone="orange"
            />
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <Dialog
              open={inviteOpen}
              onOpenChange={(open) => {
                if (!open && inviteMutation.isPending) return
                setInviteOpen(open)
                if (!open) resetInvitationForm()
              }}
            >
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  className="h-9 gap-2 rounded-md px-3"
                  disabled={!canManageMembers}
                  title={canManageMembers ? '邀请成员' : '当前账号没有成员管理权限'}
                >
                  <UserPlus className="size-4" />
                  邀请成员
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-md sm:max-w-md">
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (!inviteLink) inviteMutation.mutate()
                  }}
                >
                  <DialogHeader>
                    <DialogTitle>邀请公司成员</DialogTitle>
                    <DialogDescription>
                      生成默认 7 天内有效的邀请链接。受邀者将自行设置用户名和密码。
                    </DialogDescription>
                  </DialogHeader>

                  {inviteLink ? (
                    <div className="mt-5 space-y-2">
                      <Label htmlFor="tenant-invitation-link">邀请链接</Label>
                      <div className="flex gap-2">
                        <Input
                          id="tenant-invitation-link"
                          value={inviteLink}
                          readOnly
                          className="h-10 min-w-0 rounded-md font-mono text-xs"
                          onFocus={(event) => event.currentTarget.select()}
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="size-10 shrink-0 rounded-md"
                          aria-label={inviteCopied ? '邀请链接已复制' : '复制邀请链接'}
                          title={inviteCopied ? '已复制' : '复制链接'}
                          onClick={() => {
                            void copyInviteLink()
                          }}
                        >
                          {inviteCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        请通过公司内部的安全渠道发送给 {inviteEmail.trim()}。有效期至 {fmtDateTime(inviteExpiresAt)}。
                      </p>
                    </div>
                  ) : (
                    <div className="mt-5 space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="tenant-invitation-email">成员邮箱</Label>
                        <Input
                          id="tenant-invitation-email"
                          type="email"
                          autoComplete="email"
                          value={inviteEmail}
                          onChange={(event) => setInviteEmail(event.target.value)}
                          placeholder="name@company.com"
                          className="h-10 rounded-md"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tenant-invitation-role">初始角色</Label>
                        <Select value={inviteRole} onValueChange={setInviteRole}>
                          <SelectTrigger id="tenant-invitation-role" className="h-10 rounded-md">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.filter((role) => role.key !== 'owner').map((role) => (
                              <SelectItem key={role.key} value={role.key}>
                                {role.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  <DialogFooter className="mt-6 gap-2 sm:space-x-0">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-md"
                      disabled={inviteMutation.isPending}
                      onClick={() => setInviteOpen(false)}
                    >
                      {inviteLink ? '完成' : '取消'}
                    </Button>
                    {inviteLink && inviteId ? (
                      <Button
                        type="button"
                        variant="destructive"
                        className="rounded-md"
                        disabled={revokeInvitationMutation.isPending}
                        onClick={() => revokeInvitationMutation.mutate(inviteId)}
                      >
                        {revokeInvitationMutation.isPending ? (
                          <Loader2 className="mr-2 size-4 animate-spin motion-reduce:animate-none" />
                        ) : (
                          <Trash2 className="mr-2 size-4" />
                        )}
                        撤销链接
                      </Button>
                    ) : null}
                    {!inviteLink ? (
                      <Button
                        type="submit"
                        className="rounded-md"
                        disabled={!inviteEmail.trim() || inviteMutation.isPending}
                      >
                        {inviteMutation.isPending ? (
                          <Loader2 className="mr-2 size-4 animate-spin motion-reduce:animate-none" />
                        ) : (
                          <UserPlus className="mr-2 size-4" />
                        )}
                        {inviteMutation.isPending ? '生成中' : '生成邀请链接'}
                      </Button>
                    ) : null}
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            <Button
              variant="outline"
              size="sm"
              className={cn(RBAC_SOFT_BUTTON_CLASS, 'gap-2')}
              disabled={refreshing}
              onClick={() => {
                membersQuery.refetch()
                if (canManageMembers) invitationsQuery.refetch()
              }}
            >
              <RefreshCw
                className={cn(
                  'size-4',
                  refreshing && 'animate-spin motion-reduce:animate-none'
                )}
              />
              刷新
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4">
          <section className={cn(CARD_CLASS, 'overflow-hidden')}>
            <div className="border-b border-border px-4 py-3 sm:px-5">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Users className="size-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    成员管理
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    搜索成员并调整角色。邀请入口位于页面右上角。
                  </p>
                </div>
              </div>
            </div>

            <div className="px-4 py-3 sm:px-5">
              {membersLoadError && hasMembersSnapshot ? (
                <QueryErrorState
                  title="成员列表刷新失败"
                  description={membersLoadError}
                  onRetry={() => membersQuery.refetch()}
                  retrying={loadingMembers}
                  className="mb-3"
                />
              ) : null}

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.1fr)_220px_220px_auto] xl:items-end">
                <div className="space-y-1.5">
                  <Label className={RBAC_FIELD_LABEL_CLASS}>
                    搜索成员
                  </Label>
                  <Input
                    className={cn(RBAC_INPUT_CLASS, 'placeholder:text-muted-foreground')}
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value)
                      setPage(1)
                    }}
                    placeholder="搜索邮箱或成员标识"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className={RBAC_FIELD_LABEL_CLASS}>
                    角色
                  </Label>
                  <Select
                    value={roleFilter}
                    onValueChange={(value) => {
                      setRoleFilter(value)
                      setPage(1)
                    }}
                  >
                    <SelectTrigger className={RBAC_INPUT_CLASS}>
                      <SelectValue placeholder="全部角色" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部角色</SelectItem>
                      {ROLE_OPTIONS.map((role) => (
                        <SelectItem key={role.key} value={role.key}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className={RBAC_FIELD_LABEL_CLASS}>
                    状态
                  </Label>
                  <Select
                    value={statusFilter}
                    onValueChange={(value) => {
                      setStatusFilter(value)
                      setPage(1)
                    }}
                  >
                    <SelectTrigger className={RBAC_INPUT_CLASS}>
                      <SelectValue placeholder="全部状态" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部状态</SelectItem>
                      <SelectItem value="current">当前用户</SelectItem>
                      <SelectItem value="members">普通成员</SelectItem>
                      <SelectItem value="unassigned">未分配角色</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Badge
                  variant="outline"
                  className={RBAC_MUTED_CHIP_CLASS}
                >
                  显示 {filtered.length} / {totalMembers || members.length}
                </Badge>
              </div>

              <div className="mt-3 space-y-2 xl:hidden">
                {pagedMemberRows.length ? (
                  pagedMemberRows.map((row) => (
                    <article
                      key={row.key}
                      className="rounded-md border border-border bg-card p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={cn(
                              'flex size-9 shrink-0 items-center justify-center rounded-md border text-sm font-semibold',
                              avatarTone(row.uid)
                            )}
                          >
                            {initials(row.uid)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-foreground">
                              {row.display.primary}
                            </div>
                            <div className="mt-0.5 truncate text-xs text-muted-foreground">
                              {row.display.secondary}
                            </div>
                          </div>
                        </div>
                        <MemberStatusBadge isSelf={row.isSelf} />
                      </div>

                      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                        <div className="min-w-0">
                          <dt className="text-muted-foreground">成员标识</dt>
                          <dd className="mt-1 truncate font-mono text-foreground">
                            {row.uid || '缺少成员标识'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">最近更新</dt>
                          <dd className="mt-1 text-foreground">
                            {fmtDateTime(
                              row.member.updated_at || row.member.created_at
                            )}
                          </dd>
                        </div>
                      </dl>

                      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                        <div className="space-y-1.5">
                          <Label className={RBAC_FIELD_LABEL_CLASS}>角色</Label>
                          <MemberRoleSelect
                            value={row.draft}
                            disabled={!canManageMembers || !row.uid}
                            onValueChange={(value) => {
                              if (!row.uid) return
                              setRoleDraft((previous) => ({
                                ...previous,
                                [row.uid]: value,
                              }))
                            }}
                          />
                        </div>
                        <MemberActionButtons
                          canManageMembers={canManageMembers}
                          canRemove={row.canRemove}
                          displayName={row.display.primary}
                          isSelf={row.isSelf}
                          removeDescription={row.removeDescription}
                          removing={row.removing}
                          roleChanged={row.roleChanged}
                          saving={row.saving}
                          uid={row.uid}
                          onRemove={removeMember}
                          onSave={saveRole}
                        />
                      </div>
                    </article>
                  ))
                ) : membersUnavailable ? (
                  <QueryErrorState
                    title="成员列表加载失败"
                    description={membersLoadError || '暂时无法读取成员列表。'}
                    onRetry={() => membersQuery.refetch()}
                    retrying={loadingMembers}
                  />
                ) : !hasMembersSnapshot && loadingMembers ? (
                  <div className="rounded-md border border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    正在加载成员…
                  </div>
                ) : (
                  <EmptyState
                    icon={Users}
                    title={hasMemberFilters ? '没有符合条件的成员' : '暂无成员'}
                    description={
                      hasMemberFilters
                        ? '请调整搜索内容或筛选条件后再试。'
                        : '管理员可以使用页面右上角的邀请入口添加成员。'
                    }
                    className="rounded-md border-border bg-card"
                  />
                )}
              </div>

              <div className="mt-3 hidden overflow-hidden rounded-md border border-border xl:block">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] table-fixed border-collapse text-left">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
                        <th className="w-[31%] px-3 py-2.5">成员</th>
                        <th className="w-[28%] px-3 py-2.5">邮箱或成员标识</th>
                        <th className="w-[15%] px-3 py-2.5">角色</th>
                        <th className="w-[9%] px-3 py-2.5">状态</th>
                        <th className="w-[10%] px-3 py-2.5">最近更新</th>
                        <th className="w-[7%] px-3 py-2.5 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 bg-card/72">
                      {pagedMemberRows.length ? (
                        pagedMemberRows.map((row) => {
                          return (
                            <tr
                              key={row.key}
                              className="text-sm text-foreground transition-colors hover:bg-muted/40 motion-reduce:transition-none"
                            >
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-3">
                                  <div
                                    className={cn(
                                      'flex size-8 shrink-0 items-center justify-center rounded-md border text-xs font-semibold',
                                      avatarTone(row.uid)
                                    )}
                                  >
                                    {initials(row.uid)}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="truncate font-semibold text-foreground" title={row.display.primary}>
                                      {row.display.primary}
                                    </div>
                                    <div className="truncate text-xs text-muted-foreground">
                                      {row.display.secondary}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <div
                                  className="truncate font-mono text-xs text-muted-foreground"
                                  title={row.uid || '缺少成员标识'}
                                >
                                  {row.uid || '缺少成员标识'}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <MemberRoleSelect
                                  value={row.draft}
                                  disabled={!canManageMembers || !row.uid}
                                  onValueChange={(value) => {
                                    if (!row.uid) return
                                    setRoleDraft((previous) => ({
                                      ...previous,
                                      [row.uid]: value,
                                    }))
                                  }}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <MemberStatusBadge isSelf={row.isSelf} />
                              </td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">
                                {fmtDateTime(
                                  row.member.updated_at || row.member.created_at
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <MemberActionButtons
                                  canManageMembers={canManageMembers}
                                  canRemove={row.canRemove}
                                  displayName={row.display.primary}
                                  isSelf={row.isSelf}
                                  removeDescription={row.removeDescription}
                                  removing={row.removing}
                                  roleChanged={row.roleChanged}
                                  saving={row.saving}
                                  uid={row.uid}
                                  onRemove={removeMember}
                                  onSave={saveRole}
                                />
                              </td>
                            </tr>
                          )
                        })
                      ) : (
                        <tr>
                          <td colSpan={6}>
                            {membersUnavailable ? (
                              <QueryErrorState
                                title="成员列表加载失败"
                                description={membersLoadError || '暂时无法读取成员列表。'}
                                onRetry={() => membersQuery.refetch()}
                                retrying={loadingMembers}
                                className="m-3"
                              />
                            ) : !hasMembersSnapshot && loadingMembers ? (
                              <div className="px-4 py-10 text-sm text-muted-foreground">
                                正在加载成员…
                              </div>
                            ) : (
                              <EmptyState
                                icon={Users}
                                title={hasMemberFilters ? '没有符合条件的成员' : '暂无成员'}
                                description={
                                  hasMemberFilters
                                    ? '请调整搜索内容或筛选条件后再试。'
                                    : '管理员可以使用页面右上角的邀请入口添加成员。'
                                }
                                className="rounded-none border-0 shadow-none"
                              />
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-3 border-t border-border px-1 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs font-medium text-muted-foreground">
                    共 {filtered.length} 条
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={String(pageSize)}
                      onValueChange={(value) => {
                        setPageSize(Number(value))
                        setPage(1)
                      }}
                    >
                      <SelectTrigger className="h-8 w-[116px] rounded-md border-border bg-card text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZE_OPTIONS.map((option) => (
                          <SelectItem key={option} value={String(option)}>
                            {option} 条/页
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="上一页"
                      className="size-8 rounded-md border-border bg-card hover:bg-muted"
                      disabled={safePage <= 1}
                      onClick={() => setPage((value) => Math.max(1, value - 1))}
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <span className="min-w-8 text-center text-sm font-semibold text-foreground">
                      {safePage}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="下一页"
                      className="size-8 rounded-md border-border bg-card hover:bg-muted"
                      disabled={safePage >= pageCount}
                      onClick={() =>
                        setPage((value) => Math.min(pageCount, value + 1))
                      }
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      共 {pageCount} 页
                    </span>
                  </div>
              </div>
            </div>
          </section>

          {canManageMembers ? (
            <section className="overflow-hidden rounded-lg border border-border bg-background">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">待处理邀请</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    链接只在创建时展示，可在成员加入前随时撤销
                  </p>
                </div>
                <Badge variant="outline" className="rounded-md px-2 py-1 text-xs shadow-none">
                  {hasInvitationsSnapshot ? `${pendingInvitations.length} 条` : '--'}
                </Badge>
              </div>
              {invitationsLoadError && hasInvitationsSnapshot ? (
                <QueryErrorState
                  title="邀请列表刷新失败"
                  description={invitationsLoadError}
                  onRetry={() => invitationsQuery.refetch()}
                  retrying={loadingInvitations}
                  className="m-4"
                />
              ) : null}
              {invitationsUnavailable ? (
                <QueryErrorState
                  title="邀请列表加载失败"
                  description={invitationsLoadError || '暂时无法读取待处理邀请。'}
                  onRetry={() => invitationsQuery.refetch()}
                  retrying={loadingInvitations}
                  className="m-4"
                />
              ) : !hasInvitationsSnapshot && loadingInvitations ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  正在加载待处理邀请…
                </div>
              ) : pendingInvitations.length ? (
                <div className="divide-y divide-border">
                  {pendingInvitations.map((invitation) => {
                    const invitationId = String(invitation.id)
                    const roleLabel =
                      ROLE_OPTIONS.find((role) => role.key === invitation.role)?.label || invitation.role
                    const revoking =
                      revokeInvitationMutation.isPending &&
                      revokeInvitationMutation.variables === invitationId
                    return (
                      <div
                        key={invitationId}
                        className="grid gap-3 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_140px_190px_40px] sm:items-center"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {invitation.email}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            由 {invitation.invited_by} 创建
                          </p>
                        </div>
                        <Badge variant="outline" className="w-fit rounded-md px-2 py-1 text-xs shadow-none">
                          {roleLabel}
                        </Badge>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock3 className="size-3.5" />
                          {fmtDateTime(invitation.expires_at)}
                        </div>
                        <ConfirmDialog
                          title="撤销邀请？"
                          description={`撤销后，${invitation.email} 将无法再通过该链接加入`}
                          confirmLabel="确认撤销"
                          confirmDisabled={revokeInvitationMutation.isPending}
                          onConfirm={() => revokeInvitationMutation.mutate(invitationId)}
                        >
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-8 rounded-md text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={revokeInvitationMutation.isPending}
                            aria-label={`撤销 ${invitation.email} 的邀请`}
                            title="撤销邀请"
                          >
                            {revoking ? (
                              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                            ) : (
                              <Trash2 className="size-4" />
                            )}
                          </Button>
                        </ConfirmDialog>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  当前没有待处理邀请
                </div>
              )}
            </section>
          ) : null}

          <ScimProvisioningPanel />
          <SamlOpsPanel />
        </div>
      </PageScaffold>
    </AppFrame>
  )
}

function MemberRoleSelect({
  value,
  disabled,
  onValueChange,
}: Readonly<{
  value: string
  disabled: boolean
  onValueChange: (value: string) => void
}>) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className="h-8 min-w-0 rounded-md border-border bg-card text-xs">
        <SelectValue placeholder="选择角色" />
      </SelectTrigger>
      <SelectContent>
        {ROLE_OPTIONS.map((role) => (
          <SelectItem key={role.key} value={role.key}>
            <span className="flex items-center gap-2">
              <span
                className={cn('size-2 rounded-sm', roleDotTone(role.key))}
              />
              {role.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function MemberStatusBadge({ isSelf }: Readonly<{ isSelf: boolean }>) {
  return (
    <Badge
      className={cn(
        'rounded-md border px-2 py-0.5 text-xs font-medium',
        isSelf
          ? 'border-primary/20 bg-primary/10 text-primary'
          : 'border-success/20 bg-success/10 text-success'
      )}
    >
      {isSelf ? '当前用户' : '已加入'}
    </Badge>
  )
}

function MemberActionButtons({
  canManageMembers,
  canRemove,
  displayName,
  isSelf,
  removeDescription,
  removing,
  roleChanged,
  saving,
  uid,
  onRemove,
  onSave,
}: Readonly<{
  canManageMembers: boolean
  canRemove: boolean
  displayName: string
  isSelf: boolean
  removeDescription: string
  removing: boolean
  roleChanged: boolean
  saving: boolean
  uid: string
  onRemove: (uid: string) => void
  onSave: (uid: string) => void
}>) {
  return (
    <div className="flex justify-end gap-2">
      <Button
        size="sm"
        variant={roleChanged ? 'default' : 'outline'}
        data-rbac-save-role-action="true"
        aria-label={`保存 ${displayName} 的角色`}
        className="h-8 rounded-md px-3 text-xs font-medium"
        disabled={
          !canManageMembers || !uid || !roleChanged || saving || removing
        }
        onClick={() => onSave(uid)}
      >
        {saving ? '保存中' : roleChanged ? '保存' : '已保存'}
      </Button>
      <ConfirmDialog
        title="移除成员？"
        description={removeDescription}
        confirmLabel="确认移除"
        confirmDisabled={!canRemove || removing}
        onConfirm={() => onRemove(uid)}
      >
        <Button
          variant="outline"
          size="icon"
          className="size-8 rounded-md border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          disabled={!canManageMembers || !uid || removing}
          title={isSelf ? '查看不能移除当前用户的原因' : '移除成员'}
          aria-label={isSelf ? '不能移除当前用户' : `移除成员 ${displayName}`}
        >
          {removing ? (
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
        </Button>
      </ConfirmDialog>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: Readonly<{
  icon: LucideIcon
  label: string
  value: string
  detail: string
  tone: 'blue' | 'green' | 'orange'
}>) {
  const toneClass = {
    blue: 'bg-primary/10 text-primary',
    green: 'bg-success/10 text-success',
    orange: 'bg-warning/10 text-warning',
  }[tone]

  return (
    <div className="flex min-h-[72px] items-center gap-3 bg-card px-4 py-3">
      <div
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-md',
          toneClass
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-xl font-semibold leading-none text-foreground tabular-nums">
          {value}
        </p>
        <p className="mt-1.5 truncate text-xs text-muted-foreground">
          {detail}
        </p>
      </div>
    </div>
  )
}
