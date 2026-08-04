import { useTranslations } from 'next-intl'

import { Skeleton } from '@/components/ui/skeleton'

const NAV_SKELETON_KEYS = ['nav-1', 'nav-2', 'nav-3', 'nav-4', 'nav-5', 'nav-6']
const CONTENT_ROW_KEYS = ['row-1', 'row-2', 'row-3', 'row-4', 'row-5', 'row-6']

/** 渲染与应用壳层尺寸一致的全局加载骨架。 */
export default function Loading() {
  const t = useTranslations('RouteBoundaries')

  return (
    <div className="flex h-dvh overflow-hidden bg-background" role="status" aria-live="polite">
      <aside className="hidden w-56 flex-col border-r border-border bg-card p-3 md:flex">
        <div className="flex items-center gap-3 border-b border-border pb-3">
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="h-4 w-24 rounded-sm" />
        </div>

        <Skeleton className="mt-3 h-9 rounded-md" />

        <div className="mt-4 space-y-2">
          {NAV_SKELETON_KEYS.map((key) => (
            <Skeleton key={key} className="h-9 rounded-md" />
          ))}
        </div>

        <Skeleton className="mt-auto h-10 rounded-md" />
      </aside>

      <main
        id="main-content"
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6"
      >
        <div className="mx-auto max-w-6xl">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48 rounded-sm" />
            <Skeleton className="h-4 w-full max-w-md rounded-sm" />
          </div>

          <div className="mt-6 overflow-hidden rounded-md border border-border bg-card">
            {CONTENT_ROW_KEYS.map((key) => (
              <div key={key} className="flex items-center gap-3 border-b border-border p-4 last:border-b-0">
                <Skeleton className="size-9 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/5 rounded-sm" />
                  <Skeleton className="h-3 w-3/5 rounded-sm" />
                </div>
              </div>
            ))}
          </div>

          <span className="sr-only">{t('loading.pageSr')}</span>
        </div>
      </main>
    </div>
  )
}
