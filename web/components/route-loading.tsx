import { Loader2 } from 'lucide-react'

/** 渲染路由切换期间的统一加载状态。 */
export function RouteLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[40vh] items-center justify-center gap-3 p-6 text-muted-foreground"
    >
      <Loader2 className="size-6 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      <span className="text-sm font-medium">加载中…</span>
    </div>
  )
}
