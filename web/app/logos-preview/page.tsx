import { notFound } from 'next/navigation'
import { AppFrame } from '@/components/app-frame'
import { ProviderIcon } from '@/components/provider-icon'
import { PageScaffold } from '@/components/ui/page-scaffold'
import { Grid3X3 } from 'lucide-react'

const providers = [
  { id: 'openai', name: 'OpenAI', color: '#10A37F' },
  { id: 'openai-embedding', name: 'OpenAI Embedding', color: '#10A37F' },
  { id: 'anthropic', name: 'Anthropic', color: '#CC785C' },
  { id: 'deepseek', name: 'DeepSeek', color: '#0066FF' },
  { id: 'zhipu', name: '智谱 AI', color: '#9333EA' },
  { id: 'qwen', name: '通义千问', color: '#0EA5E9' },
  { id: 'moonshot', name: 'Moonshot AI', color: '#4F46E5' },
  { id: 'ollama', name: 'Ollama', color: '#000000' },
  { id: 'ark', name: '火山引擎', color: '#FF6A00' },
  { id: 'lingyiwanwu', name: '零一万物', color: '#3B82F6' },
  { id: 'qianfan', name: '百度千帆', color: '#2563EB' },
  { id: 'siliconflow', name: 'SiliconFlow', color: '#7C3AED' },
  { id: 'openrouter', name: 'OpenRouter', color: '#6366F1' },
  { id: 'together', name: 'Together AI', color: '#0EA5E9' },
  { id: 'cohere-reranker', name: 'Cohere Reranker', color: '#0EA5E9' },
  { id: 'jina-reranker', name: 'Jina Reranker', color: '#8B5CF6' },
  { id: 'local-embedding', name: '本地 Embedding', color: '#10B981' },
  { id: 'local-reranker', name: '本地 Reranker', color: '#F97316' },
] as const

const sizeOptions = [
  { size: 'size-6', label: '24px' },
  { size: 'size-8', label: '32px' },
  { size: 'size-12', label: '48px' },
  { size: 'size-16', label: '64px' },
] as const

const backgroundOptions = [
  { label: '浅色背景', className: 'border-border bg-background' },
  { label: '灰色背景', className: 'border-border bg-muted' },
  { label: '深色背景', className: 'border-neutral-700 bg-neutral-950' },
] as const

export default function LogosPreviewPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound()
  }

  return (
    <AppFrame>
      <PageScaffold
        title="供应商图标"
        icon={Grid3X3}
        iconColor="text-primary"
        description="检查模型与重排服务图标在常用尺寸和不同背景下的显示效果。"
        size="full"
        compact
      >
        <div
          className="overflow-hidden rounded-md border border-border bg-card"
          data-provider-icon-catalog="true"
        >
          <section aria-labelledby="provider-icons-title">
            <div className="border-b border-border px-4 py-3 sm:px-5">
              <h2 id="provider-icons-title" className="text-base font-semibold text-foreground">
                图标目录
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">共 {providers.length} 个供应商与本地服务。</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
              {providers.map((provider) => (
                <div
                  key={provider.id}
                  className="flex min-w-0 items-center gap-3 border-b border-border px-4 py-3 sm:px-5 sm:[&:nth-child(odd)]:border-r xl:[&:nth-child(odd)]:border-r-0 xl:[&:not(:nth-child(3n))]:border-r"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                    <ProviderIcon providerId={provider.id} className="size-7" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium text-foreground">{provider.name}</h3>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{provider.id}</p>
                  </div>
                  <span
                    className="size-4 shrink-0 rounded-sm border border-border"
                    style={{ backgroundColor: provider.color }}
                    title={provider.color}
                    aria-label={`${provider.name} 品牌色 ${provider.color}`}
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="border-t border-border" aria-labelledby="provider-sizes-title">
            <div className="border-b border-border px-4 py-3 sm:px-5">
              <h2 id="provider-sizes-title" className="text-base font-semibold text-foreground">
                尺寸检查
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">使用 OpenAI 图标核对常用显示尺寸。</p>
            </div>
            <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
              {sizeOptions.map((option) => (
                <div key={option.label} className="flex min-h-28 flex-col items-center justify-center gap-3 bg-card p-4">
                  <ProviderIcon providerId="openai" className={option.size} />
                  <span className="text-xs text-muted-foreground">{option.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="border-t border-border" aria-labelledby="provider-backgrounds-title">
            <div className="border-b border-border px-4 py-3 sm:px-5">
              <h2 id="provider-backgrounds-title" className="text-base font-semibold text-foreground">
                背景检查
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">确认图标在常用界面底色上清晰可辨。</p>
            </div>
            <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-3">
              {backgroundOptions.map((option) => (
                <div key={option.label} className="bg-card p-4 sm:p-5">
                  <h3 className="mb-3 text-sm font-medium text-foreground">{option.label}</h3>
                  <div className={`flex min-h-24 flex-wrap items-center gap-3 rounded-md border p-4 ${option.className}`}>
                    {providers.slice(0, 9).map((provider) => (
                      <ProviderIcon key={provider.id} providerId={provider.id} className="size-8" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </PageScaffold>
    </AppFrame>
  )
}
