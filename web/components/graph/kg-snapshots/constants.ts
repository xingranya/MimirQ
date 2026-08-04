import type {
  DeltaDirection,
  SnapshotInlineStatTone,
  SnapshotStudioNode,
} from './types'

export const DIFF_KEYS = ['docs', 'events', 'entities', 'links', 'relations'] as const

export const INLINE_STAT_TONE_CLASSES: Record<SnapshotInlineStatTone, string> = {
  muted: 'border-border/70 bg-card text-muted-foreground',
  neutral: 'border-border/70 bg-card text-foreground',
  positive: 'border-success/30 bg-success/5 text-success',
  negative: 'border-destructive/30 bg-destructive/5 text-destructive',
  warning: 'border-warning/30 bg-warning/5 text-warning',
}

export const INLINE_STAT_VALUE_TONE_CLASSES: Record<SnapshotInlineStatTone, string> = {
  muted: 'text-muted-foreground',
  neutral: 'text-foreground',
  positive: 'text-success',
  negative: 'text-destructive',
  warning: 'text-warning',
}

export const SNAPSHOT_NODE_TONE_CLASSES: Record<SnapshotStudioNode['tone'], string> = {
  amber: 'bg-warning ring-warning/30',
  blue: 'bg-primary ring-primary/30',
  green: 'bg-success ring-success/30',
  orange: 'bg-warning ring-warning/30',
  purple: 'bg-accent ring-accent/30',
  rose: 'bg-destructive ring-destructive/30',
  teal: 'bg-success ring-success/30',
}

export const DELTA_TEXT_CLASSES: Record<DeltaDirection, string> = {
  flat: 'text-muted-foreground',
  negative: 'text-destructive',
  positive: 'text-success',
}

export const DELTA_TINT_CLASSES: Record<DeltaDirection, string> = {
  flat: 'bg-muted/40 ring-border',
  negative: 'bg-destructive/10 ring-destructive/30',
  positive: 'bg-success/10 ring-success/30',
}

export const DELTA_BADGE_VARIANTS: Record<DeltaDirection, 'soft' | 'outline' | 'destructive'> = {
  flat: 'outline',
  negative: 'destructive',
  positive: 'soft',
}

export const SNAPSHOT_HEADER_ACTION_CLASS =
  'h-9 rounded-md border-border bg-background px-3 text-xs font-medium text-foreground shadow-none hover:bg-muted'
export const SNAPSHOT_ICON_ACTION_CLASS =
  'h-9 w-9 rounded-md border-border bg-background text-muted-foreground shadow-none hover:bg-muted hover:text-foreground'
export const SNAPSHOT_PRIMARY_COMPARE_CLASS =
  'h-10 w-full gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground shadow-none hover:bg-primary/90'
export const SNAPSHOT_SECONDARY_ACTION_CLASS =
  'h-9 gap-1.5 rounded-md border-border bg-background px-2 text-xs font-medium text-foreground shadow-none hover:bg-muted'

export const DELTA_LABELS: Record<DeltaDirection, string> = {
  flat: '不变',
  negative: '减少',
  positive: '增加',
}
