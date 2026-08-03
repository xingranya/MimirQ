'use client'

export const PIE_COLORS = [
  'hsl(var(--chart-5))',
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-6))',
  'hsl(var(--chart-7))',
]
export const CHART_TOOLTIP_STYLE = {
  borderRadius: 6,
  border: '1px solid hsl(var(--border))',
  background: 'hsl(var(--card))',
  color: 'hsl(var(--foreground))',
  boxShadow: 'none',
  padding: '8px 10px',
}
export const CHART_TOOLTIP_LABEL_STYLE = {
  color: 'hsl(var(--foreground))',
  fontWeight: 600,
}
export const CHART_TOOLTIP_CURSOR = { fill: 'hsl(var(--muted-foreground) / 0.08)' }
export const DEFAULT_PIPELINE_VERSION_VALUE = '__mimirq_default_pipeline_version__'
export const REPORT_LABEL_CLASS = 'text-xs font-medium text-muted-foreground'
export const REPORT_VALUE_CLASS =
  'truncate text-sm font-semibold leading-5 text-foreground'
export const REPORT_SUBTEXT_CLASS = 'text-xs leading-4 text-muted-foreground'
export const REPORT_METRIC_VALUE_CLASS =
  'text-xl font-semibold leading-none tabular-nums text-foreground'
export const REPORT_PANEL_TITLE_CLASS =
  'text-sm font-semibold leading-5 text-foreground'
export const REPORT_TABLE_HEADER_CLASS =
  'text-xs font-medium text-muted-foreground'
export const REPORT_TABLE_ROW_CLASS = 'text-xs leading-5 text-foreground/85'
export const REPORT_PANEL_CLASS =
  'rounded-md border border-border bg-card p-3'
export const REPORT_SECONDARY_ACTION_CLASS =
  'h-9 gap-1.5 rounded-md border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted'
export const REPORT_PRIMARY_ACTION_CLASS =
  'h-9 gap-1.5 rounded-md bg-primary px-3.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90'
export const REPORT_FILTER_LABEL_CLASS = 'text-xs font-medium text-muted-foreground'
export const REPORT_SELECT_TRIGGER_CLASS =
  'h-9 w-full rounded-md border-border bg-card text-xs font-medium text-foreground'
export const REPORT_SELECT_ITEM_CLASS =
  'py-2 text-xs font-medium text-foreground/85'
export const REPORT_METRIC_LEDGER_CLASS =
  'grid overflow-hidden rounded-md border border-border bg-card md:grid-cols-3 2xl:grid-cols-6'
