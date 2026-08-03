'use client'

import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Database,
  FileSearch,
  MoreHorizontal,
  Network,
  Settings2,
  ShieldCheck,
  Table2,
  Workflow,
} from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PageScaffold } from '@/components/ui/page-scaffold'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Link, useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

export type DatasetDetailSection =
  | 'health'
  | 'ingestion'
  | 'precheck'
  | 'profile'
  | 'tables'
  | 'workflow'
  | 'db-catalog'
  | 'evidence'
  | 'kg'

type DatasetSectionDefinition = {
  icon: LucideIcon
  label: string
  value: DatasetDetailSection
}

const PRIMARY_SECTIONS: DatasetSectionDefinition[] = [
  { value: 'health', label: '运行状态', icon: Activity },
  { value: 'ingestion', label: '入库策略', icon: Settings2 },
  { value: 'precheck', label: '预检扫描', icon: FileSearch },
  { value: 'profile', label: '数据画像', icon: BarChart3 },
  { value: 'tables', label: '表格资产', icon: Table2 },
]

const SECONDARY_SECTIONS: DatasetSectionDefinition[] = [
  { value: 'workflow', label: '处理工作流', icon: Workflow },
  { value: 'db-catalog', label: '数据库目录', icon: Database },
  { value: 'evidence', label: '证据库', icon: ShieldCheck },
  { value: 'kg', label: '知识图谱', icon: Network },
]

const ALL_SECTIONS = [...PRIMARY_SECTIONS, ...SECONDARY_SECTIONS]

type PageScaffoldLayoutProps = Pick<
  ComponentProps<typeof PageScaffold>,
  | 'bodyClassName'
  | 'bodyContainerClassName'
  | 'bodyGutter'
  | 'density'
  | 'size'
>

type DatasetDetailShellProps = PageScaffoldLayoutProps & {
  activeSection: DatasetDetailSection
  actions?: ReactNode
  children: ReactNode
  datasetId: string
  datasetName?: string | null
  description: ReactNode
  icon: LucideIcon
  onSectionNavigate?: (href: string) => void
  title: string
}

function buildSectionHref(datasetId: string, section: DatasetDetailSection) {
  return `/datasets/${encodeURIComponent(datasetId)}/${section}`
}

export function DatasetDetailShell({
  activeSection,
  actions,
  bodyClassName,
  bodyContainerClassName,
  bodyGutter = 'dense',
  children,
  datasetId,
  datasetName,
  density = 'system-dense',
  description,
  icon: Icon,
  onSectionNavigate,
  size = 'full',
  title,
}: Readonly<DatasetDetailShellProps>) {
  const router = useRouter()
  const activeDefinition =
    ALL_SECTIONS.find((section) => section.value === activeSection) ??
    PRIMARY_SECTIONS[0]
  const secondaryActive = SECONDARY_SECTIONS.some(
    (section) => section.value === activeSection
  )

  return (
    <PageScaffold
      title={title}
      showHeader={false}
      size={size}
      density={density}
      bodyGutter={bodyGutter}
      bodyClassName={cn('bg-background', bodyClassName)}
      bodyContainerClassName={bodyContainerClassName}
      topClassName="border-b border-border bg-background"
      top={
        <div
          data-dataset-detail-header="true"
          className="flex min-w-0 flex-col gap-4 py-1 lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
              <Icon className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <h1 className="truncate text-xl font-semibold text-foreground">
                  {title}
                </h1>
                <span className="max-w-full truncate rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                  {datasetName || datasetId}
                </span>
              </div>
              <p className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">
                {description}
              </p>
            </div>
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          ) : null}
        </div>
      }
      toolbarBarClassName="border-b border-border bg-background"
      toolbarClassName="py-2"
      toolbar={
        <div className="flex w-full min-w-0 items-center gap-2">
          <Button variant="ghost" size="sm" className="h-9 shrink-0 rounded-md px-2" asChild>
            <Link href="/datasets">
              <ArrowLeft className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">返回知识库</span>
            </Link>
          </Button>

          <div className="min-w-0 flex-1 md:hidden">
            <Select
              value={activeSection}
              onValueChange={(value) => {
                const href = buildSectionHref(
                  datasetId,
                  value as DatasetDetailSection
                )
                if (onSectionNavigate) {
                  onSectionNavigate(href)
                  return
                }
                router.push(href)
              }}
            >
              <SelectTrigger
                aria-label="选择数据集功能"
                className="h-9 rounded-md bg-background shadow-none"
              >
                <SelectValue>{activeDefinition.label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ALL_SECTIONS.map((section) => (
                  <SelectItem key={section.value} value={section.value}>
                    {section.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <nav
            aria-label="数据集功能"
            className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex"
          >
            {PRIMARY_SECTIONS.map((section) => {
              const SectionIcon = section.icon
              const selected = activeSection === section.value
              return (
                <Link
                  key={section.value}
                  href={buildSectionHref(datasetId, section.value)}
                  aria-current={selected ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                    selected
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <SectionIcon className="size-4" aria-hidden="true" />
                  {section.label}
                </Link>
              )
            })}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-9 shrink-0 rounded-md px-3 text-sm',
                    secondaryActive && 'bg-primary/10 text-primary'
                  )}
                >
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                  {secondaryActive ? activeDefinition.label : '更多'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="rounded-md">
                {SECONDARY_SECTIONS.map((section) => {
                  const SectionIcon = section.icon
                  return (
                    <DropdownMenuItem key={section.value} asChild>
                      <Link
                        href={buildSectionHref(datasetId, section.value)}
                        aria-current={
                          activeSection === section.value ? 'page' : undefined
                        }
                      >
                        <SectionIcon className="size-4" aria-hidden="true" />
                        {section.label}
                      </Link>
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        </div>
      }
    >
      {children}
    </PageScaffold>
  )
}
