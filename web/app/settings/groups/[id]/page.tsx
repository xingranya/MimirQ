/**
 * 设置 - 成员组详情
 *
 * 编辑成员组信息并维护成员归属。
 */
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { ArrowLeft, Loader2, RefreshCw, Save, Search, Trash2, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'

import { TenantPermissionGate } from '@/components/auth/tenant-permission-gate'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageScaffold } from '@/components/ui/page-scaffold'
import { QueryErrorState } from '@/components/ui/query-error-state'
import { cn, formatDate } from '@/lib/utils'
import { formatApiError } from '@/lib/api-errors'
import { TENANT_PERMISSIONS, tenantAccessAllows } from '@/lib/tenant-permissions'
import { groupApi, rbacApi, type TenantMember } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type {
  TenantGroupMemberListResponse,
  TenantGroupMemberOut,
  TenantGroupOut,
} from '@/types/backend'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  useGuardedNavigation,
  useUnsavedChanges,
} from '@/components/providers/navigation-guard-provider'
import { useTenantAccess } from '@/hooks/use-tenant-access'
import { getMemberAccountId, getMemberDisplay, matchesMemberQuery } from '@/lib/member-directory'

const GROUP_MEMBERS_PARAMS = { limit: 500 } as const
const TENANT_MEMBERS_PARAMS = { limit: 1000 } as const

type GroupDraft = {
  groupId: string
  name: string
  externalId: string
}

function asGroupId(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.trim()) return raw
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0]
  return null
}

export default function SettingsGroupDetailPage() {
  return (
    <TenantPermissionGate
      permission={TENANT_PERMISSIONS.SETTINGS_READ}
      pageName="成员组管理"
      withFrame={false}
    >
      <SettingsGroupDetailPageContent />
    </TenantPermissionGate>
  )
}

