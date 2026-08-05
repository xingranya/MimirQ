'use client'

import type { ConnectorRunOut, Dataset, Document } from '@/types'
import type { ChangeEvent } from 'react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { KnowledgeImportMenu } from '@/components/knowledge/import/knowledge-import-menu'
import { resolveKnowledgeImportAvailability } from '@/components/knowledge/import/knowledge-import-availability'
import { KnowledgeJiraProjectDialog } from '@/components/knowledge/import/knowledge-jira-project-dialog'
import { KnowledgePipelineConfigDialog } from '@/components/knowledge/import/knowledge-pipeline-config-dialog'
import { KnowledgeUrlBatchDialog } from '@/components/knowledge/import/knowledge-url-batch-dialog'
import { KnowledgeUrlImportDialog } from '@/components/knowledge/import/knowledge-url-import-dialog'
import { KnowledgeWebCrawlDialog } from '@/components/knowledge/import/knowledge-web-crawl-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { UPLOAD_ACCEPT } from '@/lib/upload-extensions'
import { useAuth } from '@/hooks/use-auth'
import { useTenantAccess } from '@/hooks/use-tenant-access'
import { connectorApi } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { cn, detachPromise } from '@/lib/utils'

type KnowledgeWorkbenchActionsProps = {
  datasets: Dataset[]
  datasetsLoading: boolean
  datasetsError: unknown
  refreshDatasets: () => void | Promise<void>
  selectedDatasetId?: string
  datasetDefaultValue: string
  handleFileUpload: (event: ChangeEvent<HTMLInputElement>) => void
  uploadDocumentFromUrl: (params: { url: string; filename?: string; dataset_id?: string }) => Promise<Document>
  loadDocuments: (params?: { dataset_id?: string }) => void | Promise<void>
  loadConnectorRuns: (params?: { datasetId?: string }) => void | Promise<void>
  onConnectorRunCreated?: (run: ConnectorRunOut) => void
  onDatasetResolved?: (datasetId: string) => void
  className?: string
}

