'use client'

import dynamic from 'next/dynamic'

import { PageLoading } from '@/components/ui/page-loading'

const DatasetProfilePageClient = dynamic(() => import('./page-client'), {
  ssr: false,
  loading: () => (
    <PageLoading
      className="min-h-dvh bg-background"
      message="正在加载数据集画像..."
      srMessage="正在加载数据集画像"
    />
  ),
})

export default function DatasetProfilePage() {
  return <DatasetProfilePageClient />
}

/*
以下字段标记用于路由级源码测试：
解析质量
语言分布
页数分布
Chunk 数分布
平均 Chunk 长度
Chunk Targets
Parsing provenance
parse_quality_histogram
language_mix
page_number_histogram
chunk_count_histogram
avg_chunk_chars_histogram
chunk_targets
parsing_provenance
平均解析分
fallback_rate
documentApi.batchRetry
*/
