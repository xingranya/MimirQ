'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

import type {
  DatasetReport,
  DatasetReportPipelineVersion,
} from '@/types'

import {
  reportPreviewEmptyDescription,
  reportPreviewEmptyTitle,
} from '../report-format'
import { ReportsDashboard } from './reports-dashboard'

import type {
  CategoryMetricDatum,
  CoverageRow,
  IssueRow,
  PipelineVersionDatum,
  ReportMetricDatum,
  RetrievalAudit,
} from '../types'

export function ReportsResultSection({
  report,
  datasetId,
  datasetsCount,
  datasetsLoaded,
  isLoadingDatasets,
  isLoadingReport,
  datasetsErrorMessage,
  categoriesErrorMessage,
  reportErrorMessage,
  totalDocs,
  totalBytes,
  successDocs,
  successRate,
  failed,
  failedRate,
  pipelineVersions,
  pipelineVersionsWithFill,
  pipelineFilterLabel,
  latestAuditTime,
  retrievalAudit,
  missingFindingCount,
  duplicateFindingCount,
  lowQualityFindingCount,
  fieldCoverageRows,
  fieldCoverageBadge,
  topDocumentRows,
  topDocumentMax,
  onClearFolderQuery,
  governanceAuditUrlValue,
  governanceAuditUrlSub,
  governanceAuditImageValue,
  governanceAuditImageSub,
  governanceAuditHasSamples,
  sensitiveHits,
  piiHits,
  secretHits,
  categoryBarData,
  versionTotal,
  issueRows,
  onRetryDatasets,
  onRetryCategories,
  onRetryReport,
}: Readonly<{
  report: DatasetReport | null
  datasetId: string
  datasetsCount: number
  datasetsLoaded: boolean
  isLoadingDatasets: boolean
  isLoadingReport: boolean
  datasetsErrorMessage: string
  categoriesErrorMessage: string
  reportErrorMessage: string
  totalDocs: number
  totalBytes: number
  successDocs: number
  successRate: string
  failed: number
  failedRate: string
  pipelineVersions: DatasetReportPipelineVersion[]
  pipelineVersionsWithFill: PipelineVersionDatum[]
  pipelineFilterLabel: string
  latestAuditTime: string
  retrievalAudit: RetrievalAudit | null
  missingFindingCount: number
  duplicateFindingCount: number
  lowQualityFindingCount: number
  fieldCoverageRows: CoverageRow[]
  fieldCoverageBadge: string
  topDocumentRows: ReportMetricDatum[]
  topDocumentMax: number
  onClearFolderQuery: () => void
  governanceAuditUrlValue: string
  governanceAuditUrlSub: string
  governanceAuditImageValue: string
  governanceAuditImageSub: string
  governanceAuditHasSamples: boolean
  sensitiveHits: number
  piiHits: number
  secretHits: number
  categoryBarData: CategoryMetricDatum[]
  versionTotal: number
  issueRows: IssueRow[]
  onRetryDatasets: () => void
  onRetryCategories: () => void
  onRetryReport: () => void
}>) {
  if (
    datasetsErrorMessage &&
    datasetsCount === 0 &&
    !isLoadingDatasets
  ) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="数据集加载失败"
        description={datasetsErrorMessage}
        className="rounded-md border-border bg-card"
      >
        <Button
          type="button"
          size="sm"
          className="rounded-md"
          onClick={onRetryDatasets}
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
          重试数据集
        </Button>
      </EmptyState>
    )
  }

  if (datasetsLoaded && datasetsCount === 0) {
    return (
      <EmptyState
        title="暂无可用数据集"
        description="当前账号还没有可用于生成报告的数据集。创建或获得数据集访问权限后，可在这里查看报告。"
        className="rounded-md border-border bg-card"
      />
    )
  }

  const queryAlerts = (
    <>
      {datasetsErrorMessage ? (
        <ReportsQueryAlert
          title="数据集刷新失败"
          description={`${datasetsErrorMessage} 当前仍显示已加载的数据集。`}
          retryLabel="重试数据集"
          onRetry={onRetryDatasets}
        />
      ) : null}
      {categoriesErrorMessage ? (
        <ReportsQueryAlert
          title="分类加载失败"
          description={`${categoriesErrorMessage} 分类分布暂时不可用，其余报告内容不受影响。`}
          retryLabel="重试分类"
          onRetry={onRetryCategories}
        />
      ) : null}
    </>
  )

  if (!report) {
    if (reportErrorMessage && datasetId && !isLoadingReport) {
      return (
        <div className="space-y-3">
          {queryAlerts}
          <EmptyState
            icon={AlertTriangle}
            title="报告加载失败"
            description={reportErrorMessage}
            className="rounded-md border-border bg-card"
          >
            <Button
              type="button"
              size="sm"
              className="rounded-md"
              onClick={onRetryReport}
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              重试报告
            </Button>
          </EmptyState>
        </div>
      )
    }
    return (
      <div className="space-y-3">
        {queryAlerts}
        <EmptyState
          title={reportPreviewEmptyTitle(datasetId, isLoadingReport)}
          description={reportPreviewEmptyDescription(datasetId, isLoadingReport)}
          className="rounded-md border-border bg-card"
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {queryAlerts}
      {reportErrorMessage && !isLoadingReport ? (
        <ReportsQueryAlert
          title="报告刷新失败"
          description={`${reportErrorMessage} 当前仍显示上次生成的报告。`}
          retryLabel="重试报告"
          onRetry={onRetryReport}
        />
      ) : null}
      <ReportsDashboard
        totalDocs={totalDocs}
        totalBytes={totalBytes}
        successDocs={successDocs}
        successRate={successRate}
        failed={failed}
        failedRate={failedRate}
        pipelineVersions={pipelineVersions}
        pipelineVersionsWithFill={pipelineVersionsWithFill}
        pipelineFilterLabel={pipelineFilterLabel}
        latestAuditTime={latestAuditTime}
        retrievalAudit={retrievalAudit}
        missingFindingCount={missingFindingCount}
        duplicateFindingCount={duplicateFindingCount}
        lowQualityFindingCount={lowQualityFindingCount}
        fieldCoverageRows={fieldCoverageRows}
        fieldCoverageBadge={fieldCoverageBadge}
        topDocumentRows={topDocumentRows}
        topDocumentMax={topDocumentMax}
        onClearFolderQuery={onClearFolderQuery}
        governanceAuditUrlValue={governanceAuditUrlValue}
        governanceAuditUrlSub={governanceAuditUrlSub}
        governanceAuditImageValue={governanceAuditImageValue}
        governanceAuditImageSub={governanceAuditImageSub}
        governanceAuditHasSamples={governanceAuditHasSamples}
        sensitiveHits={sensitiveHits}
        piiHits={piiHits}
        secretHits={secretHits}
        categoryBarData={categoryBarData}
        versionTotal={versionTotal}
        issueRows={issueRows}
      />
    </div>
  )
}

function ReportsQueryAlert({
  title,
  description,
  retryLabel,
  onRetry,
}: Readonly<{
  title: string
  description: string
  retryLabel: string
  onRetry: () => void
}>) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-md border border-destructive/25 bg-destructive/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-2">
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-destructive"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-destructive">{title}</p>
          <p className="mt-0.5 text-sm leading-5 text-destructive/85">
            {description}
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 shrink-0 rounded-md border-destructive/25 bg-background text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={onRetry}
      >
        <RefreshCw className="size-3.5" aria-hidden="true" />
        {retryLabel}
      </Button>
    </div>
  )
}
