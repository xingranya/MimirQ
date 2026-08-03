'use client'

import type { ReactNode } from 'react'

import { Lightbulb, Route, X, Link as LinkIcon } from 'lucide-react'

import { IconButton } from '@/components/ui/icon-button'

type GraphStatusBannersProps = Readonly<{
  isPathMode: boolean
  hasPathStart: boolean
  hasPathEnd: boolean
  isConnectMode: boolean
  connectSourceLabel: string | null
  isExplainMode: boolean
  currentStepIndex: number
  explainStepCount: number
  onExitPathMode: () => void
  onExitConnectMode: () => void
  onExitExplainMode: () => void
}>

type GraphModeBannerProps = Readonly<{
  toneClassName: string
  dismissLabel: string
  onDismiss: () => void
  children: ReactNode
}>

function GraphModeBanner({ toneClassName, dismissLabel, onDismiss, children }: GraphModeBannerProps) {
  return (
    <div
      className={`pointer-events-auto absolute left-1/2 top-[calc(100%+0.5rem)] flex w-[calc(100vw-1rem)] max-w-xl -translate-x-1/2 items-center justify-between gap-2 rounded-md px-3 py-2 animate-in fade-in slide-in-from-top-2 motion-reduce:animate-none sm:w-auto ${toneClassName}`}
    >
      {children}
      <IconButton
        label={dismissLabel}
        onClick={onDismiss}
        className="ml-2 h-8 w-8 shrink-0 rounded-md hover:bg-current/10"
      >
        <X className="w-4 h-4" />
      </IconButton>
    </div>
  )
}

export function GraphStatusBanners({
  isPathMode,
  hasPathStart,
  hasPathEnd,
  isConnectMode,
  connectSourceLabel,
  isExplainMode,
  currentStepIndex,
  explainStepCount,
  onExitPathMode,
  onExitConnectMode,
  onExitExplainMode,
}: GraphStatusBannersProps) {
  const pathMessage = (() => {
    if (hasPathStart) {
      return hasPathEnd ? '路径分析完成' : '请点击选择【终点】'
    }
    return '请点击选择【起点】'
  })()

  return (
    <>
      {isPathMode ? (
        <GraphModeBanner
          toneClassName="bg-primary text-primary-foreground"
          dismissLabel="退出路径分析"
          onDismiss={onExitPathMode}
        >
          <Route className="w-4 h-4" />
          <span className="text-sm font-medium">{pathMessage}</span>
        </GraphModeBanner>
      ) : null}

      {isConnectMode ? (
        <GraphModeBanner
          toneClassName="bg-success text-success-foreground"
          dismissLabel="退出连接模式"
          onDismiss={onExitConnectMode}
        >
          <LinkIcon className="w-4 h-4" />
          <span className="text-sm font-medium">正在连接：{connectSourceLabel}，请选择目标节点</span>
        </GraphModeBanner>
      ) : null}

      {isExplainMode ? (
        <GraphModeBanner
          toneClassName="bg-info text-info-foreground"
          dismissLabel="退出推理演示"
          onDismiss={onExitExplainMode}
        >
          <Lightbulb className="w-4 h-4" />
          <span className="text-sm font-medium">
            推理路径演示中（{currentStepIndex + 1}/{explainStepCount}）
          </span>
        </GraphModeBanner>
      ) : null}
    </>
  )
}
