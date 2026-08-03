/**
 * 设置 - 成员组
 *
 * 管理组织成员组及其外部目录映射。
 */
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import { TenantPermissionGate } from '@/components/auth/tenant-permission-gate'
import { AppFrame } from '@/components/app-frame'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageScaffold } from '@/components/ui/page-scaffold'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { formatApiError } from '@/lib/api-errors'
import { TENANT_PERMISSIONS, tenantAccessAllows } from '@/lib/tenant-permissions'
import { groupApi } from '@/lib/api'
import { useRouter } from '@/i18n/navigation'
import type { TenantGroupOut } from '@/types/backend'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { queryKeys } from '@/lib/query-keys'
import { useTenantAccess } from '@/hooks/use-tenant-access'

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number]
const GROUP_PAGE_LIST_PARAMS = { limit: 500 } as const
const PRIMARY_BUTTON =
  'h-9 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90'
const INPUT_CLASS =
  'h-9 rounded-md border-border bg-background text-sm placeholder:text-muted-foreground'
const CARD_CLASS =
  'rounded-md border border-border bg-card'
const ICON_BUTTON =
  'size-8 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive'

function isPageSizeOption(value: number): value is PageSizeOption {
  return PAGE_SIZE_OPTIONS.includes(value as PageSizeOption)
}

export default function SettingsGroupsPage() {
  return (
    <TenantPermissionGate
      permission={TENANT_PERMISSIONS.SETTINGS_READ}
      pageName="成员组管理"
    >
      <SettingsGroupsPageContent />
    </TenantPermissionGate>
  )
}

