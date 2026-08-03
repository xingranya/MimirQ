'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import {
  Copy,
  Download,
  Eye,
  Hash,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { Link } from '@/i18n/navigation'

import { ProfileEditorDrawer } from '@/components/governance-profiles/profile-editor-drawer'
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { PageScaffold } from '@/components/ui/page-scaffold'
import { Switch } from '@/components/ui/switch'
import { pipelineApi } from '@/lib/api'
import { formatApiError } from '@/lib/api-errors'
import {
  buildGovernanceProfileCreateFromExisting,
  buildIngestionPolicyExportFilename,
} from '@/lib/governance-profile-utils'
import { queryKeys } from '@/lib/query-keys'
import { cn, detachPromise } from '@/lib/utils'
import type {
  GovernanceProfileCreate,
  GovernanceProfileSummary,
} from '@/types'

export function GovernanceProfilesPage() {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [includeBuiltin, setIncludeBuiltin] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | 'view'>(
    'create'
  )
  const [editorProfileRef, setEditorProfileRef] = useState<string | null>(null)
  const [editorSeedCreate, setEditorSeedCreate] =
    useState<GovernanceProfileCreate | null>(null)
  const [deleteTarget, setDeleteTarget] =
    useState<GovernanceProfileSummary | null>(null)
  const [importOverwrite, setImportOverwrite] = useState(false)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  const params = useMemo(() => {
    const q = query.trim()
    return {
      q: q || undefined,
      include_builtin: includeBuiltin,
      limit: 200,
    }
  }, [query, includeBuiltin])

  const profilesQuery = useQuery({
    queryKey: queryKeys.governance.profiles(params),
    queryFn: () => pipelineApi.listGovernanceProfiles(params),
  })
  const resp = profilesQuery.data ?? null
  const loading = profilesQuery.isFetching
  const profileLoadError = profilesQuery.error
    ? formatApiError(profilesQuery.error, '加载治理模板失败')
    : null

  const invalidateProfiles = () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.governance.profiles(params),
    })
  }

  const importProfilesMutation = useMutation({
    mutationFn: (file: File) =>
      pipelineApi.importGovernanceProfiles(file, importOverwrite),
    onSuccess: (result) => {
      toast.success(
        `导入完成：新增 ${result.created} 个，更新 ${result.updated} 个`
      )
      invalidateProfiles()
    },
    onError: (err) => {
      toast.error(formatApiError(err, '导入失败'))
    },
    onSettled: () => {
      if (importInputRef.current) importInputRef.current.value = ''
    },
  })

  const deleteProfileMutation = useMutation({
    mutationFn: async (profile: GovernanceProfileSummary) => {
      if (profile.is_system) return
      const ref = String(profile.id || '').trim() || profile.key
      if (!ref) return
      await pipelineApi.deleteGovernanceProfile(ref)
    },
    onSuccess: () => {
      toast.success('治理模板已删除')
      invalidateProfiles()
    },
    onError: (err) => {
      toast.error(formatApiError(err, '删除失败'))
    },
  })

  const items = useMemo<GovernanceProfileSummary[]>(
    () => resp?.items || [],
    [resp?.items]
  )
  const builtinCount = useMemo(
    () => items.filter((item) => item.is_system).length,
    [items]
  )
  const customCount = items.length - builtinCount

  const openCreateEditor = () => {
    setEditorMode('create')
    setEditorProfileRef(null)
    setEditorSeedCreate(null)
    setEditorOpen(true)
  }

  const openProfileEditor = (profile: GovernanceProfileSummary) => {
    const ref = profile.is_system
      ? profile.key
      : String(profile.id || '').trim() || profile.key
    setEditorMode(profile.is_system ? 'view' : 'edit')
    setEditorSeedCreate(null)
    setEditorProfileRef(ref)
    setEditorOpen(true)
  }

  const copyProfile = async (profile: GovernanceProfileSummary) => {
    const ref = profile.is_system
      ? profile.key
      : String(profile.id || '').trim() || profile.key
    if (!ref) return
    try {
      const source = await pipelineApi.getGovernanceProfile(ref)
      setEditorMode('create')
      setEditorProfileRef(null)
      setEditorSeedCreate(buildGovernanceProfileCreateFromExisting(source))
      setEditorOpen(true)
    } catch (err: unknown) {
      toast.error(formatApiError(err, '复制失败'))
    }
  }

  const exportOne = async (profile: GovernanceProfileSummary) => {
    const ref = profile.is_system
      ? profile.key
      : String(profile.id || '').trim() || profile.key
    if (!ref) return
    try {
      const blob = await pipelineApi.exportGovernanceProfile(ref)
      const safe = (profile.key || 'profile')
        .replaceAll(/[\\/:*?"<>|]+/g, '_')
        .slice(0, 120)
      const filename = `${safe}.governance-profile.json`
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      globalThis.window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.success('治理模板已导出')
    } catch (err: unknown) {
      toast.error(formatApiError(err, '导出失败'))
    }
  }

  const exportAsIngestionPolicy = async (
    profile: GovernanceProfileSummary
  ) => {
    const ref = profile.is_system
      ? profile.key
      : String(profile.id || '').trim() || profile.key
    if (!ref) return
    try {
      const blob = await pipelineApi.exportGovernanceProfileIngestionPolicy(ref)
      const filename = buildIngestionPolicyExportFilename(
        profile.key || 'profile'
      )
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      globalThis.window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.success('入库规则已导出')
    } catch (err: unknown) {
      toast.error(formatApiError(err, '导出入库规则失败'))
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除该治理模板？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                删除后无法恢复。
                {deleteTarget ? (
                  <div className="mt-3 border-t border-border pt-3">
                    <div className="truncate text-sm font-medium text-foreground">
                      {deleteTarget.name || deleteTarget.key}
                    </div>
                    <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      {deleteTarget.key}
                    </div>
                  </div>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteTarget) return
                deleteProfileMutation.mutate(deleteTarget)
                setDeleteTarget(null)
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ProfileEditorDrawer
        open={editorOpen}
        mode={editorMode}
        profileRef={editorProfileRef}
        seedCreate={editorSeedCreate}
        onOpenChange={(next) => {
          setEditorOpen(next)
          if (!next) setEditorSeedCreate(null)
        }}
        onSaved={invalidateProfiles}
        onCreated={invalidateProfiles}
      />

      <input
        ref={importInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) importProfilesMutation.mutate(file)
        }}
      />

      <PageScaffold
        title="治理模板"
        description="集中管理文档清洗、校验和入库规则。"
        iconImage="governance-config"
        icon={ShieldCheck}
        iconColor="text-primary"
        size="7xl"
        actions={
          <Button className="h-9 rounded-md px-4" onClick={openCreateEditor}>
            <Plus className="size-4" />
            新建模板
          </Button>
        }
        toolbar={
          <div className="flex w-full flex-col gap-2 md:flex-row md:items-center">
            <div className="relative min-w-0 flex-1 md:max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索名称、说明或模板标识"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-9 bg-background pl-9 text-sm shadow-none"
              />
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-3 md:ml-auto">
              <span className="text-xs text-muted-foreground" aria-live="polite">
                共 {items.length} 个，{customCount} 个团队模板
              </span>
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 text-sm text-foreground">
                <Switch
                  checked={includeBuiltin}
                  onCheckedChange={setIncludeBuiltin}
                />
                <span>显示系统模板</span>
              </label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="size-9 rounded-md"
                    aria-label="更多模板操作"
                    title="更多模板操作"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-md">
                  <DropdownMenuItem
                    disabled={loading}
                    onSelect={() => profilesQuery.refetch()}
                  >
                    <RefreshCw
                      className={cn(
                        'size-4',
                        loading && 'animate-spin motion-reduce:animate-none'
                      )}
                    />
                    刷新模板
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={importProfilesMutation.isPending}
                    onSelect={() => importInputRef.current?.click()}
                  >
                    <Upload className="size-4" />
                    导入模板
                  </DropdownMenuItem>
                  <DropdownMenuCheckboxItem
                    checked={importOverwrite}
                    className="pl-8"
                    onCheckedChange={(checked) =>
                      setImportOverwrite(Boolean(checked))
                    }
                  >
                    导入时覆盖同名模板
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/data-governance/common-lines">
                      <Hash className="size-4" />
                      重复内容治理
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        }
      >
        {profileLoadError ? (
          <div
            role="alert"
            className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {profileLoadError}
          </div>
        ) : null}

        {items.length ? (
          <div
            className="overflow-hidden rounded-md border border-border bg-card"
            aria-busy={loading}
          >
            <div className="hidden grid-cols-[minmax(0,1fr)_minmax(10rem,0.55fr)_auto] gap-4 border-b border-border bg-muted/35 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
              <span>模板</span>
              <span>类型与标识</span>
              <span className="pr-1 text-right">操作</span>
            </div>
            <div className="divide-y divide-border">
              {items.map((profile) => (
                <div
                  key={profile.key}
                  className="flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-muted/25 md:grid md:grid-cols-[minmax(0,1fr)_minmax(10rem,0.55fr)_auto] md:items-center md:gap-4"
                >
                  <div className="min-w-0">
                    <div
                      title={profile.name}
                      className="truncate text-sm font-semibold text-foreground"
                    >
                      {profile.name}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
                      {profile.description ||
                        (profile.is_system
                          ? '系统预设，可查看或复制后调整。'
                          : '团队模板，可继续编辑或导出。')}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <span className="inline-flex rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                      {profile.is_system ? '系统模板' : '团队模板'}
                    </span>
                    <div
                      title={profile.key}
                      className="mt-1.5 truncate font-mono text-xs text-muted-foreground"
                    >
                      {profile.key}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1 md:justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-md px-3 text-xs"
                      onClick={() => openProfileEditor(profile)}
                    >
                      <Eye className="size-3.5" />
                      {profile.is_system ? '查看' : '编辑'}
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 rounded-md"
                      aria-label={`复制${profile.name}`}
                      title="复制模板"
                      onClick={() => detachPromise(copyProfile(profile))}
                    >
                      <Copy className="size-4" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8 rounded-md"
                          aria-label={`${profile.name}的更多操作`}
                          title="更多操作"
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-52 rounded-md"
                      >
                        <DropdownMenuItem
                          onSelect={() => detachPromise(exportOne(profile))}
                        >
                          <Download className="size-4" />
                          导出模板 JSON
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            detachPromise(exportAsIngestionPolicy(profile))
                          }
                        >
                          <Download className="size-4" />
                          导出入库规则
                        </DropdownMenuItem>
                        {profile.is_system ? null : (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => setDeleteTarget(profile)}
                            >
                              <Trash2 className="size-4" />
                              删除模板
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : profileLoadError ? null : (
          <EmptyState
            className="rounded-md border-border bg-card"
            title={loading ? '正在加载模板' : '没有找到治理模板'}
            description={
              loading
                ? '请稍候。'
                : query.trim()
                  ? '换个关键词试试，或清空搜索条件。'
                  : includeBuiltin
                    ? '新建一个团队模板，保存常用的文档处理规则。'
                    : '当前没有团队模板，也可以打开“显示系统模板”查看预设。'
            }
            icon={ShieldCheck}
          >
            {loading ? null : (
              <Button size="sm" onClick={openCreateEditor}>
                <Plus className="size-4" />
                新建模板
              </Button>
            )}
          </EmptyState>
        )}
      </PageScaffold>
    </div>
  )
}
