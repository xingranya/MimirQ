/**
 * 设置 - 成员组详情
 *
 * 编辑成员组信息并维护成员归属。
 */
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { ArrowLeft, Loader2, RefreshCw, Save, Trash2, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'

import { TenantPermissionGate } from '@/components/auth/tenant-permission-gate'
import { AppFrame } from '@/components/app-frame'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageScaffold } from '@/components/ui/page-scaffold'
import { QueryErrorState } from '@/components/ui/query-error-state'
import { Textarea } from '@/components/ui/textarea'
import { cn, formatDate } from '@/lib/utils'
import { formatApiError } from '@/lib/api-errors'
import { TENANT_PERMISSIONS, tenantAccessAllows } from '@/lib/tenant-permissions'
import { groupApi } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { useRouter } from '@/i18n/navigation'
import type { TenantGroupMemberListResponse, TenantGroupMemberOut, TenantGroupOut } from '@/types/backend'
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
import { UnsavedChangesDialog } from '@/components/ui/unsaved-changes-dialog'
import { useUnsavedNavigationGuard } from '@/hooks/use-unsaved-navigation-guard'
import { useTenantAccess } from '@/hooks/use-tenant-access'

const GROUP_MEMBERS_PARAMS = { limit: 500 } as const

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

function normalizeMemberIds(raw: string): { ids: string[]; error?: string } {
  const parts = (raw || '')
    .split(/[\n,;]+/g)
    .map((s) => s.trim())
    .filter(Boolean)

  const out: string[] = []
  const seen = new Set<string>()
  for (const p of parts) {
    if (seen.has(p)) continue
    seen.add(p)
    if (p.length > 255) {
      return { ids: [], error: '成员标识过长，最多 255 个字符。' }
    }
    out.push(p)
    if (out.length >= 200) break
  }
  return { ids: out }
}

export default function SettingsGroupDetailPage() {
  return (
    <TenantPermissionGate permission={TENANT_PERMISSIONS.SETTINGS_READ} pageName="成员组管理">
      <SettingsGroupDetailPageContent />
    </TenantPermissionGate>
  )
}

function SettingsGroupDetailPageContent() {
  const router = useRouter()
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
  const [addText, setAddText] = useState('')

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

  const group = groupQuery.data
  const activeDraft = draft?.groupId === groupId ? draft : null
  const nameDraft = activeDraft?.name ?? String(group?.name || '')
  const externalIdDraft = activeDraft?.externalId ?? String(group?.external_id || '')
  const members = useMemo<TenantGroupMemberOut[]>(() => {
    const items = membersQuery.data?.items
    return Array.isArray(items) ? items : []
  }, [membersQuery.data?.items])
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
    const q = String(memberQuery || '').trim().toLowerCase()
    if (!q) return members
    return (members || []).filter((m) => String(m.user_id || '').toLowerCase().includes(q))
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
      setAddText('')
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
        const nextItems = previousItems.filter((m) => String(m.user_id || '') !== userId)
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
    const { ids, error } = normalizeMemberIds(addText)
    if (error) {
      toast.error(error)
      return
    }
    if (!ids.length) {
      toast.message('请至少填写一个成员标识。')
      return
    }

    addMembersMutation.mutate(ids)
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
  const navigate = useCallback((href: string) => router.push(href), [router])
  const navigationGuard = useUnsavedNavigationGuard({
    enabled: groupHasChanges,
    onNavigate: navigate,
  })

  return (
    <AppFrame>
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
            onClick={() => navigationGuard.requestNavigation('/settings/groups')}
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
                (loadingGroup || loadingMembers) &&
                  'animate-spin motion-reduce:animate-none'
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
                  <dd className="mt-1 break-all font-mono text-foreground">
                    {group?.id || '-'}
                  </dd>
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
                    placeholder="搜索成员标识"
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
                      if (open) setAddText('')
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        className="h-9 gap-2 rounded-md"
                        disabled={!canManageGroups || !group || !hasMembersSnapshot || membersUnavailable}
                      >
                        <UserPlus className="size-4" />
                        添加成员
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>添加成员</DialogTitle>
                        <DialogDescription className="text-sm">
                          输入当前组织已有成员的标识。每行填写一个，也可以用逗号或分号分隔。
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-2">
                        <Label htmlFor="group-members">成员列表</Label>
                        <Textarea
                          id="group-members"
                          value={addText}
                          onChange={(e) => setAddText(e.target.value)}
                          placeholder="alice\nbob\ncharlie"
                          className="font-mono text-sm"
                        />
                        <div className="text-xs text-muted-foreground">
                          一次最多添加 200 人；重复内容会自动去除。
                        </div>
                      </div>

                      <DialogFooter className="mt-4">
                        <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={adding}>
                          取消
                        </Button>
                        <Button onClick={addMembers} disabled={adding}>
                          {adding ? <Loader2 className="mr-2 size-4 animate-spin motion-reduce:animate-none" /> : null}
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
                    const userId = String(member.user_id || '').trim()
                    const removing = removingUserId === userId
                    return (
                      <article
                        key={userId}
                        className="rounded-md border border-border bg-card p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-mono text-sm text-foreground">
                              {userId}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {member.created_at
                                ? `${formatDate(member.created_at)} 加入`
                                : '加入时间未知'}
                            </p>
                          </div>
                          <GroupMemberRemoveAction
                            userId={userId}
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
                  <div className="col-span-7">成员标识</div>
                  <div className="col-span-4">加入时间</div>
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
                    const uid = String(m.user_id || '').trim()
                    const removing = removingUserId === uid
                    return (
                      <div
                        key={uid}
                        className="grid grid-cols-12 items-center gap-2 border-t border-border px-3 py-2 text-sm"
                      >
                        <div className="col-span-7 truncate font-mono text-xs">
                          {uid}
                        </div>
                        <div className="col-span-4 truncate text-xs text-muted-foreground">
                          {m.created_at ? formatDate(m.created_at) : '-'}
                        </div>
                        <div className="col-span-1 flex justify-end">
                          <GroupMemberRemoveAction
                            userId={uid}
                            removing={removing}
                            disabled={!canManageGroups}
                            onRemove={removeMember}
                          />
                        </div>
                      </div>
                    )
                  })
                ) : !hasMembersSnapshot && loadingMembers ? (
                  <div className="px-3 py-8 text-sm text-muted-foreground">
                    正在加载成员…
                  </div>
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
        <UnsavedChangesDialog
          open={navigationGuard.navigationPending}
          onOpenChange={(open) => {
            if (!open) navigationGuard.cancelNavigation()
          }}
          onDiscard={navigationGuard.confirmNavigation}
          title="放弃成员组修改？"
          description="成员组名称或外部目录标识尚未保存。继续后，这些修改将丢失。"
        />
      </PageScaffold>
    </AppFrame>
  )
}

function GroupMemberRemoveAction({
  userId,
  removing,
  disabled,
  onRemove,
}: Readonly<{
  userId: string
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
          aria-label={removing ? `正在移除成员 ${userId}` : `移除成员 ${userId}`}
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
            将把 <span className="font-mono">{userId}</span> 从当前成员组移除。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onRemove(userId)}
            disabled={removing}
          >
            {removing ? '移除中…' : '确认移除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
