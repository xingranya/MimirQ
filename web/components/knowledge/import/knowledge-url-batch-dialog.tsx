'use client'

import type { ConnectorRunOut, Dataset, DocumentAccessMode } from '@/types'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { PipelineOptionsPanel } from '@/components/pipeline-options-panel'
import { GroupChipsInput } from '@/components/groups/group-chips-input'
import { Button } from '@/components/ui/button'
import { ChunkStrategyDropdown } from '@/components/business/chunk-strategy-dropdown'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ParserDropdown } from '@/components/business/parser-dropdown'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useChunkStrategyPreference } from '@/contexts/chunk-strategy-context'
import { useParserBackendPreference } from '@/contexts/parser-backend-context'
import { usePipelineOptions } from '@/contexts/pipeline-options-context'
import { formatApiError } from '@/lib/api-errors'
import { connectorApi } from '@/lib/api'
import { detachPromise } from '@/lib/utils'
import {
  URL_BATCH_MAX_ACCESS_MEMBERS,
  URL_BATCH_MAX_FILENAME_LENGTH,
  URL_BATCH_MAX_URLS,
  analyzeAccessMembers,
  analyzeUrlBatch,
  buildUrlBatchRunPayload,
} from './knowledge-url-batch-dialog.payload'

type KnowledgeUrlBatchDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void

  datasets: Dataset[]
  datasetsLoading: boolean
  selectedDatasetId?: string
  datasetDefaultValue: string

  loadDocuments: (params?: { dataset_id?: string }) => void | Promise<void>
  loadConnectorRuns: (params?: { datasetId?: string }) => void | Promise<void>
  onRunCreated?: (run: ConnectorRunOut) => void
  onDatasetResolved?: (datasetId: string) => void
}

