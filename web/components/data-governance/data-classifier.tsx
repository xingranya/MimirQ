'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  Check,
  FileText,
  Folder,
  FolderTree,
  Loader2,
  Plus,
  Sparkles,
  Tag,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/input'
import { pipelineApi } from '@/lib/api'
import { reportClientWarning } from '@/lib/client-logging'
import {
  dedupeGovernanceTags,
  getGovernanceDocumentTagValue,
  selectGovernanceCategoryTag,
} from '@/lib/governance-classification'
import { cn } from '@/lib/utils'

interface DataClassifierProps {
  content: string
  initialCategory?: string | null
  initialTags?: string[]
  onClassify: (category: string, tags: string[]) => void
}

type CategoryId = 'technical' | 'product' | 'business' | 'legal' | 'hr' | 'finance' | 'other'

const PRESET_CATEGORY_CONFIGS: Array<{
  id: CategoryId
  icon: typeof FileText
  tone: 'info' | 'success' | 'primary' | 'destructive' | 'warning' | 'neutral'
}> = [
  { id: 'technical', icon: FileText, tone: 'info' },
  { id: 'product', icon: FileText, tone: 'success' },
  { id: 'business', icon: Folder, tone: 'primary' },
  { id: 'legal', icon: Folder, tone: 'destructive' },
  { id: 'hr', icon: Folder, tone: 'warning' },
  { id: 'finance', icon: Folder, tone: 'warning' },
  { id: 'other', icon: Folder, tone: 'neutral' },
]

type CategoryTone = (typeof PRESET_CATEGORY_CONFIGS)[number]['tone']

const CATEGORY_TONE_STYLES: Record<
  CategoryTone,
  { selected: string; iconWrap: string; icon: string; text: string }
> = {
  info: {
    selected: 'bg-info/10 border-info/30',
    iconWrap: 'bg-info/10',
    icon: 'text-info',
    text: 'text-info',
  },
  success: {
    selected: 'bg-success/10 border-success/30',
    iconWrap: 'bg-success/10',
    icon: 'text-success',
    text: 'text-success',
  },
  warning: {
    selected: 'bg-warning/10 border-warning/30',
    iconWrap: 'bg-warning/10',
    icon: 'text-warning',
    text: 'text-warning',
  },
  destructive: {
    selected: 'bg-destructive/10 border-destructive/30',
    iconWrap: 'bg-destructive/10',
    icon: 'text-destructive',
    text: 'text-destructive',
  },
  primary: {
    selected: 'bg-primary/10 border-primary/30',
    iconWrap: 'bg-primary/10',
    icon: 'text-primary',
    text: 'text-primary',
  },
  neutral: {
    selected: 'bg-muted border-border',
    iconWrap: 'bg-muted',
    icon: 'text-muted-foreground',
    text: 'text-foreground',
  },
}

function getCategoryToneStyles(tone: CategoryTone) {
  return CATEGORY_TONE_STYLES[tone]
}

function getSuggestionChipClassName(isAdded: boolean, isRecommended: boolean) {
  if (isAdded) {
    return 'cursor-default border-primary/20 bg-primary/15 text-primary'
  }

  if (isRecommended) {
    return 'border-info/20 bg-info/10 text-info hover:bg-info/15'
  }

  return 'border-border bg-muted text-muted-foreground hover:bg-accent/40 hover:text-foreground'
}