function SettingsGroupDetailPageContent() {
  const guardedNavigation = useGuardedNavigation()
  const queryClient = useQueryClient()
  const tenantAccessQuery = useTenantAccess()
  const canManageGroups = tenantAccessAllows(
    tenantAccessQuery.data,
    TENANT_PERMISSIONS.SETTINGS_WRITE
  )
  const params = useParams<{ id?: string | string[] }>()
  const groupId = asGroupId(params?.id)

  const groupDetailQueryKey = queryKeys.groups.detail(groupId || '')
  const membersQueryKey = queryKeys.groups.members(groupId || '', GROUP_MEMBERS_PARAMS)

  const [draft, setDraft] = useState<GroupDraft | null>(null)
  const [memberQuery, setMemberQuery] = useState('')

  const [addOpen, setAddOpen] = useState(false)
  const [addQuery, setAddQuery] = useState('')
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])

  const [removingUserId, setRemovingUserId] = useState<string | null>(null)

  const groupQuery = useQuery<TenantGroupOut | null>({
    queryKey: groupDetailQueryKey,
    enabled: Boolean(groupId),
    retry: false,
    queryFn: async () => {
      if (!groupId) return null
      try {
        return await groupApi.getGroup(groupId)
      } catch (err: unknown) {
        toast.error(formatApiError(err, '加载组详情失败'))
        throw err
      }
    },
  })

  const membersQuery = useQuery<TenantGroupMemberListResponse>({
    queryKey: membersQueryKey,
    enabled: Boolean(groupId),
    retry: false,
    queryFn: async () => {
      if (!groupId) return { items: [], total: 0 }
      return groupApi.listGroupMembers(groupId, GROUP_MEMBERS_PARAMS)
    },
  })

  const tenantMembersQuery = useQuery({
    queryKey: queryKeys.rbac.members(TENANT_MEMBERS_PARAMS),
    enabled: addOpen && canManageGroups,
    retry: false,
    queryFn: () => rbacApi.listTenantMembers(TENANT_MEMBERS_PARAMS),
  })

  const group = groupQuery.data
  const activeDraft = draft?.groupId === groupId ? draft : null
  const nameDraft = activeDraft?.name ?? String(group?.name || '')
  const externalIdDraft = activeDraft?.externalId ?? String(group?.external_id || '')
  const members = useMemo<TenantGroupMemberOut[]>(() => {
    const items = membersQuery.data?.items
    return Array.isArray(items) ? items : []
  }, [membersQuery.data?.items])
  const tenantMembers = useMemo<TenantMember[]>(() => {
    const items = tenantMembersQuery.data?.items
    return Array.isArray(items) ? items : []
  }, [tenantMembersQuery.data?.items])
  const currentMemberIds = useMemo(
    () => new Set(members.map((member) => getMemberAccountId(member)).filter(Boolean)),
    [members]
  )
  const availableMembers = useMemo(
    () =>
      tenantMembers.filter((member) => {
        const accountId = getMemberAccountId(member)
        return Boolean(accountId) && member.is_active !== false && !currentMemberIds.has(accountId)
      }),
    [currentMemberIds, tenantMembers]
  )
  const filteredAvailableMembers = useMemo(
    () => availableMembers.filter((member) => matchesMemberQuery(member, addQuery)),
    [addQuery, availableMembers]
  )
  const membersTotal = Number(membersQuery.data?.total ?? members.length)
  const loadingGroup = groupQuery.isFetching
  const loadingMembers = membersQuery.isFetching
  const hasMembersSnapshot = membersQuery.data !== undefined
  const membersLoadError = membersQuery.error
    ? formatApiError(membersQuery.error, '成员列表加载失败')
    : null
  const membersUnavailable = Boolean(membersLoadError) && !hasMembersSnapshot
  const groupLoadError = groupQuery.isError
    ? formatApiError(groupQuery.error, '成员组详情加载失败')
    : null
  const canEditGroup = canManageGroups && Boolean(group) && !groupQuery.isError

  const updateDraft = (patch: Partial<Omit<GroupDraft, 'groupId'>>) => {
    setDraft({
      groupId: groupId || '',
      name: patch.name ?? nameDraft,
      externalId: patch.externalId ?? externalIdDraft,
    })
  }

  const groupHasChanges = useMemo(() => {
    const name = String(nameDraft || '').trim()
    const externalId = String(externalIdDraft || '').trim()
    const savedName = String(group?.name || '').trim()
    const savedExternalId = String(group?.external_id || '').trim()
    return name !== savedName || externalId !== savedExternalId
  }, [nameDraft, externalIdDraft, group?.external_id, group?.name])

  const canSaveGroup = useMemo(() => {
    if (!group || groupQuery.isError) return false
    const name = String(nameDraft || '').trim()
    if (!name) return false
    if (name.length > 255) return false
    if (String(externalIdDraft || '').trim().length > 255) return false
    return groupHasChanges
  }, [nameDraft, externalIdDraft, group, groupHasChanges, groupQuery.isError])

  const filteredMembers = useMemo(() => {
    const q = String(memberQuery || '')
      .trim()
      .toLowerCase()
    if (!q) return members
    return (members || []).filter((member) => matchesMemberQuery(member, q))
  }, [members, memberQuery])

  const saveGroupMutation = useMutation({
    mutationFn: async ({ name, externalId }: { name: string; externalId: string }) => {
      if (!groupId) throw new Error('缺少成员组标识')
      return groupApi.patchGroup(groupId, {
        name,
        external_id: externalId || null,
      })
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.groups.detail(updated.id), updated)
      setDraft({
        groupId: updated.id,
        name: String(updated.name || ''),
        externalId: String(updated.external_id || ''),
      })
      toast.success('已保存组信息')
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.all })
    },
    onError: (err: unknown) => {
      toast.error(formatApiError(err, '保存失败'))
    },
  })

  const addMembersMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!groupId) throw new Error('缺少成员组标识')
      return groupApi.addGroupMembers(groupId, { member_ids: ids })
    },
    onSuccess: (res) => {
      toast.success(`已添加 ${res.updated} 个成员`)
      setAddQuery('')
      setSelectedMemberIds([])
      setAddOpen(false)
      queryClient.invalidateQueries({ queryKey: membersQueryKey })
    },
    onError: (err: unknown) => {
      toast.error(formatApiError(err, '添加成员失败'))
    },
  })

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!groupId) throw new Error('缺少成员组标识')
      return groupApi.removeGroupMembers(groupId, { member_ids: [userId] })
    },
    onMutate: (userId) => {
      setRemovingUserId(userId)
    },
    onSuccess: (res, userId) => {
      toast.success(`已移除 ${res.updated} 个成员`)
      queryClient.setQueryData<TenantGroupMemberListResponse>(membersQueryKey, (prev) => {
        const previousItems = Array.isArray(prev?.items) ? prev.items : []
        const nextItems = previousItems.filter((member) => getMemberAccountId(member) !== userId)
        return {
          items: nextItems,
          total: Math.max(0, Number(prev?.total ?? previousItems.length) - 1),
        }
      })
      queryClient.invalidateQueries({ queryKey: membersQueryKey })
    },
    onError: (err: unknown) => {
      toast.error(formatApiError(err, '移除成员失败'))
    },
    onSettled: () => {
      setRemovingUserId(null)
    },
  })

  const saveGroup = () => {
    if (!groupId) return
    if (!group || groupQuery.isError) {
      toast.error('成员组详情尚未加载，无法保存。请重新加载后再试。')
      return
    }
    const name = String(nameDraft || '').trim()
    const externalId = String(externalIdDraft || '').trim()
    if (!name) {
      toast.error('请填写成员组名称。')
      return
    }
    if (name.length > 255) {
      toast.error('成员组名称最多 255 个字符。')
      return
    }
    if (externalId.length > 255) {
      toast.error('外部目录标识最多 255 个字符。')
      return
    }

    saveGroupMutation.mutate({ name, externalId })
  }

  const addMembers = () => {
    if (!groupId) return
    if (!selectedMemberIds.length) {
      toast.message('请至少选择一名成员。')
      return
    }

    addMembersMutation.mutate(selectedMemberIds)
  }

  const toggleSelectedMember = (accountId: string, checked: boolean) => {
    setSelectedMemberIds((current) => {
      if (checked) return current.includes(accountId) ? current : [...current, accountId]
      return current.filter((id) => id !== accountId)
    })
  }

  const removeMember = (userId: string) => {
    if (!groupId) return
    const uid = String(userId || '').trim()
    if (!uid) return

    removeMemberMutation.mutate(uid)
  }

  const title = group?.name || '成员组详情'
  const savingGroup = saveGroupMutation.isPending
  const adding = addMembersMutation.isPending
  useUnsavedChanges(groupHasChanges)

  return (
    <>
      <PageScaffold
        title={title}
        description="编辑成员组信息，并维护成员归属。"
        icon={Users}
        iconColor="text-primary"
        size="full"
        compact
        actions={
          <Button
            size="sm"
            className="h-9 gap-2 rounded-md px-3"
            disabled={!canManageGroups || !canSaveGroup || savingGroup}
            onClick={saveGroup}
          >
            {savingGroup ? (
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Save className="size-4" />
            )}
            {savingGroup ? '保存中…' : groupHasChanges ? '保存修改' : '已保存'}
          </Button>
        }
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-2 rounded-md px-2 text-muted-foreground"
            onClick={() => guardedNavigation.push('/settings/groups')}
          >
            <ArrowLeft className="size-4" />
            返回成员组
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-9 rounded-md border-border"
            disabled={loadingGroup || loadingMembers}
            onClick={() => {
              groupQuery.refetch()
              membersQuery.refetch()
            }}
            aria-label="刷新成员组详情"
            title="刷新"
          >
            <RefreshCw
              className={cn(
                'size-4',
                (loadingGroup || loadingMembers) && 'animate-spin motion-reduce:animate-none'
              )}
            />
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
          <section className="h-fit overflow-hidden rounded-md border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Users className="size-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">基本信息</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  名称用于成员识别，外部目录标识用于企业身份同步。
                </p>
              </div>
            </div>
            <div className="space-y-4 p-4">
              {groupLoadError ? (
                <QueryErrorState
                  title="成员组详情加载失败"
                  description={groupLoadError}
                  onRetry={() => groupQuery.refetch()}
                  retrying={loadingGroup}
                />
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="group-name">名称</Label>
                <Input
                  id="group-name"
                  value={nameDraft}
                  maxLength={255}
                  onChange={(e) => updateDraft({ name: e.target.value })}
                  placeholder="例如：研发 / 法务 / 财务"
                  disabled={!canEditGroup || loadingGroup}
                />
                <div className="text-xs text-muted-foreground">
                  必填，最多 255 个字符；同一组织内不能重名。
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="group-external-id">外部目录标识</Label>
                <Input
                  id="group-external-id"
                  value={externalIdDraft}
                  maxLength={255}
                  onChange={(e) => updateDraft({ externalId: e.target.value })}
                  placeholder="例如：Okta 或 Azure AD 中的组标识"
                  disabled={!canEditGroup || loadingGroup}
                />
                <div className="text-xs text-muted-foreground">
                  用于连接企业身份目录，留空表示不绑定。
                </div>
              </div>

              <dl className="grid gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
                <div>
                  <dt>成员组标识</dt>
                  <dd className="mt-1 break-all font-mono text-foreground">{group?.id || '-'}</dd>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <div>
                    <dt>创建时间</dt>
                    <dd className="mt-1 text-foreground">
                      {group?.created_at ? formatDate(group.created_at) : '-'}
                    </dd>
                  </div>
                  <div>
                    <dt>最近更新</dt>
                    <dd className="mt-1 text-foreground">
                      {group?.updated_at ? formatDate(group.updated_at) : '-'}
                    </dd>
                  </div>
                </div>
              </dl>
            </div>
          </section>

          <section className="overflow-hidden rounded-md border border-border bg-card">
            <div className="space-y-3 border-b border-border px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <Users className="size-4 text-primary" />
                  <span className="text-base font-semibold text-foreground">成员</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {hasMembersSnapshot ? `${membersTotal} 人` : '--'}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                <div className="space-y-2">
                  <Label htmlFor="group-member-search">搜索成员</Label>
                  <Input
                    id="group-member-search"
                    value={memberQuery}
                    onChange={(e) => setMemberQuery(e.target.value)}
                    placeholder="搜索用户名、邮箱或账号 ID"
                    className="h-9 rounded-md"
                    disabled={membersUnavailable || (!hasMembersSnapshot && loadingMembers)}
                  />
                </div>
                <div className="flex items-end">
                  <Dialog
                    open={addOpen}
                    onOpenChange={(open) => {
                      if (!open && adding) return
                      setAddOpen(open)
                      if (open) {
                        setAddQuery('')
                        setSelectedMemberIds([])
                      }
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        className="h-9 gap-2 rounded-md"
                        disabled={
                          !canManageGroups || !group || !hasMembersSnapshot || membersUnavailable
                        }
                      >
                        <UserPlus className="size-4" />
                        添加成员
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>添加成员</DialogTitle>
                        <DialogDescription className="text-sm">
                          从当前组织的成员中搜索并选择，已在该组的成员不会重复显示。
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label htmlFor="group-member-picker-search">搜索组织成员</Label>
                          <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              id="group-member-picker-search"
                              value={addQuery}
                              onChange={(event) => setAddQuery(event.target.value)}
                              placeholder="输入用户名或邮箱"
                              className="h-10 rounded-md pl-9"
                              autoComplete="off"
                            />
                          </div>
                        </div>

                        <div className="max-h-72 overflow-y-auto rounded-md border border-border">
                          {tenantMembersQuery.isError ? (
                            <QueryErrorState
                              title="组织成员加载失败"
                              description={formatApiError(
                                tenantMembersQuery.error,
                                '暂时无法读取组织成员。'
                              )}
                              onRetry={() => tenantMembersQuery.refetch()}
                              retrying={tenantMembersQuery.isFetching}
                              className="m-3"
                            />
                          ) : tenantMembersQuery.isFetching &&
                            tenantMembersQuery.data === undefined ? (
                            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                              正在加载组织成员…
                            </div>
                          ) : filteredAvailableMembers.length ? (
                            <div className="divide-y divide-border">
                              {filteredAvailableMembers.map((member) => {
                                const display = getMemberDisplay(member)
                                const checked = selectedMemberIds.includes(display.accountId)
                                return (
                                  <label
                                    key={display.accountId}
                                    className="flex cursor-pointer items-start gap-3 px-3 py-3 hover:bg-muted/40"
                                  >
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={(value) =>
                                        toggleSelectedMember(display.accountId, value === true)
                                      }
                                      aria-label={`选择成员 ${display.primary}`}
                                      className="mt-0.5"
                                    />
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-sm font-medium text-foreground">
                                        {display.primary}
                                      </span>
                                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                        {display.secondary}
                                      </span>
                                    </span>
                                  </label>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="px-4 py-8 text-center">
                              <p className="text-sm font-medium text-foreground">
                                {availableMembers.length
                                  ? '没有找到匹配的成员'
                                  : '没有可添加的成员'}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {availableMembers.length
                                  ? '请换一个用户名或邮箱再试。'
                                  : '当前组织成员都已加入该成员组。'}
                              </p>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          已选择 {selectedMemberIds.length} 人
                        </p>
                      </div>

                      <DialogFooter className="mt-4">
                        <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={adding}>
                          取消
                        </Button>
                        <Button onClick={addMembers} disabled={adding || !selectedMemberIds.length}>
                          {adding ? (
                            <Loader2 className="mr-2 size-4 animate-spin motion-reduce:animate-none" />
                          ) : null}
                          添加
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </div>

            <div className="p-4">
              {membersLoadError && hasMembersSnapshot ? (
                <QueryErrorState
                  title="成员列表刷新失败"
                  description={membersLoadError}
                  onRetry={() => membersQuery.refetch()}
                  retrying={loadingMembers}
                  className="mb-3"
                />
              ) : null}

              <div className="space-y-2 lg:hidden">
                {membersUnavailable ? (
                  <QueryErrorState
                    title="成员列表加载失败"
                    description={membersLoadError || '暂时无法读取成员列表。'}
                    onRetry={() => membersQuery.refetch()}
                    retrying={loadingMembers}
                  />
                ) : filteredMembers.length ? (
                  filteredMembers.map((member) => {
                    const userId = getMemberAccountId(member)
                    const display = getMemberDisplay(member)
                    const removing = removingUserId === userId
                    return (
                      <article key={userId} className="rounded-md border border-border bg-card p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {display.primary}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {member.email || '未提供邮箱'}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              账号 ID：{userId}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {member.created_at
                                ? `${formatDate(member.created_at)} 加入`
                                : '加入时间未知'}
                            </p>
                          </div>
                          <GroupMemberRemoveAction
                            userId={userId}
                            displayName={display.primary}
                            removing={removing}
                            disabled={!canManageGroups}
                            onRemove={removeMember}
                          />
                        </div>
                      </article>
                    )
                  })
                ) : !hasMembersSnapshot && loadingMembers ? (
                  <div className="rounded-md border border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    正在加载成员…
                  </div>
                ) : (
                  <div className="rounded-md border border-border px-4 py-8 text-center">
                    <p className="text-sm font-semibold text-foreground">
                      {members.length ? '没有找到匹配的成员' : '该成员组还没有成员'}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {members.length
                        ? '请调整搜索内容后再试。'
                        : '可以使用上方的添加成员按钮，把组织成员加入当前成员组。'}
                    </p>
                  </div>
                )}
              </div>

              <div className="hidden overflow-hidden rounded-md border border-border lg:block">
                <div className="grid grid-cols-12 bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <div className="col-span-5">成员</div>
                  <div className="col-span-4">邮箱</div>
                  <div className="col-span-2">加入时间</div>
                  <div className="col-span-1 text-right">操作</div>
                </div>

                {membersUnavailable ? (
                  <QueryErrorState
                    title="成员列表加载失败"
                    description={membersLoadError || '暂时无法读取成员列表。'}
                    onRetry={() => membersQuery.refetch()}
                    retrying={loadingMembers}
                    className="m-3"
                  />
                ) : filteredMembers.length ? (
                  filteredMembers.map((m) => {
                    const uid = getMemberAccountId(m)
                    const display = getMemberDisplay(m)
                    const removing = removingUserId === uid
                    return (
                      <div
                        key={uid}
                        className="grid grid-cols-12 items-center gap-2 border-t border-border px-3 py-2 text-sm"
                      >
                        <div className="col-span-5 min-w-0">
                          <div className="truncate font-medium text-foreground">
                            {display.primary}
                          </div>
                          <div className="truncate text-xs text-muted-foreground" title={uid}>
                            账号 ID：{uid}
                          </div>
                        </div>
                        <div className="col-span-4 truncate text-xs text-muted-foreground">
                          {m.email || '未提供邮箱'}
                        </div>
                        <div className="col-span-2 truncate text-xs text-muted-foreground">
                          {m.created_at ? formatDate(m.created_at) : '-'}
                        </div>
                        <div className="col-span-1 flex justify-end">
                          <GroupMemberRemoveAction
                            userId={uid}
                            displayName={display.primary}
                            removing={removing}
                            disabled={!canManageGroups}
                            onRemove={removeMember}
                          />
                        </div>
                      </div>
                    )
                  })
                ) : !hasMembersSnapshot && loadingMembers ? (
                  <div className="px-3 py-8 text-sm text-muted-foreground">正在加载成员…</div>
                ) : (
                  <div className="px-4 py-10 text-center">
                    <p className="text-sm font-semibold text-foreground">
                      {members.length ? '没有找到匹配的成员' : '该成员组还没有成员'}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {members.length
                        ? '请调整搜索内容后再试。'
                        : '可以使用上方的添加成员按钮，把组织成员加入当前成员组。'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </PageScaffold>
    </>
  )
}

function GroupMemberRemoveAction({
  userId,
  displayName,
  removing,
  disabled,
  onRemove,
}: Readonly<{
  userId: string
  displayName: string
  removing: boolean
  disabled: boolean
  onRemove: (userId: string) => void
}>) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-md text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={disabled || !userId || removing}
          aria-label={removing ? `正在移除成员 ${displayName}` : `移除成员 ${displayName}`}
          title="移除成员"
        >
          {removing ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Trash2 className="size-4" />
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>移除成员？</AlertDialogTitle>
          <AlertDialogDescription>
            将把 <span className="font-medium text-foreground">{displayName}</span>{' '}
            从当前成员组移除。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={() => onRemove(userId)} disabled={removing}>
            {removing ? '移除中…' : '确认移除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
