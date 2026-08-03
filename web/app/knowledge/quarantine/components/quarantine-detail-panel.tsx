'use client'

import { Badge } from '@/components/ui/badge'
import { formatFileSize } from '@/lib/utils'
import type { Document } from '@/types'

import { buildReviewAdvice, getDropReasons, reasonLabel } from '../quarantine-signals'

interface QuarantineDetailPanelProps {
  selected: Document | null
}

export function QuarantineDetailPanel({ selected }: Readonly<QuarantineDetailPanelProps>) {
  if (!selected) return null

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold text-foreground">记录信息</h3>
        <dl className="mt-2 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border">
          {[
            { label: '文档编号', value: `${selected.id.slice(0, 12)}...` },
            { label: '数据集', value: selected.dataset_id || '未关联' },
            { label: '文件大小', value: formatFileSize(selected.file_size) },
            { label: '分块数量', value: String(selected.chunk_count ?? 0) },
          ].map((item) => (
            <div key={item.label} className="min-w-0 bg-card p-3">
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className="mt-1 break-words font-mono text-xs font-medium text-foreground">{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {selected.error_message ? (
        <section className="rounded-md border border-warning/20 bg-warning/5 p-4">
          <h3 className="text-sm font-semibold text-warning">隔离原因</h3>
          <p className="mt-2 break-words font-mono text-xs leading-5 text-warning/90">{selected.error_message}</p>
        </section>
      ) : null}

      <section>
        <h3 className="text-sm font-semibold text-foreground">处理建议</h3>
        <ul className="mt-2 divide-y divide-border">
          {buildReviewAdvice(selected).map((tip) => (
            <li key={tip} className="py-2 text-sm leading-6 text-foreground/80">{tip}</li>
          ))}
        </ul>
      </section>

      {getDropReasons(selected).length > 0 ? (
        <section>
          <h3 className="text-sm font-semibold text-foreground">命中规则</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {getDropReasons(selected).map((reason) => (
              <Badge key={reason} variant="secondary" className="rounded-md border border-warning/20 bg-warning/10 px-2 py-1 text-xs font-medium text-warning">
                {reasonLabel(reason)}
              </Badge>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