export function KnowledgeUrlBatchDialog({
  open,
  onOpenChange,
  datasets,
  datasetsLoading,
  selectedDatasetId,
  datasetDefaultValue,
  loadDocuments,
  loadConnectorRuns,
  onRunCreated,
  onDatasetResolved,
}: Readonly<KnowledgeUrlBatchDialogProps>) {
  const { parserBackend, setParserBackend } = useParserBackendPreference()
  const { chunkStrategy, setChunkStrategy } = useChunkStrategyPreference()
  const { enabled: pipelineOverridesEnabled, options: pipelineOptions } = usePipelineOptions()

  const [urls, setUrls] = useState('')
  const [filename, setFilename] = useState('')
  const [datasetId, setDatasetId] = useState<string>(datasetDefaultValue)
  const [accessMode, setAccessMode] = useState<DocumentAccessMode>('inherit')
  const [accessMembers, setAccessMembers] = useState('')
  const [accessGroupIds, setAccessGroupIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setDatasetId(selectedDatasetId || datasetDefaultValue)
  }, [datasetDefaultValue, open, selectedDatasetId])

  const urlAnalysis = useMemo(() => analyzeUrlBatch(urls), [urls])
  const accessMemberAnalysis = useMemo(() => analyzeAccessMembers(accessMembers), [accessMembers])
  const filenameTooLong = filename.trim().length > URL_BATCH_MAX_FILENAME_LENGTH
  const urlInputInvalid =
    urlAnalysis.invalidCount > 0 ||
    urlAnalysis.duplicateCount > 0 ||
    urlAnalysis.overflowCount > 0 ||
    urlAnalysis.tooLongCount > 0
  const accessInputInvalid =
    accessMode === 'partial_members' &&
    (accessMemberAnalysis.overflowCount > 0 ||
      accessMemberAnalysis.tooLongCount > 0 ||
      accessGroupIds.length > URL_BATCH_MAX_ACCESS_MEMBERS)
  const hasBlockingError = urlInputInvalid || filenameTooLong || accessInputInvalid

  const handleSubmit = useCallback(async () => {
    if (!urlAnalysis.urls.length) {
      toast.error('请输入至少一个有效网址，地址需以 http:// 或 https:// 开头')
      return
    }
    if (urlInputInvalid) {
      toast.error('请修正格式不正确、重复、过长或超出数量上限的网址')
      return
    }
    if (filenameTooLong) {
      toast.error(`文档名称不能超过 ${URL_BATCH_MAX_FILENAME_LENGTH} 个字符`)
      return
    }
    if (accessInputInvalid) {
      toast.error('请修正成员或成员组的数量和长度')
      return
    }

    setSubmitting(true)
    try {
      const run = await connectorApi.createRun(
        buildUrlBatchRunPayload({
          datasetId,
          datasetDefaultValue,
          urls: urlAnalysis.urls,
          filename,
          parserBackend,
          chunkStrategy,
          pipeline: pipelineOverridesEnabled ? pipelineOptions : undefined,
          accessMode,
          accessMembers: accessMemberAnalysis.members,
          accessGroupIds,
        })
      )

      toast.success(`已创建批量导入任务：${run.id.slice(0, 8)}`, {
        action: onRunCreated
          ? {
              label: '查看任务',
              onClick: () => onRunCreated(run),
            }
          : undefined,
      })
      onOpenChange(false)
      setUrls('')
      setFilename('')
      setAccessMode('inherit')
      setAccessMembers('')
      setAccessGroupIds([])
      const resolvedDatasetId = String(run.dataset_id || '').trim()
      if (resolvedDatasetId) onDatasetResolved?.(resolvedDatasetId)
      detachPromise(loadConnectorRuns({ datasetId: resolvedDatasetId || undefined }))
      detachPromise(loadDocuments({ dataset_id: resolvedDatasetId || undefined }))
    } catch (err: unknown) {
      toast.error(formatApiError(err, '创建 URL 批量导入失败'))
    } finally {
      setSubmitting(false)
    }
  }, [
    accessMemberAnalysis.members,
    accessGroupIds,
    accessMode,
    accessInputInvalid,
    chunkStrategy,
    datasetDefaultValue,
    datasetId,
    filename,
    filenameTooLong,
    loadConnectorRuns,
    loadDocuments,
    onOpenChange,
    onDatasetResolved,
    parserBackend,
    pipelineOptions,
    pipelineOverridesEnabled,
    onRunCreated,
    urlAnalysis.urls,
    urlInputInvalid,
  ])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>URL 批量导入（Connector）</DialogTitle>
          <DialogDescription>一次导入多个 URL，并生成导入运行记录（需要后端开启 URL_INGEST_ENABLED）。</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground/80">网址（每行一个，最多 {URL_BATCH_MAX_URLS} 个）</div>
            <Textarea
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              placeholder={'https://example.com/doc1.pdf\nhttps://example.com/doc2.html'}
              className="font-mono min-h-[140px]"
              aria-describedby="knowledge-url-batch-status"
              aria-invalid={urlInputInvalid}
            />
            <div
              id="knowledge-url-batch-status"
              className={urlInputInvalid ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
              aria-live="polite"
            >
              {urlAnalysis.urls.length} 个有效网址
              {urlAnalysis.invalidCount ? `，${urlAnalysis.invalidCount} 个格式不正确` : ''}
              {urlAnalysis.duplicateCount ? `，${urlAnalysis.duplicateCount} 个重复` : ''}
              {urlAnalysis.tooLongCount ? `，${urlAnalysis.tooLongCount} 个超过 2000 字符` : ''}
              {urlAnalysis.overflowCount ? `，${urlAnalysis.overflowCount} 个超出上限` : ''}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground/80">文件名（可选）</div>
              <Input
                value={filename}
                onChange={(event) => setFilename(event.target.value)}
                placeholder="例如：产品手册.pdf"
                maxLength={URL_BATCH_MAX_FILENAME_LENGTH}
                aria-invalid={filenameTooLong}
              />
              <div className="text-xs text-muted-foreground">用于显示名/扩展名推断（对所有 URL 生效）。</div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground/80">目标数据集</div>
              <Select value={datasetId} onValueChange={setDatasetId}>
                <SelectTrigger className="h-10 bg-background">
                  <SelectValue placeholder="选择数据集" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={datasetDefaultValue}>默认（自动选择可写数据集）</SelectItem>
                  {datasets.map((ds) => (
                    <SelectItem key={ds.id} value={ds.id}>
                      {ds.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {datasetsLoading ? <div className="text-xs text-muted-foreground">正在加载数据集...</div> : null}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground/80">文档访问控制（可选）</div>
            <Select value={accessMode} onValueChange={(v) => setAccessMode(v as DocumentAccessMode)}>
              <SelectTrigger className="h-10 bg-background">
                <SelectValue placeholder="选择访问模式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inherit">继承数据集</SelectItem>
                <SelectItem value="only_me">仅我可见</SelectItem>
                <SelectItem value="partial_members">指定成员/组</SelectItem>
                <SelectItem value="all_team_members">团队成员</SelectItem>
              </SelectContent>
            </Select>
            {accessMode === 'partial_members' ? (
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-foreground/80">允许组（可选）</div>
                  <GroupChipsInput
                    value={accessGroupIds}
                    onChange={setAccessGroupIds}
                    maxItems={URL_BATCH_MAX_ACCESS_MEMBERS}
                    placeholder="选择组（组内成员将自动获得访问权限）"
                  />
                  <div className="text-xs text-muted-foreground">最多 200 个；仅支持当前租户已存在的组。</div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium text-foreground/80">允许成员（每行一个 user_id）</div>
                  <Textarea
                    value={accessMembers}
                    onChange={(e) => setAccessMembers(e.target.value)}
                    placeholder={'alice\nbob\ncharlie'}
                    className="font-mono min-h-[110px]"
                    aria-describedby="knowledge-url-batch-members-status"
                    aria-invalid={accessInputInvalid}
                  />
                  <div
                    id="knowledge-url-batch-members-status"
                    className={accessInputInvalid ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
                    aria-live="polite"
                  >
                    {accessMemberAnalysis.members.length} 个成员账号
                    {accessMemberAnalysis.duplicateCount ? `，${accessMemberAnalysis.duplicateCount} 个重复` : ''}
                    {accessMemberAnalysis.tooLongCount ? `，${accessMemberAnalysis.tooLongCount} 个超过 255 字符` : ''}
                    {accessMemberAnalysis.overflowCount ? `，${accessMemberAnalysis.overflowCount} 个超出上限` : ''}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground/80">解析方式</div>
              <ParserDropdown value={parserBackend} onChange={setParserBackend} />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground/80">切块策略</div>
              <ChunkStrategyDropdown value={chunkStrategy} onChange={setChunkStrategy} />
            </div>
          </div>

          <PipelineOptionsPanel />

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || hasBlockingError} className="gap-2">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" /> : null}
              开始导入
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
