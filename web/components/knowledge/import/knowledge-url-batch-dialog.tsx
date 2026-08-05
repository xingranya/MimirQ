'use client'

import type { ConnectorRunOut, Dataset, DocumentAccessMode } from '@/types'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { PipelineOptionsPanel } from '@/components/pipeline-options-panel'
import { GroupChipsInput } from '@/components/groups/group-chips-input'
import { Button } from '@/components/ui/button'
import { ChunkStrategyDropdown } from '@/components/business/chunk-strategy-dropdown'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

const DETAILS_CLASS = 'group rounded-md border border-border bg-background'
const SUMMARY_CLASS =
  'flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden'

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

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && submitting) return
      onOpenChange(nextOpen)
    },
    [onOpenChange, submitting]
  )

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
      toast.error(formatApiError(err, '创建批量导入任务失败'))
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
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="grid h-[min(92dvh,800px)] max-h-[calc(100dvh-1rem)] grid-rows-[auto,1fr,auto] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-4 py-4 pr-14 text-left sm:px-6">
          <DialogTitle>批量导入网址</DialogTitle>
          <DialogDescription>每行输入一个网址，系统会创建任务并依次导入知识库。</DialogDescription>
        </DialogHeader>

        <form
          id="knowledge-url-batch-form"
          className="min-h-0 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6"
          onSubmit={(event) => {
            event.preventDefault()
            void handleSubmit()
          }}
        >
          <div className="space-y-6">
            <section className="space-y-4" aria-labelledby="knowledge-url-batch-source-heading">
              <div>
                <h3 id="knowledge-url-batch-source-heading" className="text-sm font-semibold text-foreground">
                  导入内容
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">支持网页和可直接访问的文件地址，最多 {URL_BATCH_MAX_URLS} 个。</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="knowledge-url-batch-urls">网址列表</Label>
                <Textarea
                  id="knowledge-url-batch-urls"
                  value={urls}
                  onChange={(event) => setUrls(event.target.value)}
                  placeholder={'https://example.com/doc1.pdf\nhttps://example.com/doc2.html'}
                  className="min-h-32 font-mono"
                  aria-describedby="knowledge-url-batch-status"
                  aria-invalid={urlInputInvalid}
                  autoFocus
                />
                <p
                  id="knowledge-url-batch-status"
                  className={urlInputInvalid ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
                  aria-live="polite"
                >
                  {urlAnalysis.urls.length} 个有效网址
                  {urlAnalysis.invalidCount ? `，${urlAnalysis.invalidCount} 个格式不正确` : ''}
                  {urlAnalysis.duplicateCount ? `，${urlAnalysis.duplicateCount} 个重复` : ''}
                  {urlAnalysis.tooLongCount ? `，${urlAnalysis.tooLongCount} 个超过 2000 字符` : ''}
                  {urlAnalysis.overflowCount ? `，${urlAnalysis.overflowCount} 个超出上限` : ''}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="knowledge-url-batch-dataset">目标知识库</Label>
                  <Select value={datasetId} onValueChange={setDatasetId} disabled={datasetsLoading}>
                    <SelectTrigger id="knowledge-url-batch-dataset" className="h-10 bg-background">
                      <SelectValue placeholder={datasetsLoading ? '正在加载知识库' : '选择知识库'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={datasetDefaultValue}>自动选择可写知识库</SelectItem>
                      {datasets.map((dataset) => (
                        <SelectItem key={dataset.id} value={dataset.id}>
                          {dataset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="knowledge-url-batch-filename">统一文档名称（可选）</Label>
                  <Input
                    id="knowledge-url-batch-filename"
                    value={filename}
                    onChange={(event) => setFilename(event.target.value)}
                    placeholder="例如：产品手册.pdf"
                    maxLength={URL_BATCH_MAX_FILENAME_LENGTH}
                    aria-invalid={filenameTooLong}
                  />
                  <p className="text-xs text-muted-foreground">留空时使用各网址中的原始名称。</p>
                </div>
              </div>
            </section>

            <div className="space-y-3 border-t border-border pt-5">
              <details className={DETAILS_CLASS}>
                <summary className={SUMMARY_CLASS}>
                  <span>访问权限</span>
                  <ChevronDown
                    className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                    aria-hidden="true"
                  />
                </summary>
                <div className="space-y-4 border-t border-border p-4">
                  <div className="space-y-2">
                    <Label htmlFor="knowledge-url-batch-access-mode">文档可见范围</Label>
                    <Select value={accessMode} onValueChange={(value) => setAccessMode(value as DocumentAccessMode)}>
                      <SelectTrigger id="knowledge-url-batch-access-mode" className="h-10 bg-background">
                        <SelectValue placeholder="选择可见范围" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inherit">继承知识库权限</SelectItem>
                        <SelectItem value="only_me">仅我可见</SelectItem>
                        <SelectItem value="partial_members">指定成员或成员组</SelectItem>
                        <SelectItem value="all_team_members">全部团队成员</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {accessMode === 'partial_members' ? (
                    <div className="space-y-4 border-t border-border pt-4">
                      <div className="space-y-2">
                        <div id="knowledge-url-batch-groups-label" className="text-sm font-medium text-foreground">
                          允许访问的成员组（可选）
                        </div>
                        <div role="group" aria-labelledby="knowledge-url-batch-groups-label">
                          <GroupChipsInput
                            value={accessGroupIds}
                            onChange={setAccessGroupIds}
                            maxItems={URL_BATCH_MAX_ACCESS_MEMBERS}
                            placeholder="选择成员组"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">最多选择 200 个成员组。</p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="knowledge-url-batch-members">允许访问的成员账号（可选）</Label>
                        <Textarea
                          id="knowledge-url-batch-members"
                          value={accessMembers}
                          onChange={(event) => setAccessMembers(event.target.value)}
                          placeholder={'alice\nbob\ncharlie'}
                          className="min-h-24 font-mono"
                          aria-describedby="knowledge-url-batch-members-status"
                          aria-invalid={accessInputInvalid}
                        />
                        <p
                          id="knowledge-url-batch-members-status"
                          className={accessInputInvalid ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
                          aria-live="polite"
                        >
                          {accessMemberAnalysis.members.length} 个成员账号
                          {accessMemberAnalysis.duplicateCount ? `，${accessMemberAnalysis.duplicateCount} 个重复` : ''}
                          {accessMemberAnalysis.tooLongCount ? `，${accessMemberAnalysis.tooLongCount} 个超过 255 字符` : ''}
                          {accessMemberAnalysis.overflowCount ? `，${accessMemberAnalysis.overflowCount} 个超出上限` : ''}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </details>

              <details className={DETAILS_CLASS}>
                <summary className={SUMMARY_CLASS}>
                  <span>解析与入库</span>
                  <ChevronDown
                    className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                    aria-hidden="true"
                  />
                </summary>
                <div className="space-y-4 border-t border-border p-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <div id="knowledge-url-batch-parser-label" className="text-sm font-medium text-foreground">
                        解析方式
                      </div>
                      <div role="group" aria-labelledby="knowledge-url-batch-parser-label">
                        <ParserDropdown value={parserBackend} onChange={setParserBackend} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div id="knowledge-url-batch-chunk-label" className="text-sm font-medium text-foreground">
                        切片策略
                      </div>
                      <div role="group" aria-labelledby="knowledge-url-batch-chunk-label">
                        <ChunkStrategyDropdown value={chunkStrategy} onChange={setChunkStrategy} />
                      </div>
                    </div>
                  </div>
                  <PipelineOptionsPanel compact />
                </div>
              </details>
            </div>
          </div>
        </form>

        <div className="flex flex-col-reverse gap-2 border-t border-border bg-background p-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleDialogOpenChange(false)}
            disabled={submitting}
            className="w-full sm:w-auto"
          >
            取消
          </Button>
          <Button
            type="submit"
            form="knowledge-url-batch-form"
            disabled={submitting || datasetsLoading || !urlAnalysis.urls.length || hasBlockingError}
            className="w-full gap-2 sm:w-auto"
          >
            {submitting ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
            {submitting ? '正在创建任务' : '创建导入任务'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
