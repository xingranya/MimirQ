'use client'

import { useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'

import { PageLoading } from '@/components/ui/page-loading'
import { useResizeObserver } from '@/hooks/use-resize-observer'
import { getCssHslColor } from '@/lib/css-vars'
import { cn } from '@/lib/utils'

import type { SimilarityDiagnosticLink, SimilarityDiagnosticNode } from './similarity-diagnostics'

const MAX_DIAGNOSTICS_GRAPH_NODES = 180
const MAX_DIAGNOSTICS_GRAPH_LINKS = 900

const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), {
  ssr: false,
  loading: () => <GraphLoadingShell />,
})

type SimilarityDiagnosticsGraphProps = Readonly<{
  nodes: SimilarityDiagnosticNode[]
  links: SimilarityDiagnosticLink[]
}>

type GraphNode = SimilarityDiagnosticNode & {
  val?: number
}

export function SimilarityDiagnosticsGraph({ nodes, links }: SimilarityDiagnosticsGraphProps) {
  const { resolvedTheme } = useTheme()
  const t = useTranslations('SimilarityDiagnosticsGraph')
  const containerRef = useRef<HTMLDivElement>(null)
  const { width, height } = useResizeObserver(containerRef)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null)

  const isDark = resolvedTheme === 'dark'
  const backgroundColor = getCssHslColor('--background', isDark ? '#020617' : '#ffffff')
  const warningColor = getCssHslColor('--warning', isDark ? '#fbbf24' : '#d97706')
  const destructiveColor = getCssHslColor('--destructive', isDark ? '#f87171' : '#dc2626')
  const mutedForegroundColor = getCssHslColor('--muted-foreground', isDark ? '#94a3b8' : '#475569')

  const graphData = useMemo(
    () => ({
      nodes: nodes.map((node) => ({
        ...node,
        val: Math.max(4, node.supportCount * 2 + (node.isOutlier ? 2 : 1)),
      })),
      links,
    }),
    [links, nodes]
  )

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null
  const selectedLink = links.find((link) => link.id === selectedLinkId) ?? null
  const exceedsGraphComplexityBudget =
    nodes.length > MAX_DIAGNOSTICS_GRAPH_NODES || links.length > MAX_DIAGNOSTICS_GRAPH_LINKS
  const selectedNodeDescription = selectedNode
    ? t('nodeCardSelectedDescription', {
        axis: selectedNode.axis.toUpperCase(),
        mean: (selectedNode.averageSimilarity * 100).toFixed(0),
        peak: (selectedNode.peakSimilarity * 100).toFixed(0),
      })
    : t('nodeCardEmptyDescription')
  const selectedLinkTitle = selectedLink
    ? t('linkCardSelectedTitle', {
        score: (selectedLink.similarity * 100).toFixed(0),
        overlap: (selectedLink.lexicalOverlap * 100).toFixed(0),
      })
    : t('linkCardEmptyTitle')
  const selectedLinkDescription = selectedLink
    ? t('linkCardSelectedDescription', {
        source: selectedLink.sourceLabel,
        target: selectedLink.targetLabel,
      })
    : t('linkCardEmptyDescription')

  if (nodes.length === 0) {
    return (
      <div className="flex min-h-[280px] items-center justify-center rounded-md border border-dashed border-border bg-background px-6 text-center text-sm text-muted-foreground sm:min-h-[320px]">
        {t('noGraphData')}
      </div>
    )
  }

  const hasLinks = links.length > 0

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-md border border-border bg-card">
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">{t('previewLabel')}</div>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('previewHint')}</p>
          </div>
          {!hasLinks ? (
            <p role="status" className="text-xs text-muted-foreground">
              {t('noLinksTitle')}
            </p>
          ) : null}
        </div>

        <div
          ref={containerRef}
          className="relative h-[320px] bg-background sm:h-[380px] lg:h-[420px]"
        >
          {exceedsGraphComplexityBudget ? (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <div className="max-w-lg">
                <div className="text-sm font-semibold text-foreground">
                  {t('graphTooLargeTitle')}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{t('graphTooLargeHint')}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t('graphTooLargeMetrics', {
                    nodeCount: nodes.length,
                    linkCount: links.length,
                    nodeLimit: MAX_DIAGNOSTICS_GRAPH_NODES,
                    linkLimit: MAX_DIAGNOSTICS_GRAPH_LINKS,
                  })}
                </p>
              </div>
            </div>
          ) : width > 0 && height > 0 ? (
            <ForceGraph3D
              graphData={graphData}
              width={width}
              height={height}
              backgroundColor={backgroundColor}
              showNavInfo={false}
              enableNodeDrag={false}
              cooldownTicks={0}
              nodeLabel={(node) => {
                const current = node as SimilarityDiagnosticNode
                return t('nodeTooltip', {
                  axis: current.axis.toUpperCase(),
                  label: current.label,
                  outlierSuffix: current.isOutlier ? t('nodeTooltipOutlierSuffix') : '',
                  mean: (current.averageSimilarity * 100).toFixed(0),
                  peak: (current.peakSimilarity * 100).toFixed(0),
                })
              }}
              nodeColor={(node) => (node as SimilarityDiagnosticNode).color}
              nodeRelSize={5}
              linkOpacity={0.35}
              linkDirectionalParticles={(link) =>
                (link as SimilarityDiagnosticLink).isOutlier ? 2 : 0
              }
              linkDirectionalParticleWidth={(link) =>
                (link as SimilarityDiagnosticLink).isMarked ? 4 : 2
              }
              linkColor={(link) => {
                const current = link as SimilarityDiagnosticLink
                if (current.isMarked) return warningColor
                if (current.isOutlier) return destructiveColor
                return mutedForegroundColor
              }}
              linkWidth={(link) => {
                const current = link as SimilarityDiagnosticLink
                if (current.isMarked) return 4
                if (current.isOutlier) return 3
                return Math.max(1.1, current.similarity * 3.2)
              }}
              onNodeClick={(node) => {
                const current = node as GraphNode
                setSelectedNodeId(current.id)
              }}
              onLinkClick={(link) => {
                const current = link as SimilarityDiagnosticLink
                setSelectedLinkId(current.id)
              }}
            />
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <DiagnosticsDetailCard
          label={t('nodeCardLabel')}
          title={selectedNode?.label ?? t('nodeCardEmptyTitle')}
          description={selectedNodeDescription}
        />
        <DiagnosticsDetailCard
          label={t('linkCardLabel')}
          title={hasLinks ? selectedLinkTitle : t('noLinksTitle')}
          description={hasLinks ? selectedLinkDescription : t('noLinksDescription')}
          tone={selectedLink?.isOutlier ? 'warning' : 'default'}
        />
      </div>
    </div>
  )
}

function GraphLoadingShell() {
  const t = useTranslations('SimilarityDiagnosticsGraph')

  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-md border border-border bg-background px-6">
      <PageLoading
        message={t('loadingMessage')}
        srMessage={t('loadingSrMessage')}
        className="min-h-0 flex-none"
      />
      <p className="mt-2 text-xs text-muted-foreground">{t('loadingHint')}</p>
    </div>
  )
}

function DiagnosticsDetailCard({
  label,
  title,
  description,
  tone = 'default',
}: Readonly<{
  label: string
  title: string
  description: string
  tone?: 'default' | 'warning'
}>) {
  return (
    <div
      className={cn(
        'rounded-md border px-4 py-3',
        tone === 'warning' ? 'border-warning/30 bg-warning/5' : 'border-border bg-background'
      )}
    >
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{title}</div>
      <p className="mt-2 text-xs text-muted-foreground">{description}</p>
    </div>
  )
}
