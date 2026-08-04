'use client'

import { useEffect, useMemo, useState } from 'react'

import { AuthImage } from '@/components/auth-image'
import type { ParsingElement } from '@/lib/api/parsing'
import { cn } from '@/lib/utils'

type ParsingElementsPanelProps = {
 elements: ParsingElement[]
 onSelectElement?: (element: ParsingElement) => void
 className?: string
}

function kindLabel(kind: string): string {
 if (kind === 'seal') return '印章'
 if (kind === 'equation') return '公式'
 if (kind === 'table') return '表格'
 if (kind === 'image') return '图片'
 if (kind === 'heading') return '标题'
 if (kind === 'list') return '列表'
 return '正文'
}

function primitiveText(value: unknown, fallback = ''): string {
 if (typeof value === 'string') return value
 if (typeof value === 'number' || typeof value === 'boolean') return String(value)
 return fallback
}

function formatBbox(value: ParsingElement['bbox']): string {
 if (!value) return ''
 return `${value.x0},${value.y0},${value.x1},${value.y1}`
}

function formatPageLabel(element: ParsingElement): string {
 const pages = Array.isArray(element.pages)
 ? element.pages.filter((value) => Number.isInteger(value) && value > 0)
 : []
 if (pages.length >= 2) {
 if (pages.length === 2 && pages[1] === pages[0] + 1) {
 return `页 ${pages[0]}-${pages[1]}`
 }
 return `页 ${pages.join(',')}`
 }
 if (typeof element.page === 'number') {
 return `页 ${element.page}`
 }
 return ''
}

function formatCrossPageMergePages(attributes: ParsingElement['attributes']): string {
 const raw = (attributes as Record<string, unknown> | null)?.cross_page_merge_pages
 if (!Array.isArray(raw)) return ''
 const pages = raw
 .map((value) => (typeof value === 'number' ? value : Number(value)))
 .filter((value) => Number.isInteger(value) && value > 0)
 if (pages.length < 2) return ''
 if (pages.length === 2 && pages[1] === pages[0] + 1) {
 return `跨页 ${pages[0]}-${pages[1]}`
 }
 return `跨页 ${pages.join(',')}`
}

function formatPageSpan(element: ParsingElement): string {
 const pages = Array.isArray(element.pages)
 ? element.pages.filter((value) => Number.isInteger(value) && value > 0)
 : []
 if (pages.length >= 2) {
 if (pages.length === 2 && pages[1] === pages[0] + 1) {
 return `跨页 ${pages[0]}-${pages[1]}`
 }
 return `跨页 ${pages.join(',')}`
 }
 return formatCrossPageMergePages(element.attributes)
}

function getElementImageSrc(element: ParsingElement): string {
 if (element.kind !== 'image') return ''
 const attributes = element.attributes as Record<string, unknown> | null
 const raw = attributes?.src || attributes?.image_src || attributes?.url
 return typeof raw === 'string' ? raw.trim() : ''
}

