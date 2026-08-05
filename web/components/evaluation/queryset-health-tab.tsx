'use client'

import dynamic from 'next/dynamic'

import { Panel } from '@/components/ui/panel'
import { Skeleton } from '@/components/ui/skeleton'

type QuerysetHealthTabProps = Readonly<{ embedded?: boolean }>

const QuerysetHealthTabClient = dynamic(
  () => import('./queryset-health-tab-client').then((mod) => mod.QuerysetHealthTab),
  {
    ssr: false,
    loading: () => (
      <Panel
        role="status"
        aria-label="正在加载检索集健康度"
        className="h-80 border-border bg-card"
        padding="sm"
      >
        <div className="flex h-full flex-col items-start justify-between gap-6 p-3">
          <div>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-2 h-4 w-48" />
          </div>
          <div className="self-stretch space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-3/5" />
          </div>
          <div className="self-end flex items-center gap-3">
            <Skeleton className="h-9 w-20 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
        </div>
      </Panel>
    ),
  }
)

export function QuerysetHealthTab(props: QuerysetHealthTabProps) {
  return <QuerysetHealthTabClient {...props} />
}
