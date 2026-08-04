/** 切块预览参数侧栏。 */
'use client'

import dynamic from 'next/dynamic'

type SidebarVariant = 'panel' | 'dialog' | 'pane'
type SidebarProps = Readonly<{ variant?: SidebarVariant }>

const ChunkPreviewSidebarClient = dynamic(
  () => import('./sidebar-client').then((mod) => mod.Sidebar),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full animate-pulse rounded-md border border-border bg-muted/20" />
    ),
  }
)

export function Sidebar(props: SidebarProps = {}) {
  return <ChunkPreviewSidebarClient {...props} />
}
