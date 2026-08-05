'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Panel } from '@/components/ui/panel'
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { LTRModelInfo } from '@/lib/api'
import { cn } from '@/lib/utils'
import { systemDenseControls, systemPageTokens, systemWorkbenchTokens } from '@/components/ui/system-page-tokens'
import { AlertCircle, CheckCircle2, RefreshCw, UploadCloud, XCircle } from 'lucide-react'

type LtrMessage = { type: 'success' | 'error'; text: string } | null

type LtrModelRegistrySectionProps = {
  ltrError: string | null
  ltrMessage: LtrMessage
  ltrUploading: boolean
  ltrUploadManifestFileName: string
  ltrUploadModelFileName: string
  ltrUploadReady: boolean
  ltrUploadResetKey: number
  ltrLoading: boolean
  ltrBusyModelId: string | null
  ltrModels: LTRModelInfo[]
  onRegister: () => void
  onRefreshList: () => void
  onRollback: () => void
  onActivate: (modelId: string) => void
  onModelFileChange: (file: File | null) => void
  onManifestFileChange: (file: File | null) => void
  formatBytes: (value: unknown) => string
  formatTime: (value: unknown) => string
  shortId: (value: unknown, keep?: number) => string
}

export function LtrModelRegistrySection({
  ltrError,
  ltrMessage,
  ltrUploading,
  ltrUploadManifestFileName,
  ltrUploadModelFileName,
  ltrUploadReady,
  ltrUploadResetKey,
  ltrLoading,
  ltrBusyModelId,
  ltrModels,
  onRegister,
  onRefreshList,
  onRollback,
  onActivate,
  onModelFileChange,
  onManifestFileChange,
  formatBytes,
  formatTime,
  shortId,
}: Readonly<LtrModelRegistrySectionProps>) {
  return (
    <section className="space-y-3">
      <div className="space-y-2">
        {ltrError && ltrModels.length > 0 ? (
          <Alert
            variant="destructive"
            className="p-3 shadow-none [&>svg]:left-3 [&>svg]:top-3 [&>svg~*]:pl-6"
          >
            <XCircle className="h-3.5 w-3.5" />
            <div>
              <AlertTitle className="text-xs">模型列表刷新失败</AlertTitle>
              <AlertDescription className="text-[11px] leading-4 text-foreground/80">{ltrError}</AlertDescription>
            </div>
          </Alert>
        ) : null}

        {ltrMessage ? (
          <Alert
            variant={ltrMessage.type === 'success' ? 'success' : 'destructive'}
            className="p-3 shadow-none [&>svg]:left-3 [&>svg]:top-3 [&>svg~*]:pl-6"
          >
            {ltrMessage.type === 'success' ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <XCircle className="h-3.5 w-3.5" />
            )}
            <div>
              <AlertTitle className="text-xs">{ltrMessage.type === 'success' ? '操作成功' : '操作失败'}</AlertTitle>
              <AlertDescription className="text-[11px] leading-4 text-foreground/80">{ltrMessage.text}</AlertDescription>
            </div>
          </Alert>
        ) : null}
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.15fr)]">
        <Panel padding="none" className={cn(systemWorkbenchTokens.panel, 'p-3.5')}>
          <div className="mb-3 min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <UploadCloud className="size-4 text-primary" />
              上传新版本
            </div>
            <div className={cn(systemPageTokens.subtle, 'mt-1 text-pretty')}>
              选择 XGBoost 模型和配套清单。上传后系统会核对文件校验值与特征结构。
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="ltr-model-file" className="text-xs font-medium text-foreground/80">
                模型文件
              </label>
              <label
                htmlFor="ltr-model-file"
                title={ltrUploadModelFileName || undefined}
                className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-muted/40 hover:text-foreground focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
              >
                <CheckCircle2
                  className={cn(
                    'size-4 shrink-0',
                    ltrUploadModelFileName ? 'text-success' : 'text-muted-foreground'
                  )}
                />
                <span className="min-w-0 flex-1 truncate">
                  {ltrUploadModelFileName || '选择模型 JSON'}
                </span>
                <Input
                  key={`ltr-model-${ltrUploadResetKey}`}
                  id="ltr-model-file"
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => onModelFileChange(event.target.files?.[0] || null)}
                  className="sr-only"
                />
              </label>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ltr-manifest-file" className="text-xs font-medium text-foreground/80">
                清单文件
              </label>
              <label
                htmlFor="ltr-manifest-file"
                title={ltrUploadManifestFileName || undefined}
                className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-muted/40 hover:text-foreground focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
              >
                <CheckCircle2
                  className={cn(
                    'size-4 shrink-0',
                    ltrUploadManifestFileName ? 'text-success' : 'text-muted-foreground'
                  )}
                />
                <span className="min-w-0 flex-1 truncate">
                  {ltrUploadManifestFileName || '选择清单 JSON'}
                </span>
                <Input
                  key={`ltr-manifest-${ltrUploadResetKey}`}
                  id="ltr-manifest-file"
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => onManifestFileChange(event.target.files?.[0] || null)}
                  className="sr-only"
                />
              </label>
            </div>
            <Button
              onClick={onRegister}
              disabled={!ltrUploadReady || ltrUploading}
              className={cn(systemDenseControls.primaryButton, 'w-full gap-1.5')}
            >
              <RefreshCw
                className={cn('h-3.5 w-3.5', ltrUploading && 'animate-spin motion-reduce:animate-none')}
              />
              {ltrUploading ? '上传中…' : '上传并注册'}
            </Button>
          </div>
        </Panel>

        <Panel
          padding="none"
          className={cn(systemWorkbenchTokens.panel, 'space-y-3 p-3.5')}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className={systemPageTokens.heading}>模型版本</div>
              <div className={cn(systemPageTokens.subtle, 'mt-0.5')}>
                激活后用于在线重排序。模型不可用时，系统会关闭 LTR 重排。
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <Button
                variant="outline"
                onClick={onRefreshList}
                disabled={ltrLoading || ltrBusyModelId !== null}
                className={cn(systemDenseControls.outlineButton, 'w-full gap-1.5 sm:w-auto')}
              >
                <RefreshCw
                  className={cn('h-3.5 w-3.5', ltrLoading && 'animate-spin motion-reduce:animate-none')}
                />
                刷新列表
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={ltrLoading || ltrModels.length === 0 || ltrBusyModelId !== null}
                    className={cn(systemDenseControls.outlineButton, 'w-full gap-1.5 sm:w-auto')}
                  >
                    <AlertCircle className="h-3.5 w-3.5" />
                    回滚
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>回滚重排序模型？</AlertDialogTitle>
                    <AlertDialogDescription className="text-pretty">
                      当前模型会切换到上一个版本。系统只保留一步回滚；没有可用版本时不会修改现有配置。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction onClick={onRollback} className="gap-2">
                      确认回滚
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {ltrLoading && ltrModels.length === 0 ? (
            <div
              className="flex min-h-24 items-center justify-center gap-2 rounded-md border border-border bg-muted/20 px-4 text-xs text-muted-foreground"
              role="status"
            >
              <RefreshCw className="size-4 animate-spin motion-reduce:animate-none" />
              正在加载模型版本…
            </div>
          ) : ltrError && ltrModels.length === 0 ? (
            <div
              className="rounded-md border border-destructive/25 bg-destructive/10 p-4"
              role="alert"
            >
              <div className="flex items-start gap-2">
                <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">模型版本暂时无法加载</div>
                  <div className="mt-1 break-words text-xs leading-5 text-muted-foreground">
                    {ltrError}
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={onRefreshList}
                className={cn(systemDenseControls.outlineButton, 'mt-3 w-full sm:w-auto')}
              >
                <RefreshCw className="size-4" />
                重新加载
              </Button>
            </div>
          ) : ltrModels.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/20 p-5 text-center">
              <div className="text-sm font-medium text-foreground">还没有模型版本</div>
              <div className="mt-1 text-xs text-muted-foreground">
                上传模型和清单后，可在这里激活或回滚。
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2 md:hidden" data-testid="ltr-model-mobile-list">
                {ltrModels.map((model) => (
                  <article
                    key={model.model_id}
                    className={cn(
                      'rounded-md border border-border bg-background p-3',
                      model.active && 'border-success/30 bg-success/5'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-muted-foreground">模型 ID</div>
                        <div
                          className="mt-0.5 truncate font-mono text-xs text-foreground"
                          title={model.model_id}
                        >
                          {shortId(model.model_id, 18)}
                        </div>
                      </div>
                      <ModelStatus active={Boolean(model.active)} />
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-3 text-xs">
                      <ModelDetail
                        label="文件校验值"
                        value={shortId(model.model_sha256, 12)}
                        title={model.model_sha256}
                        mono
                      />
                      <ModelDetail
                        label="特征结构"
                        value={`v${model.feature_spec_version} · ${model.feature_schema || '-'} · ${Array.isArray(model.feature_names) ? model.feature_names.length : 0} 维`}
                      />
                      <ModelDetail label="文件大小" value={formatBytes(model.size_bytes)} />
                      <ModelDetail label="创建时间" value={formatTime(model.created_at)} />
                    </dl>
                    <div className="mt-3">
                      <ModelActivationAction
                        model={model}
                        busyModelId={ltrBusyModelId}
                        onActivate={onActivate}
                        fullWidth
                      />
                    </div>
                  </article>
                ))}
              </div>

              <div
                className="hidden overflow-x-auto rounded-md border border-border md:block"
                data-testid="ltr-model-desktop-table"
              >
                <table aria-label="已注册的重排序模型" className="w-full text-xs">
                  <thead className="bg-muted/35">
                    <tr className="text-left">
                      <th className={cn(systemPageTokens.tableHead, 'whitespace-nowrap px-2.5 py-1.5')}>状态</th>
                      <th className={cn(systemPageTokens.tableHead, 'whitespace-nowrap px-2.5 py-1.5')}>模型 ID</th>
                      <th className={cn(systemPageTokens.tableHead, 'whitespace-nowrap px-2.5 py-1.5')}>文件校验值</th>
                      <th className={cn(systemPageTokens.tableHead, 'whitespace-nowrap px-2.5 py-1.5')}>特征</th>
                      <th className={cn(systemPageTokens.tableHead, 'whitespace-nowrap px-2.5 py-1.5 tabular-nums')}>大小</th>
                      <th className={cn(systemPageTokens.tableHead, 'whitespace-nowrap px-2.5 py-1.5')}>创建时间</th>
                      <th className={cn(systemPageTokens.tableHead, 'whitespace-nowrap px-2.5 py-1.5')}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ltrModels.map((model) => (
                      <tr
                        key={model.model_id}
                        className={cn(
                          'border-t border-border align-top hover:bg-muted/20',
                          model.active && 'bg-success/10'
                        )}
                      >
                        <td className="px-2.5 py-1.5">
                          <ModelStatus active={Boolean(model.active)} />
                        </td>
                        <td className="px-2.5 py-1.5 font-mono tabular-nums">
                          <span title={model.model_id}>{shortId(model.model_id, 16)}</span>
                        </td>
                        <td className="px-2.5 py-1.5 font-mono tabular-nums">
                          <span title={model.model_sha256}>{shortId(model.model_sha256, 12)}</span>
                        </td>
                        <td className="px-2.5 py-1.5 text-muted-foreground">
                          <div className="tabular-nums">v{model.feature_spec_version}</div>
                          <div className="max-w-[15rem] truncate" title={model.feature_schema || ''}>
                            {model.feature_schema || '-'}
                          </div>
                          <div className="tabular-nums">
                            {Array.isArray(model.feature_names) ? model.feature_names.length : 0} 维
                          </div>
                        </td>
                        <td className="px-2.5 py-1.5 tabular-nums">
                          {formatBytes(model.size_bytes)}
                        </td>
                        <td className="px-2.5 py-1.5 tabular-nums">
                          {formatTime(model.created_at)}
                        </td>
                        <td className="px-2.5 py-1.5">
                          <ModelActivationAction
                            model={model}
                            busyModelId={ltrBusyModelId}
                            onActivate={onActivate}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>
      </div>
    </section>
  )
}

function ModelStatus({ active }: Readonly<{ active: boolean }>) {
  return active ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-success/25 bg-success/10 px-1.5 py-0.5 text-xs font-medium text-success">
      <CheckCircle2 className="size-3" />
      已激活
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
      待激活
    </span>
  )
}

function ModelDetail({
  label,
  value,
  title,
  mono = false,
}: Readonly<{
  label: string
  value: string
  title?: string
  mono?: boolean
}>) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn('mt-0.5 truncate text-xs text-foreground', mono && 'font-mono')}
        title={title}
      >
        {value}
      </dd>
    </div>
  )
}

