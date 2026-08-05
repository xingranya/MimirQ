'use client'

import Link from 'next/link'
import { Search, UploadCloud } from 'lucide-react'

import { Button } from '@/components/ui/button'

export function EmptyState({
  mode,
  onClearFilters,
  onUploadSample,
  onUploadIngest,
}: Readonly<{
  mode: 'truly-empty' | 'filter-empty'
  onClearFilters?: () => void
  onUploadSample?: () => void
  onUploadIngest?: () => void
}>) {
  if (mode === 'filter-empty') {
    return (
      <div
        data-ingestion-empty-state="filter"
        className="flex min-h-60 flex-col items-center justify-center rounded-md border border-dashed border-border bg-background px-6 py-10 text-center"
      >
        <div className="mb-4 flex size-12 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Search className="size-5" aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold text-foreground">没有找到匹配的入库任务</p>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          调整搜索内容、任务状态或错误原因后再试。
        </p>
        {onClearFilters ? (
          <Button className="mt-5" variant="outline" onClick={onClearFilters}>
            清除筛选
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div
      data-ingestion-empty-state="empty"
      className="flex min-h-[320px] flex-col items-center justify-center rounded-md border border-dashed border-border bg-background px-6 py-12 text-center"
    >
      <div className="mb-4 flex size-12 items-center justify-center rounded-md bg-primary/10 text-primary">
        <UploadCloud className="size-5" aria-hidden="true" />
      </div>
      <h2 className="text-base font-semibold text-foreground">还没有入库预检结果</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        选择数据集并上传少量样本，先查看文件格式、风险和解析结果，再决定是否正式入库。
      </p>
      <div className="mt-6 flex w-full max-w-xl flex-col gap-2 sm:flex-row sm:justify-center">
        {onUploadSample ? (
          <Button onClick={onUploadSample}>
            <UploadCloud className="size-4" aria-hidden="true" />
            上传样本评估
          </Button>
        ) : null}
        {onUploadIngest ? (
          <Button variant="outline" onClick={onUploadIngest}>
            正式入库
          </Button>
        ) : null}
        <Button asChild variant="ghost">
          <Link href="/datasets">选择数据集</Link>
        </Button>
      </div>
    </div>
  )
}
