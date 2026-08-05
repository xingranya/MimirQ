'use client'

import { Bug, CircleAlert, Globe, Link2, RefreshCw, SlidersHorizontal, Upload, Zap } from 'lucide-react'

import { cn } from '@/lib/utils'
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'

type KnowledgeImportMenuProps = {
  onUploadFiles: () => void
  onOpenUrlImport: () => void
  onOpenUrlBatch: () => void
  onOpenWebCrawl: () => void
  onOpenJiraProject: () => void
  onOpenPipelineConfig: () => void
  filesDisabledReason?: string | null
  urlDisabledReason?: string | null
  onRetryAvailability?: () => void

  className?: string
}

export function KnowledgeImportMenu({
  onUploadFiles,
  onOpenUrlImport,
  onOpenUrlBatch,
  onOpenWebCrawl,
  onOpenJiraProject,
  onOpenPipelineConfig,
  filesDisabledReason,
  urlDisabledReason,
  onRetryAvailability,
  className,
}: Readonly<KnowledgeImportMenuProps>) {
  const statusReason = filesDisabledReason || urlDisabledReason

  return (
    <div className={cn('min-w-0', className)}>
      {statusReason ? (
        <div className="mx-1 mb-1 flex items-start gap-2 rounded-md bg-muted px-2 py-2 text-xs leading-5 text-muted-foreground" role="status">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{statusReason}</span>
        </div>
      ) : null}
      {onRetryAvailability ? (
        <DropdownMenuItem onSelect={onRetryAvailability} className="gap-2">
          <RefreshCw className="size-4 text-muted-foreground" aria-hidden="true" />
          重新检查
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuLabel className="text-xs text-muted-foreground">添加</DropdownMenuLabel>
      <DropdownMenuItem onSelect={onUploadFiles} className="gap-2" disabled={Boolean(filesDisabledReason)}>
        <Upload className="size-4 text-muted-foreground" />
        上传文件
      </DropdownMenuItem>

      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs text-muted-foreground">导入</DropdownMenuLabel>

      <DropdownMenuItem onSelect={onOpenUrlImport} className="gap-2" disabled={Boolean(urlDisabledReason)}>
        <Link2 className="size-4 text-muted-foreground" />
        通过 URL
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onOpenUrlBatch} className="gap-2" disabled={Boolean(urlDisabledReason)}>
        <Zap className="size-4 text-muted-foreground" />
        URL 批量（Connector）
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onOpenWebCrawl} className="gap-2" disabled={Boolean(urlDisabledReason)}>
        <Globe className="size-4 text-muted-foreground" />
        Website Crawl
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onOpenJiraProject} className="gap-2" disabled={Boolean(urlDisabledReason)}>
        <Bug className="size-4 text-muted-foreground" />
        Jira Project
      </DropdownMenuItem>

      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs text-muted-foreground">配置</DropdownMenuLabel>
      <DropdownMenuItem onSelect={onOpenPipelineConfig} className="gap-2">
        <SlidersHorizontal className="size-4 text-muted-foreground" />
        管线配置
      </DropdownMenuItem>
    </div>
  )
}