function ModelActivationAction({
  model,
  busyModelId,
  onActivate,
  fullWidth = false,
}: Readonly<{
  model: LTRModelInfo
  busyModelId: string | null
  onActivate: (modelId: string) => void
  fullWidth?: boolean
}>) {
  const modelId = String(model.model_id || '').trim()
  const isBusy = busyModelId === modelId
  const buttonClass = cn(
    systemDenseControls.inlineAction,
    'h-8 px-3 text-xs',
    fullWidth && 'w-full'
  )

  if (model.active) {
    return (
      <Button variant="outline" disabled className={buttonClass}>
        已激活
      </Button>
    )
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={busyModelId !== null} className={buttonClass}>
          <RefreshCw
            className={cn('size-3.5', isBusy && 'animate-spin motion-reduce:animate-none')}
          />
          {isBusy ? '激活中…' : '激活'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>激活这个重排序模型？</AlertDialogTitle>
          <AlertDialogDescription className="text-pretty">
            后续检索会使用这个版本。需要恢复时，可以回滚到上一个版本。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1 rounded-md border border-border bg-muted/30 p-3 text-xs">
          <div className="break-all font-mono">模型 ID：{modelId}</div>
          <div className="break-all font-mono">
            文件校验值：{String(model.model_sha256 || '')}
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={() => onActivate(modelId)}>确认激活</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
