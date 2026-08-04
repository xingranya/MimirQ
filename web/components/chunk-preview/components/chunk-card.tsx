/** 单个切块卡片。 */
'use client'

import { useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import {
  Braces,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Link2,
  Pencil,
  Pin,
  PinOff,
  Quote,
  RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { chunkIsReviewed, chunkNeedsReview, getChunkMetadata, getSemanticQualityMetadata, getStringValue } from '@/components/chunk-preview/utils/metadata'
import { cn, detachPromise } from '@/lib/utils'
import type { ChunkPreviewItem } from '@/types'
import { getChunkSectionLabel } from '@/components/chunk-preview/utils/sections'

interface ChunkCardProps {
  chunk: ChunkPreviewItem
  index: number
  unit?: 'chars' | 'tokens'
  sourceFilename?: string
  isHovered: boolean
  isSelected: boolean
  isShort?: boolean
  isDuplicate?: boolean
  isGap?: boolean
  gapBefore?: number
  isOverlap?: boolean
  overlapPrev?: number
  isEdited?: boolean
  isDisabled?: boolean
  isReviewed?: boolean
  query?: string
  onMouseEnter: () => void
  onMouseLeave: () => void
  onToggleSelect: () => void
  onEdit?: () => void
  onToggleDisabled?: () => void
  onToggleReviewed?: () => void
}

function highlightText(text: string, rawQuery?: string) {
  const query = (rawQuery || '').trim()
  if (!query) return text

  const qLower = query.toLowerCase()
  const lower = text.toLowerCase()

  const out: ReactNode[] = []
  let cursor = 0
  let matches = 0
  const MAX_MATCHES = 50

  while (cursor < text.length) {
    const idx = lower.indexOf(qLower, cursor)
    if (idx === -1) {
      out.push(text.slice(cursor))
      break
    }
    if (idx > cursor) out.push(text.slice(cursor, idx))
    const end = Math.min(text.length, idx + query.length)
    out.push(
      <mark
        key={`${idx}-${end}-${matches}`}
        className="rounded bg-primary/15 text-foreground px-0.5 py-[1px]"
      >
        {text.slice(idx, end)}
      </mark>
    )
    cursor = end
    matches += 1
    if (matches >= MAX_MATCHES) {
      out.push(text.slice(cursor))
      break
    }
  }

  return out
}

export function ChunkCard({
  chunk,
  index,
  unit = 'chars',
  sourceFilename,
  isHovered,
  isSelected,
  isShort,
  isDuplicate,
  isGap,
  gapBefore,
  isOverlap,
  overlapPrev,
  isEdited,
  isDisabled,
  isReviewed,
  query,
  onMouseEnter,
  onMouseLeave,
  onToggleSelect,
  onEdit,
  onToggleDisabled,
  onToggleReviewed,
}: Readonly<ChunkCardProps>) {
  const t = useTranslations('ChunkPreview')
  const rangeLabel = useMemo(() => `${chunk.start_index}-${chunk.end_index}`, [chunk.start_index, chunk.end_index])
  const tokens = useMemo(() => (typeof chunk.tokens_est === 'number' ? chunk.tokens_est : null), [chunk.tokens_est])
  const chunkMetadata = getChunkMetadata(chunk)
  const chunkRole = getStringValue(chunkMetadata, 'chunk_role')
  const sectionLabel = useMemo(() => getChunkSectionLabel(chunk), [chunk])
  const semanticQuality = getSemanticQualityMetadata(chunk)
  const reviewed = Boolean(isReviewed) || chunkIsReviewed(chunk)
  const needsReview = chunkNeedsReview(chunk)
  const needsReviewTitle = useMemo(() => {
    if (!needsReview) return undefined
    const reasons = semanticQuality?.reasons ?? []
    return reasons.length > 0
      ? `${t('chunkCard.needsReviewTitle')}：${reasons.join(', ')}`
      : t('chunkCard.needsReviewTitle')
  }, [needsReview, semanticQuality?.reasons, t])
  const chunkMetricLabel =
    unit === 'tokens' ? `${tokens ?? '-'} token` : `${chunk.length} 字`
  const chunkMetricTitle = [
    `${chunk.length} 字符`,
    tokens == null ? null : `${tokens} 个 token`,
    `位置 ${rangeLabel}`,
  ]
    .filter(Boolean)
    .join(' · ')
  const citationText = useMemo(() => {
    const name = (sourceFilename || '').trim() || t('chunkCard.documentFallback')
    const pageLabel = chunk.page_number == null ? '' : ` · P.${chunk.page_number}`
    const tokLabel = tokens == null ? '' : ` · ${tokens} tok`
    const fence = '````'
    const raw = String(chunk.content || '').trim()
    const excerpt = raw.length > 2000 ? `${raw.slice(0, 2000)}…` : raw
    return [
      `【${name} · 切块 #${index + 1}${pageLabel}${tokLabel} · ${rangeLabel}】`,
      `${fence}text`,
      excerpt,
      fence,
    ].join('\n')
  }, [chunk.content, chunk.page_number, index, rangeLabel, sourceFilename, t, tokens])

  const copyText = useCallback(async (text: string, okMsg: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        toast.success(okMsg)
        return
      }
    } catch {
      // 统一使用下方错误提示，避免浏览器异常打断操作。
    }
    toast.error(t('chunkCard.copyClipboardUnsupported'))
  }, [t])

  return (
    <article
      className={cn(
        'group rounded-md border bg-background p-3 transition-colors motion-reduce:transition-none',
        isSelected
          ? 'border-primary/45 bg-primary/5 ring-1 ring-primary/15'
          : isHovered
            ? 'border-primary/30 bg-muted/20'
            : 'border-border hover:border-primary/25 hover:bg-muted/20',
        isDisabled && !isSelected && !isHovered ? 'opacity-60' : ''
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      aria-label={t('chunkCard.ariaLabel', { index: index + 1 })}
    >
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span
            className={cn(
              'rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary',
              (isSelected || isHovered) && 'bg-primary/15'
            )}
          >
            #{index + 1}
          </span>
          {isDisabled ? (
            <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
              {t('chunkCard.badges.skipped')}
            </span>
          ) : null}

          {isEdited ? (
            <span className="rounded-md border border-info/25 bg-info/10 px-2 py-0.5 text-xs text-info">
              {t('chunkCard.badges.edited')}
            </span>
          ) : null}
          {isDuplicate ? (
            <span className="rounded-md border border-warning/25 bg-warning/10 px-2 py-0.5 text-xs text-warning">
              {t('chunkCard.badges.duplicate')}
            </span>
          ) : null}
          {isShort ? (
            <span className="rounded-md border border-warning/25 bg-warning/10 px-2 py-0.5 text-xs text-warning">
              {t('chunkCard.badges.short')}
            </span>
          ) : null}
          {isGap ? (
            <span
              className="rounded-md border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-xs text-destructive"
              title={typeof gapBefore === 'number' ? `gap_before: ${gapBefore}` : undefined}
            >
              {t('chunkCard.badges.gap')}
            </span>
          ) : null}
          {isOverlap ? (
            <span
              className="rounded-md border border-warning/25 bg-warning/10 px-2 py-0.5 text-xs text-warning"
              title={typeof overlapPrev === 'number' ? `overlap_prev: ${overlapPrev}` : undefined}
            >
              {t('chunkCard.badges.overlap')}
            </span>
          ) : null}
          {needsReview ? (
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-destructive/20 bg-destructive/10 text-destructive"
              title={needsReviewTitle}
              aria-label={needsReviewTitle}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
              <span className="sr-only">{t('chunkCard.needsReview')}</span>
            </span>
          ) : null}
          {reviewed ? (
            <span
              className="rounded-md border border-success/25 bg-success/10 px-2 py-0.5 text-xs text-success"
              title={t('chunkCard.reviewedTitle')}
            >
              {t('chunkCard.reviewed')}
            </span>
          ) : null}
          {(() => {
            if (chunkRole === 'parent') {
              return (<span className="rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 text-xs text-primary">
              {t('chunkCard.badges.parent')}
            </span>);
            }
            if (chunkRole === 'child') {
              return (<span className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
              {t('chunkCard.badges.child')}
            </span>);
            }
            return null;
          })()}
          {sectionLabel ? (
            <span
              className="max-w-[180px] truncate rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground"
              title={sectionLabel.full}
            >
              {sectionLabel.short}
            </span>
          ) : null}
          <span
            className="inline-flex h-6 items-center whitespace-nowrap rounded-md border border-border bg-muted/30 px-2 text-xs text-muted-foreground"
            title={chunkMetricTitle}
          >
            {chunkMetricLabel}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {chunk.page_number != null && (
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">P.{chunk.page_number}</span>
          )}
          <div className="flex flex-wrap items-center gap-1">
            {onToggleReviewed && (needsReview || reviewed) ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleReviewed()
                }}
                aria-label={reviewed ? t('chunkCard.restoreReview') : t('chunkCard.approveReview')}
                title={reviewed ? t('chunkCard.restoreReview') : t('chunkCard.approveReview')}
              >
                {reviewed ? <RotateCcw className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              </Button>
            ) : null}
            {onEdit ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation()
                onEdit()
              }}
                aria-label={t('chunkCard.edit')}
                title={t('chunkCard.edit')}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            ) : null}
            {onToggleDisabled ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleDisabled()
                }}
                aria-label={isDisabled ? t('chunkCard.enable') : t('chunkCard.skip')}
                title={isDisabled ? t('chunkCard.enable') : t('chunkCard.skip')}
              >
                {isDisabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation()
                detachPromise(copyText(citationText, t('chunkCard.copyCitationSuccess')))
              }}
              aria-label={t('chunkCard.copyCitation')}
              title={t('chunkCard.copyCitation')}
            >
              <Quote className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation()
                try {
                  const url = new URL(globalThis.window.location.href)
                  url.searchParams.set('chunk', String(index + 1))
                  detachPromise(copyText(url.toString(), t('chunkCard.copyLinkSuccess')))
                } catch {
                  toast.error(t('chunkCard.cannotGenerateLink'))
                }
              }}
              aria-label={t('chunkCard.copyLink')}
              title={t('chunkCard.copyLink')}
            >
              <Link2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation()
                detachPromise(copyText(chunk.content || '', t('chunkCard.copyContentSuccess')))
              }}
              aria-label={t('chunkCard.copyContent')}
              title={t('chunkCard.copyContent')}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation()
                detachPromise(copyText(JSON.stringify(chunk, null, 2), t('chunkCard.copyJsonSuccess')))
              }}
              aria-label={t('chunkCard.copyJson')}
              title={t('chunkCard.copyJson')}
            >
              <Braces className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation()
                onToggleSelect()
              }}
              aria-label={isSelected ? t('chunkCard.unpin') : t('chunkCard.pin')}
              title={isSelected ? t('chunkCard.unpin') : t('chunkCard.pin')}
            >
              {isSelected ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleSelect}
        aria-label={t('chunkCard.ariaLabel', { index: index + 1 })}
        aria-pressed={isSelected}
        className={cn(
          'block w-full whitespace-pre-wrap break-words rounded-md text-left font-sans text-sm leading-relaxed transition-colors focus-ring',
          isSelected
            ? 'max-h-72 overflow-y-auto border border-border bg-muted/20 p-3 text-foreground'
            : 'line-clamp-5 px-1 py-0.5',
          isSelected || isHovered ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {highlightText(chunk.content || '', query)}
      </button>
    </article>
  )
}