export function ParsingElementsPanel({
 elements,
 onSelectElement,
 className,
}: Readonly<ParsingElementsPanelProps>) {
 const [isCollapsed, setIsCollapsed] = useState(true)
 const [filterKind, setFilterKind] = useState<string>('all')
 const [filterVisualKind, setFilterVisualKind] = useState<string>('all')
 const hasImageElements = useMemo(() => (elements || []).some((element) => element.kind === 'image'), [elements])
 useEffect(() => {
 if (!hasImageElements) return
 setIsCollapsed(false)
 setFilterKind((current) => (current === 'all' ? 'image' : current))
 }, [hasImageElements])
 const filterKinds = useMemo(() => {
 const kinds = new Set<string>(['all'])
 for (const element of elements || []) {
 const kind = String(element.kind || '').trim()
 if (kind) kinds.add(kind)
 }
 return Array.from(kinds)
 }, [elements])
 const filterVisualKinds = useMemo(() => {
 const visualKinds = new Set<string>(['all'])
 for (const element of elements || []) {
 const visualKind = primitiveText(element.visual_kind || (element.attributes as Record<string, unknown> | null)?.visual_kind).trim()
 if (visualKind) visualKinds.add(visualKind)
 }
 return Array.from(visualKinds)
 }, [elements])
 const visibleElements = useMemo(() => {
 return (elements || []).filter((element) => {
 if (filterKind !== 'all' && element.kind !== filterKind) return false
 if (filterVisualKind === 'all') return true
 const visualKind = primitiveText(element.visual_kind || (element.attributes as Record<string, unknown> | null)?.visual_kind).trim()
 return visualKind === filterVisualKind
 })
 }, [elements, filterKind, filterVisualKind])

 if (!elements.length) return null

 return (
 <div className={cn('border-b border-border bg-background px-4 py-3', className)}>
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div>
 <div className="flex flex-wrap items-center gap-2">
 <div className="text-sm font-semibold text-foreground">
 结构元素
 </div>
 <span className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-xs text-muted-foreground">
 {elements.length} 项
 </span>
 </div>
 {isCollapsed ? null : (
 <div className="mt-1 text-xs leading-5 text-muted-foreground">
 筛选并检查印章、公式、表格和图片等内容。
 </div>
 )}
 </div>
 <div className="flex flex-wrap items-center justify-end gap-1.5">
 {isCollapsed ? null : (
 filterKinds.map((kind) => (
 <button
 key={kind}
 type="button"
 onClick={() => {
 setFilterKind(kind)
 if (kind !== 'image') setFilterVisualKind('all')
 }}
 className={cn(
 'rounded-md border px-2.5 py-1 text-xs transition-colors',
 filterKind === kind
 ? 'border-primary/40 bg-primary/10 text-foreground'
 : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
 )}
 >
 {kind === 'all' ? '全部' : kindLabel(kind)}
 </button>
 ))
 )}
 <button
 type="button"
 onClick={() => setIsCollapsed((current) => !current)}
 className="rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
 >
 {isCollapsed ? '展开' : '收起'}
 </button>
 </div>
 </div>

 {!isCollapsed && (filterKind === 'all' || filterKind === 'image') && filterVisualKinds.length > 1 ? (
 <div className="mt-3 flex flex-wrap gap-1.5">
 {filterVisualKinds.map((visualKind) => (
 <button
 key={visualKind}
 type="button"
 onClick={() => setFilterVisualKind(visualKind)}
 className={cn(
 'rounded-md border px-2.5 py-1 text-xs transition-colors',
 filterVisualKind === visualKind
 ? 'border-primary/40 bg-primary/10 text-foreground'
 : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
 )}
 >
 {visualKind === 'all' ? '全部图片子类' : visualKind}
 </button>
 ))}
 </div>
 ) : null}

 {isCollapsed ? null : (
 <div className="mt-3 grid gap-2 md:grid-cols-2">
 {visibleElements.map((element) => {
 const attributes = (element.attributes as Record<string, unknown> | null) ?? null
 const pageLabel = formatPageLabel(element)
 const crossPageLabel = formatPageSpan(element)
 const visualKind = typeof element.visual_kind === 'string' && element.visual_kind
 ? element.visual_kind
 : typeof attributes?.visual_kind === 'string'
 ? attributes.visual_kind
 : ''
 const imageSrc = getElementImageSrc(element)

 return (
 <button
 key={String(element.id)}
 type="button"
 onClick={() => onSelectElement?.(element)}
 className="rounded-md border border-border bg-background px-3 py-2 text-left transition-colors hover:border-primary/35 hover:bg-primary/5"
 >
 {imageSrc ? (
 <div className="mb-2 overflow-hidden rounded-md border border-border bg-muted/20">
 <AuthImage
 src={imageSrc}
 alt={String(element.text || element.id || 'image')}
 width={360}
 height={240}
 unoptimized
 className="h-28 w-full object-contain p-1.5"
 />
 </div>
 ) : null}
 <div className="flex flex-wrap items-center gap-2">
 <span className="text-xs font-medium text-foreground">{kindLabel(String(element.kind || 'paragraph'))}</span>
 {pageLabel ? <span className="font-mono text-xs text-muted-foreground">{pageLabel}</span> : null}
 <span className="font-mono text-xs text-muted-foreground">编号 {element.id}</span>
	 {typeof attributes?.source_content_type === 'string' ? (
	 <span className="rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
	 来源 {attributes.source_content_type}
	 </span>
	 ) : null}
	 {visualKind ? (
	 <span className="rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
	 图片类型 {visualKind}
	 </span>
	 ) : null}
	 {typeof element.confidence === 'number' ? (
	 <span className="font-mono text-xs text-muted-foreground">置信度 {element.confidence.toFixed(2)}</span>
	 ) : null}
 {crossPageLabel ? (
 <span className="rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
 {crossPageLabel}
 </span>
 ) : null}
 </div>
 {element.text ? <div className="mt-1 truncate text-sm text-foreground/85">{element.text}</div> : null}
 {element.bbox ? (
 <div className="mt-1 font-mono text-xs text-muted-foreground">坐标 {formatBbox(element.bbox)}</div>
 ) : null}
 </button>
 )
 })}
	 </div>
	 )}
 </div>
 )
}
