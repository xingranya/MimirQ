/**
 * Workbench - 主工作台（包含 TopBar、Sidebar 和 Preview）
 */
'use client'

import { useState } from 'react'
import { BookOpen, FileUp, HelpCircle, Layers } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { TopBar } from './top-bar'
import { Sidebar } from './sidebar'
import { OriginalPreview } from './preview/original-preview'
import { ChunkList } from './preview/chunk-list'
import { useChunkPreview } from '@/components/chunk-preview/context'
import { ChunkingHelpDialog } from '@/components/chunk-preview/components/chunking-help-dialog'
import { Button } from '@/components/ui/button'
import { KnowledgeOpsHero } from '@/components/ui/knowledge-ops-hero'
import {
  PipelineRail,
  WorkbenchPane,
  WorkbenchPanelDialog,
  WorkbenchScaffold,
} from '@/components/workbench'
import { UPLOAD_ACCEPT } from '@/lib/upload-extensions'
import { cn } from '@/lib/utils'

function ChunkPreviewWorkbenchHeader() {
  const t = useTranslations('ChunkPreview')

  return (
    <header>
      <KnowledgeOpsHero
        iconImage="chunk-preview"
        eyebrow={null}
        badge={null}
        title={t('workbench.title')}
        description={t('workbench.description')}
      />
    </header>
  )
}

function ChunkPreviewEmptyCanvas() {
  const t = useTranslations('ChunkPreview')
  const {
    isDragging,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    addFiles,
    loadExample,
  } = useChunkPreview()
  const [helpOpen, setHelpOpen] = useState(false)

  return (
    <main
      data-chunk-preview-empty-canvas="true"
      className={cn(
        'flex h-full min-h-0 flex-1 overflow-y-auto bg-background transition-colors',
        isDragging && 'bg-primary/5'
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="mx-auto flex w-full max-w-3xl items-start px-4 py-6 sm:px-6 sm:py-8">
        <section
          data-chunk-empty-intake-panel
          className="w-full overflow-hidden rounded-md border border-border bg-background"
        >
          <div className="border-b border-border px-4 py-4 sm:px-5">
            <h2 className="text-lg font-semibold text-foreground">
              {t('emptyState.title')}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t('emptyState.description')}
            </p>
          </div>

          <div className="p-4 sm:p-5">
            <input
              id="chunk-empty-file-input"
              type="file"
              accept={UPLOAD_ACCEPT}
              multiple
              className="hidden"
              onChange={(event) => {
                const files = event.target.files
                  ? Array.from(event.target.files)
                  : []
                if (files.length > 0) addFiles(files)
                event.target.value = ''
              }}
            />
            <label
              htmlFor="chunk-empty-file-input"
              className={cn(
                'flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-5 py-8 text-center transition-colors focus-within:ring-2 focus-within:ring-ring/40',
                isDragging
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-muted/20 hover:border-primary/40 hover:bg-muted/30'
              )}
            >
              <span className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <FileUp className="size-5" />
              </span>
              <span className="mt-3 text-sm font-semibold text-foreground">
                {isDragging
                  ? t('emptyState.draggingTitle')
                  : t('emptyState.idleTitle')}
              </span>
              <span className="mt-1 text-xs leading-5 text-muted-foreground">
                {t('emptyState.uploadHint')}
              </span>
            </label>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" onClick={loadExample}>
                <BookOpen className="mr-2 size-4" />
                {t('emptyState.exampleTitle')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setHelpOpen(true)}
              >
                <HelpCircle className="mr-2 size-4" />
                {t('emptyState.help')}
              </Button>
            </div>
          </div>
        </section>
      </div>

      <ChunkingHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </main>
  )
}

export function Workbench() {
  const t = useTranslations('ChunkPreview')
  const {
    currentFile,
    currentFileItem,
    showOriginalPanel,
    showSettingsPanel,
    toggleSettingsPanel,
  } = useChunkPreview()
  const toolbar = currentFile && currentFileItem ? <TopBar /> : null

  return (
    <>
      <WorkbenchScaffold
        title={t('workbench.title')}
        description={t('workbench.description')}
        iconImage="chunk-preview"
        icon={Layers}
        iconColor="text-primary"
        header={<ChunkPreviewWorkbenchHeader />}
        size="full"
        pipelineRail={<PipelineRail />}
        toolbar={toolbar}
        leftPanel={
          <WorkbenchPane bodyClassName="p-0">
            <Sidebar variant="pane" />
          </WorkbenchPane>
        }
        mainPanel={
          <WorkbenchPane
            className="flex-1 min-w-0"
            bodyClassName="p-0 overflow-hidden"
          >
            {currentFile && currentFileItem ? (
              <main className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background lg:flex-row">
                {showOriginalPanel ? <OriginalPreview /> : null}
                <ChunkList />
              </main>
            ) : (
              <ChunkPreviewEmptyCanvas />
            )}
          </WorkbenchPane>
        }
      />

      {/* 移动端使用独立参数弹层，避免主工作区与侧栏互相挤压。 */}
      <WorkbenchPanelDialog
        open={showSettingsPanel}
        onOpenChange={(open) => {
          if (open !== showSettingsPanel) toggleSettingsPanel()
        }}
        title={t('workbench.settingsPanelTitle')}
      >
        <Sidebar variant="dialog" />
      </WorkbenchPanelDialog>
    </>
  )
}