export function KnowledgeWorkbenchActions({
  datasets,
  datasetsLoading,
  datasetsError,
  refreshDatasets,
  selectedDatasetId,
  datasetDefaultValue,
  handleFileUpload,
  uploadDocumentFromUrl,
  loadDocuments,
  loadConnectorRuns,
  onConnectorRunCreated,
  onDatasetResolved,
  className,
}: Readonly<KnowledgeWorkbenchActionsProps>) {
  const t = useTranslations('KnowledgeWorkbenchActions')
  const { isDevMode } = useAuth()
  const tenantAccessQuery = useTenantAccess()
  const connectorCatalogQuery = useQuery({
    queryKey: queryKeys.connectors.catalog,
    queryFn: () => connectorApi.listConnectors(),
    staleTime: 60_000,
    retry: 1,
  })
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [pipelineConfigOpen, setPipelineConfigOpen] = useState(false)
  const [urlImportOpen, setUrlImportOpen] = useState(false)
  const [urlBatchOpen, setUrlBatchOpen] = useState(false)
  const [webCrawlOpen, setWebCrawlOpen] = useState(false)
  const [jiraProjectOpen, setJiraProjectOpen] = useState(false)

  const importAvailability = useMemo(
    () =>
      resolveKnowledgeImportAvailability({
        isDevMode,
        tenantAccess: tenantAccessQuery.data,
        tenantAccessLoading: tenantAccessQuery.isLoading,
        tenantAccessError: tenantAccessQuery.isError,
        datasetsLoading,
        datasetsError: Boolean(datasetsError),
        connectors: connectorCatalogQuery.data,
        connectorsLoading: connectorCatalogQuery.isLoading,
        connectorsError: connectorCatalogQuery.isError,
      }),
    [
      connectorCatalogQuery.data,
      connectorCatalogQuery.isError,
      connectorCatalogQuery.isLoading,
      datasetsError,
      datasetsLoading,
      isDevMode,
      tenantAccessQuery.data,
      tenantAccessQuery.isError,
      tenantAccessQuery.isLoading,
    ]
  )

  const handleOpenFilePicker = useCallback(() => {
    if (importAvailability.filesDisabledReason) return
    fileInputRef.current?.click()
  }, [importAvailability.filesDisabledReason])

  const handleRetryAvailability = useCallback(() => {
    if (datasetsError) detachPromise(refreshDatasets())
    if (!isDevMode && tenantAccessQuery.isError) detachPromise(tenantAccessQuery.refetch())
    if (connectorCatalogQuery.isError) detachPromise(connectorCatalogQuery.refetch())
  }, [
    connectorCatalogQuery,
    datasetsError,
    isDevMode,
    refreshDatasets,
    tenantAccessQuery,
  ])

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={UPLOAD_ACCEPT}
        className="hidden"
        disabled={Boolean(importAvailability.filesDisabledReason)}
        onChange={handleFileUpload}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            className={cn(
              'gap-2 bg-primary text-primary-foreground shadow-none hover:bg-primary/90',
              className,
            )}
          >
            <Plus className="size-4" aria-hidden="true" />
            <span>{t('importOrCreate')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 p-1.5">
          <KnowledgeImportMenu
            onUploadFiles={handleOpenFilePicker}
            onOpenUrlImport={() => setUrlImportOpen(true)}
            onOpenUrlBatch={() => setUrlBatchOpen(true)}
            onOpenWebCrawl={() => setWebCrawlOpen(true)}
            onOpenJiraProject={() => setJiraProjectOpen(true)}
            onOpenPipelineConfig={() => setPipelineConfigOpen(true)}
            filesDisabledReason={importAvailability.filesDisabledReason}
            urlDisabledReason={importAvailability.urlDisabledReason}
            onRetryAvailability={importAvailability.canRetry ? handleRetryAvailability : undefined}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <KnowledgePipelineConfigDialog open={pipelineConfigOpen} onOpenChange={setPipelineConfigOpen} />

      <KnowledgeUrlImportDialog
        open={urlImportOpen}
        onOpenChange={setUrlImportOpen}
        datasets={datasets}
        datasetsLoading={datasetsLoading}
        selectedDatasetId={selectedDatasetId}
        datasetDefaultValue={datasetDefaultValue}
        uploadDocumentFromUrl={uploadDocumentFromUrl}
        loadDocuments={loadDocuments}
        onDatasetResolved={onDatasetResolved}
      />

      <KnowledgeUrlBatchDialog
        open={urlBatchOpen}
        onOpenChange={setUrlBatchOpen}
        datasets={datasets}
        datasetsLoading={datasetsLoading}
        selectedDatasetId={selectedDatasetId}
        datasetDefaultValue={datasetDefaultValue}
        loadDocuments={loadDocuments}
        loadConnectorRuns={loadConnectorRuns}
        onRunCreated={onConnectorRunCreated}
        onDatasetResolved={onDatasetResolved}
      />

      <KnowledgeWebCrawlDialog
        open={webCrawlOpen}
        onOpenChange={setWebCrawlOpen}
        datasets={datasets}
        datasetsLoading={datasetsLoading}
        selectedDatasetId={selectedDatasetId}
        datasetDefaultValue={datasetDefaultValue}
        loadDocuments={loadDocuments}
        loadConnectorRuns={loadConnectorRuns}
        onRunCreated={onConnectorRunCreated}
      />

      <KnowledgeJiraProjectDialog
        open={jiraProjectOpen}
        onOpenChange={setJiraProjectOpen}
        datasets={datasets}
        datasetsLoading={datasetsLoading}
        selectedDatasetId={selectedDatasetId}
        datasetDefaultValue={datasetDefaultValue}
        loadDocuments={loadDocuments}
        loadConnectorRuns={loadConnectorRuns}
        onRunCreated={onConnectorRunCreated}
      />
    </>
  )
}
