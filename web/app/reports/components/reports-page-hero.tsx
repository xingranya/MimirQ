'use client'

import { Database, ShieldCheck } from 'lucide-react'

import type {
  DatasetReport,
  DatasetReportDataProvenance,
} from '@/types'

import {
  reportStatusLabel,
  reportStatusTone,
  shortPipelineHash,
} from '../report-format'
import { DataPill } from './report-atoms'

export function ReportsHeaderPills({
  selectedDatasetName,
  datasetId,
  isLoadingReport,
  report,
  dataSourceLabel,
  dataSourceSub,
  dataProvenance,
}: Readonly<{
  selectedDatasetName: string
  datasetId: string
  isLoadingReport: boolean
  report: DatasetReport | null
  dataSourceLabel: string
  dataSourceSub: string
  dataProvenance: DatasetReportDataProvenance | null
}>) {
  return (
    <div className="grid min-w-0 gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-3">
      <DataPill
        icon={Database}
        label="数据集"
        value={selectedDatasetName}
        sub={datasetId ? `标识 ${shortPipelineHash(datasetId)}` : '未选择'}
        tone="blue"
      />
      <DataPill
        icon={ShieldCheck}
        label="状态"
        value={reportStatusLabel(isLoadingReport, report)}
        sub={report ? '可导出、可审计' : '等待生成报告'}
        tone={reportStatusTone(isLoadingReport, report)}
      />
      <DataPill
        icon={ShieldCheck}
        label="来源"
        value={dataSourceLabel}
        sub={dataSourceSub}
        tone={dataProvenance?.mocked === false ? 'green' : 'amber'}
      />
    </div>
  )
}

export function ReportsPageHero({
  selectedDatasetName,
  datasetId,
  isLoadingReport,
  report,
  dataSourceLabel,
  dataSourceSub,
  dataProvenance,
}: Readonly<{
  selectedDatasetName: string
  datasetId: string
  isLoadingReport: boolean
  report: DatasetReport | null
  dataSourceLabel: string
  dataSourceSub: string
  dataProvenance: DatasetReportDataProvenance | null
}>) {
  return (
    <header data-reports-header="true" className="border-b border-border pb-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">数据报告</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
          查看数据集处理质量、检索审计和风险明细，并按需要导出。
        </p>
      </div>
      <div className="mt-4">
        <ReportsHeaderPills
          selectedDatasetName={selectedDatasetName}
          datasetId={datasetId}
          isLoadingReport={isLoadingReport}
          report={report}
          dataSourceLabel={dataSourceLabel}
          dataSourceSub={dataSourceSub}
          dataProvenance={dataProvenance}
        />
      </div>
    </header>
  )
}