function SettingsGroupsPageContent() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const tenantAccessQuery = useTenantAccess()
  const canManageGroups = tenantAccessAllows(
    tenantAccessQuery.data,
    TENANT_PERMISSIONS.SETTINGS_WRITE
  )
  const [query, setQuery] = useState('')
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10)
  const [page, setPage] = useState(1)

  const [createOpen, setCreateOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [externalIdDraft, setExternalIdDraft] = useState('')

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const groupsQuery = useQuery<TenantGroupOut[]>({
    queryKey: queryKeys.groups.list(GROUP_PAGE_LIST_PARAMS),
    retry: false,
    queryFn: async () => {
      try {
        const res = await groupApi.listGroups(GROUP_PAGE_LIST_PARAMS)
        return Array.isArray(res.items) ? res.items : []
      } catch (err: unknown) {
        toast.error(formatApiError(err, '加载成员组失败'))
        throw err
      }
    },
  })
  const groups = useMemo(() => groupsQuery.data || [], [groupsQuery.data])
  const loading = groupsQuery.isFetching
  const createMutation = useMutation({
    mutationFn: async () => {
      const name = String(nameDraft || '').trim()
      const externalId = String(externalIdDraft || '').trim()
      return groupApi.createGroup({
        name,
        external_id: externalId || undefined,
      })
    },
    onSuccess: (created) => {
      toast.success(`已创建成员组：${created.name}`)
      setCreateOpen(false)
      setNameDraft('')
      setExternalIdDraft('')
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.all })
    },
    onError: (err: unknown) => {
      toast.error(formatApiError(err, '创建成员组失败'))
    },
  })
  const deleteMutation = useMutation({
    mutationFn: async (groupId: string) => {
      await groupApi.deleteGroup(groupId)
      return groupId
    },
    onMutate: (groupId) => {
      setDeletingId(groupId)
    },
    onSuccess: (groupId) => {
      toast.success('成员组已删除')
      queryClient.setQueryData<TenantGroupOut[]>(
        queryKeys.groups.list(GROUP_PAGE_LIST_PARAMS),
        (prev) => (prev || []).filter((g) => g.id !== groupId)
      )
      queryClient.invalidateQueries({ queryKey: queryKeys.groups.all })
    },
    onError: (err: unknown) => {
      toast.error(formatApiError(err, '删除成员组失败'))
    },
    onSettled: () => {
      setDeletingId(null)
    },
  })
  const creating = createMutation.isPending

  const filtered = useMemo(() => {
    const q = String(query || '')
      .trim()
      .toLowerCase()
    if (!q) return groups
    return (groups || []).filter((g) => {
      const name = String(g.name || '').toLowerCase()
      const externalId = String(g.external_id || '').toLowerCase()
      const id = String(g.id || '').toLowerCase()
      return name.includes(q) || externalId.includes(q) || id.includes(q)
    })
  }, [groups, query])

  const canCreate = useMemo(
    () => String(nameDraft || '').trim().length > 0,
    [nameDraft]
  )
  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(filtered.length / pageSize)),
    [filtered.length, pageSize]
  )
  const visibleGroups = useMemo(() => {
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page, pageSize])
  const hasVisibleGroups = visibleGroups.length > 0
  useEffect(() => {
    setPage(1)
  }, [query, pageSize])

  useEffect(() => {
    setPage((current) => Math.min(Math.max(1, current), pageCount))
  }, [pageCount])

  return (
    <AppFrame>
      <PageScaffold
        title="成员组"
        description="按团队维护成员归属，并控制知识内容的访问范围。"
        iconImage="group-management"
        icon={Users}
        iconColor="text-primary"
        size="full"
        compact
        bodyClassName="pt-2"
        bodyContainerClassName="flex min-h-full flex-col"
        actions={
          <Dialog
              open={createOpen}
              onOpenChange={(open) => {
                if (!open && creating) return
                setCreateOpen(open)
                if (open) {
                  setNameDraft('')
                  setExternalIdDraft('')
                }
              }}
            >
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  data-settings-groups-create-action="true"
                  className={PRIMARY_BUTTON}
                  disabled={!canManageGroups}
                  title={canManageGroups ? '新建成员组' : '当前账号没有成员组管理权限'}
                >
                  <Plus className="size-4" />
                  新建成员组
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>新建成员组</DialogTitle>
                  <DialogDescription className="text-sm">
                    填写团队名称。连接企业身份目录时，可同时填写外部目录标识。
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="group-name">名称</Label>
                    <Input
                      className={INPUT_CLASS}
                      id="group-name"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      placeholder="例如：研发 / 法务 / 财务"
                      autoComplete="off"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="group-external-id">
                      外部目录标识
                    </Label>
                    <Input
                      className={INPUT_CLASS}
                      id="group-external-id"
                      value={externalIdDraft}
                      onChange={(e) => setExternalIdDraft(e.target.value)}
                      placeholder="例如：Okta 或 Azure AD 中的组标识"
                      autoComplete="off"
                    />
                    <div className="text-xs leading-relaxed text-muted-foreground">
                      仅用于企业身份同步，留空不影响成员组权限。
                    </div>
                  </div>
                </div>

                <DialogFooter className="mt-4">
                  <Button
                    variant="ghost"
                    className="h-8 rounded-md px-3 text-xs font-medium"
                    onClick={() => setCreateOpen(false)}
                    disabled={creating}
                  >
                    取消
                  </Button>
                  <Button
                    className="h-8 rounded-md px-3 text-xs font-medium"
                    onClick={() => {
                      if (!canCreate) return
                      createMutation.mutate()
                    }}
                    disabled={!canCreate || creating}
                  >
                    {creating ? '创建中…' : '创建成员组'}
                  </Button>
                </DialogFooter>
              </DialogContent>
          </Dialog>
        }
      >
        <div
          className={cn(
            CARD_CLASS,
            'flex min-h-[calc(100dvh-14rem)] flex-1 flex-col overflow-hidden'
          )}
        >
          <div className="flex flex-col gap-3 border-b border-border px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Users className="size-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    成员组列表
                  </h2>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    共 {groups.length} 个成员组，当前显示 {filtered.length} 个。
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9 rounded-md border-border bg-card"
                  disabled={loading}
                  onClick={() => groupsQuery.refetch()}
                  aria-label="刷新成员组"
                  title="刷新成员组"
                >
                  <RefreshCw
                    className={cn(
                      'size-4',
                      loading && 'animate-spin motion-reduce:animate-none'
                    )}
                  />
                </Button>
                <Select
                  value={String(pageSize)}
                  onValueChange={(value) => {
                    const next = Number(value)
                    if (isPageSizeOption(next)) setPageSize(next)
                  }}
                >
                  <SelectTrigger className="h-9 w-[122px] rounded-md border-border bg-card text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        每页 {size} 条
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Input
              className={cn(INPUT_CLASS, 'w-full max-w-[560px]')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索成员组名称、外部目录标识或组标识"
            />
          </div>

          <div className="flex min-h-[360px] flex-1 flex-col overflow-hidden">
            <div className="hidden grid-cols-12 bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground lg:grid">
              <div className="col-span-5 flex items-center gap-2">
                <span>名称</span>
              </div>
              <div className="col-span-3 flex items-center gap-2">
                <span>外部目录标识</span>
              </div>
              <div className="col-span-3">成员组标识</div>
              <div className="col-span-1 text-right">操作</div>
            </div>

            <div className="space-y-2 overflow-y-auto p-3 lg:hidden">
              {hasVisibleGroups
                ? visibleGroups.map((group) => {
                    const groupId = String(group.id || '').trim()
                    const deleting = deletingId === groupId
                    return (
                      <article
                        key={groupId}
                        className="rounded-md border border-border bg-card p-3"
                      >
                        <button
                          type="button"
                          className="block w-full text-left"
                          onClick={() =>
                            router.push(
                              `/settings/groups/${encodeURIComponent(groupId)}`
                            )
                          }
                        >
                          <p className="truncate text-sm font-semibold text-foreground">
                            {group.name}
                          </p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {group.external_id || '未连接外部目录'}
                          </p>
                        </button>
                        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
                          <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                            {groupId}
                          </span>
                          <GroupDeleteAction
                            group={group}
                            deleting={deleting}
                            disabled={!canManageGroups}
                            onDelete={(id) => deleteMutation.mutate(id)}
                          />
                        </div>
                      </article>
                    )
                  })
                : null}
            </div>

            <div className="hidden min-h-0 flex-1 flex-col overflow-y-auto lg:flex">
              {hasVisibleGroups ? (
                visibleGroups.map((g) => {
                  const gid = String(g.id || '').trim()
                  const deleting = Boolean(deletingId && deletingId === gid)
                  const initial = String(g.name || gid || '?')
                    .trim()
                    .slice(0, 1)
                    .toUpperCase()
                  return (
                    <div
                      key={gid}
                      className="grid grid-cols-12 items-center gap-3 border-t border-border px-4 py-2.5 text-sm transition-colors hover:bg-muted/40 motion-reduce:transition-none"
                    >
                      <button
                        type="button"
                        className="col-span-5 flex min-w-0 items-center gap-2.5 text-left"
                        onClick={() =>
                          router.push(
                            `/settings/groups/${encodeURIComponent(gid)}`
                          )
                        }
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                          {initial}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-foreground">
                            {g.name}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            查看成员和访问范围
                          </div>
                        </div>
                      </button>
                      <div
                        className="col-span-3 min-w-0 truncate text-xs text-muted-foreground"
                        title={g.external_id || '-'}
                      >
                        {g.external_id || '-'}
                      </div>
                      <div
                        className="col-span-3 min-w-0 truncate font-mono text-xs text-muted-foreground"
                        title={gid}
                      >
                        {gid}
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <GroupDeleteAction
                          group={g}
                          deleting={deleting}
                          disabled={!canManageGroups}
                          onDelete={(id) => deleteMutation.mutate(id)}
                        />
                      </div>
                    </div>
                  )
                })
              ) : null}
              {!hasVisibleGroups && loading ? (
                <div className="flex min-h-[280px] flex-1 items-center justify-center text-sm text-muted-foreground">
                  加载中…
                </div>
              ) : null}
              {!hasVisibleGroups && !loading ? (
                <div className="flex min-h-[280px] flex-1 flex-col items-center justify-center border-t border-border px-6 text-center">
                  <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Users className="size-5" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground">
                    暂无成员组
                  </h3>
                  <p className="mt-1.5 max-w-md text-sm leading-6 text-muted-foreground">
                    还没有成员组。创建后即可按团队分配成员和访问范围。
                  </p>
                  <Button
                    data-settings-groups-create-action="true"
                    className={cn(PRIMARY_BUTTON, 'mt-5')}
                    onClick={() => setCreateOpen(true)}
                    disabled={!canManageGroups}
                  >
                    <Plus className="size-4" />
                    新建成员组
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
              <span>共 {filtered.length} 条</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8 rounded-md border-border bg-card"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  aria-label="上一页"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="flex h-8 min-w-8 items-center justify-center px-2 text-sm font-semibold text-foreground">
                  {page}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8 rounded-md border-border bg-card"
                  disabled={page >= pageCount}
                  onClick={() =>
                    setPage((current) => Math.min(pageCount, current + 1))
                  }
                  aria-label="下一页"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PageScaffold>
    </AppFrame>
  )
}

function GroupDeleteAction({
  group,
  deleting,
  disabled,
  onDelete,
}: Readonly<{
  group: TenantGroupOut
  deleting: boolean
  disabled: boolean
  onDelete: (groupId: string) => void
}>) {
  const groupId = String(group.id || '').trim()

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={ICON_BUTTON}
          disabled={disabled || !groupId || deleting}
          aria-label={`删除成员组 ${group.name}`}
          title="删除成员组"
        >
          {deleting ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Trash2 className="size-4" />
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除成员组？</AlertDialogTitle>
          <AlertDialogDescription>
            将删除“{group.name}”。删除后无法恢复；如果它仍用于知识库或文档访问范围，请先移除相关引用。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onDelete(groupId)}
            disabled={deleting}
          >
            {deleting ? '删除中…' : '确认删除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