export function DataClassifier({
  content,
  initialCategory = null,
  initialTags = [],
  onClassify,
}: Readonly<DataClassifierProps>) {
  const t = useTranslations('DataClassifier')
  const categories = useMemo(
    () =>
      PRESET_CATEGORY_CONFIGS.map(({ id, icon, tone }) => ({
        id,
        icon,
        tone,
        label: t(`categories.${id}.label`),
      })),
    [t]
  )
  const suggestedTagLabels = t.raw('suggestedTags') as string[]
  const [selectedCategory, setSelectedCategory] = useState<string | null>(initialCategory)
  const [tags, setTags] = useState<string[]>(initialTags)
  const [newTag, setNewTag] = useState('')
  const [isAutoClassifying, setIsAutoClassifying] = useState(false)
  const [suggestedTags, setSuggestedTags] = useState<string[]>([])
  const [showAllTags, setShowAllTags] = useState(false)

  const handleAutoClassify = useCallback(async () => {
    const source = String(content || '').trim()
    if (!source) {
      toast.warning(t('auto.empty'))
      return
    }

    setIsAutoClassifying(true)
    try {
      const response = await pipelineApi.autoAnnotations({
        text: source,
        mode: 'document_focus',
        providers: ['cpu'],
        enable_keywords: true,
        enable_entities: true,
        enable_sensitive: false,
        keyword_provider: 'simple',
        keyword_top_k: 12,
        max_annotations: 60,
      })
      const documentTags = response.document_tags || []
      const categoryTag = selectGovernanceCategoryTag(documentTags)
      const nextCategory = categoryTag
        ? getGovernanceDocumentTagValue(categoryTag)
        : t('categories.other.label')
      const backendSuggestedTags = dedupeGovernanceTags(
        documentTags.map(getGovernanceDocumentTagValue)
      ).slice(0, 12)
      const nextTags = dedupeGovernanceTags([...tags, ...backendSuggestedTags])

      setSelectedCategory(nextCategory)
      setSuggestedTags(backendSuggestedTags)
      setTags(nextTags)
      onClassify(nextCategory, nextTags)

      if (backendSuggestedTags.length > 0) {
        toast.success(t('auto.success', { count: backendSuggestedTags.length }))
      } else {
        toast.info(t('auto.noTags'))
      }
    } catch (error) {
      reportClientWarning('Backend auto classification failed', error)
      toast.error(t('auto.failed'))
    } finally {
      setIsAutoClassifying(false)
    }
  }, [content, onClassify, t, tags])

  const handleAddTag = useCallback(
    (tag: string) => {
      const normalizedTag = String(tag || '').trim()
      if (normalizedTag && !tags.includes(normalizedTag)) {
        const updated = [...tags, normalizedTag]
        setTags(updated)
        onClassify(selectedCategory || '', updated)
      }

      setNewTag('')
    },
    [onClassify, selectedCategory, tags]
  )

  const handleRemoveTag = useCallback(
    (tag: string) => {
      const updated = tags.filter((item) => item !== tag)
      setTags(updated)
      onClassify(selectedCategory || '', updated)
    },
    [onClassify, selectedCategory, tags]
  )

  const handleSelectCategory = useCallback(
    (categoryId: CategoryId) => {
      const category = categories.find((item) => item.id === categoryId)
      if (!category) return
      setSelectedCategory(category.label)
      onClassify(category.label, tags)
    },
    [categories, onClassify, tags]
  )

  const displayTags = showAllTags ? suggestedTagLabels : suggestedTagLabels.slice(0, 8)
  const normalizedNewTag = newTag.trim()

  return (
    <div className="space-y-5 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <FolderTree className="size-5 text-primary" />
          <h3 className="text-base font-semibold text-foreground">{t('header.title')}</h3>
        </div>
        <Button
          onClick={handleAutoClassify}
          disabled={isAutoClassifying || !content.trim()}
          size="sm"
          className="gap-2 rounded-md"
        >
          {isAutoClassifying ? (
            <>
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              {t('actions.analyzing')}
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              {t('actions.autoClassify')}
            </>
          )}
        </Button>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">{t('sections.category')}</div>
        <div className="grid grid-cols-2 gap-2">
          {categories.map((category) => {
            const Icon = category.icon
            const isSelected = selectedCategory === category.label
            const tone = getCategoryToneStyles(category.tone)

            return (
              <button
                key={category.id}
                type="button"
                onClick={() => handleSelectCategory(category.id)}
                aria-pressed={isSelected}
                className={cn(
                  'focus-ring flex items-center gap-2 rounded-md border p-3 text-left transition-colors duration-200 motion-reduce:transition-none',
                  isSelected
                    ? tone.selected
                    : 'border-border bg-background hover:bg-muted/60'
                )}
              >
                <div className={cn('flex h-8 w-8 items-center justify-center rounded-md', tone.iconWrap)}>
                  <Icon className={cn('size-4', tone.icon)} />
                </div>
                <span className={cn('text-sm font-medium', isSelected ? tone.text : 'text-foreground/80')}>
                  {category.label}
                </span>
                {isSelected && <Check className={cn('ml-auto size-4', tone.icon)} />}
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-xs font-medium text-muted-foreground">{t('sections.tags')}</div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 py-1 pl-2.5 pr-1 text-sm text-foreground"
              >
                <Tag className="size-3" />
                {tag}
                <IconButton
                  onClick={() => handleRemoveTag(tag)}
                  label={t('a11y.removeTagWithValue', { tag })}
                  variant="ghost"
                  className="ml-1 size-6 rounded-md text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3" aria-hidden="true" />
                </IconButton>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            type="text"
            aria-label={t('tags.inputPlaceholder')}
            placeholder={t('tags.inputPlaceholder')}
            value={newTag}
            onChange={(event) => setNewTag(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                handleAddTag(newTag)
              }
            }}
            className="flex-1"
          />
          <Button
            onClick={() => handleAddTag(normalizedNewTag)}
            disabled={!normalizedNewTag || tags.includes(normalizedNewTag)}
            size="icon"
            className="rounded-md"
            aria-label={
              normalizedNewTag
                ? t('a11y.addTagWithValue', { tag: normalizedNewTag })
                : t('a11y.addTag')
            }
            title={
              normalizedNewTag
                ? t('a11y.addTagWithValue', { tag: normalizedNewTag })
                : t('a11y.addTag')
            }
          >
            <Plus className="size-4" aria-hidden="true" />
          </Button>
        </div>

        {(suggestedTags.length > 0 || suggestedTagLabels.length > 0) && (
          <div className="space-y-2">
            {suggestedTags.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-info">
                <Sparkles className="h-3.5 w-3.5" />
                <span>{t('tags.aiSuggested')}</span>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              {(suggestedTags.length > 0 ? suggestedTags : displayTags).map((tag) => {
                const isAdded = tags.includes(tag)
                const isRecommended = suggestedTags.includes(tag)

                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => !isAdded && handleAddTag(tag)}
                    disabled={isAdded}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors duration-200 motion-reduce:transition-none',
                      getSuggestionChipClassName(isAdded, isRecommended)
                    )}
                  >
                    {isRecommended && !isAdded && <Sparkles className="size-3" />}
                    {tag}
                  </button>
                )
              })}
            </div>

            {suggestedTagLabels.length > 8 && suggestedTags.length === 0 && (
              <button
                type="button"
                aria-expanded={showAllTags}
                onClick={() => setShowAllTags((visible) => !visible)}
                className="text-xs font-medium text-primary hover:text-primary/80"
              >
                {showAllTags ? t('tags.showLess') : t('tags.showMore')}
              </button>
            )}
          </div>
        )}
      </div>

      {(selectedCategory || tags.length > 0) && (
        <div className="border-y border-border py-4">
          <div className="mb-3 flex items-center gap-2">
            <Check className="size-4 text-success" />
            <span className="text-sm font-medium text-foreground">{t('summary.title')}</span>
          </div>
          <dl className="space-y-2 text-sm text-foreground">
            {selectedCategory && (
              <div className="flex items-center gap-2">
                <dt className="text-muted-foreground">{t('summary.category')}</dt>
                <dd className="font-medium">{selectedCategory}</dd>
              </div>
            )}
            {tags.length > 0 && (
              <div className="flex items-start gap-2">
                <dt className="shrink-0 text-muted-foreground">{t('summary.tags')}</dt>
                <dd className="break-words font-medium">{tags.join('、')}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  )
}
