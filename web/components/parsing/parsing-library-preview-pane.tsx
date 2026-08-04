'use client'

import { Copy, FolderOpen, MoreVertical, Paperclip, Play, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { MarkdownRenderer } from '@/components/markdown/markdown-renderer'
import { getFileIcon } from '@/components/document-library/folder-tree'
import { ParserDropdown } from '@/components/business/parser-dropdown'
import { ParsingRightPanel } from '@/components/parsing/parsing-right-panel'
import { Button } from '@/components/ui/button'
import {
 DropdownMenu,
 DropdownMenuContent,
 DropdownMenuItem,
 DropdownMenuSeparator,
 DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { getParserLabel } from '@/lib/parser-options'
import { resolveParserBackendForFilename } from '@/lib/parser-compat'
import type { ParsedFileData } from '@/store/use-parsed-files-store'

type StatusBadge = {
 label: string
 cls: string
}

type ParsingLibraryPreviewPaneProps = {
 file: ParsedFileData
 activeMarkdown: string
 folderName: string
 folderPathLabel: string
 sourceStatus: 'unknown' | 'available' | 'missing'
 defaultParserBackend: string
 statusBadge?: StatusBadge | null
 onClose: () => void
 onUpdateParser: (backend: string) => void
 onReprocessKnowledgeFile: (backend: string) => void
 onRestoreSource: (autoParse: boolean) => void
 onRequestRebind: (autoParse: boolean) => void
}

export function ParsingLibraryPreviewPane({
 file,
 activeMarkdown,
 folderName,
 folderPathLabel,
 sourceStatus,
 defaultParserBackend,
 statusBadge,
 onClose,
 onUpdateParser,
 onReprocessKnowledgeFile,
 onRestoreSource,
 onRequestRebind,
}: Readonly<ParsingLibraryPreviewPaneProps>) {
 const t = useTranslations('ParsingWorkbench')
 const commonT = useTranslations('Common')
 const parserValue = resolveParserBackendForFilename(
 file.filename,
 file.parserBackend || defaultParserBackend
 ).backend
 const isKnowledgeBaseFile = file.source === 'knowledge_base'
 const canRunLibraryParse = Boolean(file.status && file.status !== 'parsed' && file.status !== 'parsing')
 const pendingParseAction = (() => {
 if (!canRunLibraryParse) return null
 if (isKnowledgeBaseFile) {
 return {
 label: t('libraryPreview.startParsing'),
 title: t('libraryPreview.startParsingTitle'),
 onClick: () => onReprocessKnowledgeFile(parserValue),
 }
 }
 if (sourceStatus === 'available') {
 return {
 label: t('libraryPreview.continueParsing'),
 title: t('libraryPreview.continueParsingTitle'),
 onClick: () => onRestoreSource(true),
 }
 }
 return {
 label: t('libraryPreview.uploadAndParse'),
 title: t('libraryPreview.uploadAndParseTitle'),
 onClick: () => onRequestRebind(true),
 }
 })()
 const sourceAction = sourceStatus === 'available'
 ? {
 label: t('libraryPreview.restoreSource'),
 title: t('libraryPreview.restoreSourceTitle'),
 onClick: () => onRestoreSource(false),
 }
 : {
 label: t('libraryPreview.reupload'),
 title: t('libraryPreview.reuploadTitle'),
 onClick: () => onRequestRebind(false),
 }

 return (
 <div className="flex flex-1 flex-col min-h-0">
 <div className="border-b border-border bg-background px-4 py-3">
 <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
 <div className="min-w-0">
 <div className="flex flex-wrap items-center gap-2">
 <span className="inline-flex max-w-[560px] min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
 {getFileIcon(file.filename, 'size-7 rounded-md')}
 <span className="min-w-0 truncate">{file.filename}</span>
 </span>
 <span
 className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
 title={folderPathLabel}
 >
 <FolderOpen className="h-3 w-3" />
 {folderName}
 </span>
 {statusBadge ? (
 <span
 className={cn('rounded-md border px-2 py-0.5 text-xs font-medium', statusBadge.cls)}
 title={file.status}
 >
 {statusBadge.label}
 </span>
 ) : null}
 </div>
 </div>

 <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
 {canRunLibraryParse ? (
 <ParserDropdown
 value={parserValue}
 filename={file.filename}
 onChange={onUpdateParser}
 className="w-[180px] sm:w-[196px]"
 compact
 />
 ) : (
 <span className="text-xs text-muted-foreground">
 {t('libraryPreview.parserLabel')}：<span className="font-medium text-foreground/80 dark:text-muted-foreground">{file.parser || getParserLabel(parserValue)}</span>
 </span>
 )}

 {pendingParseAction ? (
 <Button
 size="sm"
 className="h-8 gap-1.5 rounded-md bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90"
 onClick={pendingParseAction.onClick}
 title={pendingParseAction.title}
 >
 <Play className="h-3.5 w-3.5" />
 {pendingParseAction.label}
 </Button>
 ) : null}

 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <Button
 variant="outline"
 size="icon"
 className="h-8 w-8 rounded-md"
 aria-label={t('libraryPreview.moreActions')}
 title={t('libraryPreview.more')}
 >
 <MoreVertical className="h-4 w-4" />
 </Button>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end" className="w-44">
 <DropdownMenuItem
 className="cursor-pointer gap-2"
 onClick={sourceAction.onClick}
 title={sourceAction.title}
 >
 <Paperclip className="h-4 w-4 text-muted-foreground" />
 {sourceAction.label}
 </DropdownMenuItem>
 <DropdownMenuSeparator />
 <DropdownMenuItem
 className="cursor-pointer gap-2"
 onClick={async () => {
 try {
 await navigator.clipboard.writeText(file.filename)
 toast.success(t('libraryPreview.copiedFilename'))
 } catch {
 toast.error(t('libraryPreview.copyFailed'))
 }
 }}
 >
 <Copy className="h-4 w-4 text-muted-foreground" />
 {t('libraryPreview.copyFilename')}
 </DropdownMenuItem>
 <DropdownMenuSeparator />
 <DropdownMenuItem className="cursor-pointer gap-2" onClick={onClose}>
 <X className="h-4 w-4 text-muted-foreground" />
 {commonT('close')}
 </DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>
 </div>
 </div>
 </div>

 <div className="flex-1 overflow-hidden min-h-0">
 {activeMarkdown ? (
 <ParsingRightPanel className="h-full px-4 py-4 no-scrollbar md:px-6 md:py-5">
 <MarkdownRenderer markdown={activeMarkdown} />
 </ParsingRightPanel>
 ) : (
 <div className="flex h-full items-center justify-center">
 <div className="max-w-md text-center">
 <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-md border border-border bg-muted">
 <FolderOpen className="size-5 text-muted-foreground" />
 </div>
 <p className="text-sm font-medium text-muted-foreground dark:text-muted-foreground">{t('libraryPreview.emptyTitle')}</p>
 <p className="mt-1 text-xs text-muted-foreground dark:text-muted-foreground">{t('libraryPreview.emptyDescription')}</p>
 </div>
 </div>
 )}
 </div>
 </div>
 )
}
