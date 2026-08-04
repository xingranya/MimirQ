'use client'

import dynamic from 'next/dynamic'
import { SearchCheck } from 'lucide-react'

import { AppFrame } from '@/components/app-frame'
import { PageLoading } from '@/components/ui/page-loading'
import { PageScaffold } from '@/components/ui/page-scaffold'
import { EvidenceOpsPanel } from '@/components/evidence/evidence-ops-panel'

const EvidenceWorkbench = dynamic(() => import('@/components/ragviz/evidence-workbench').then((mod) => mod.EvidenceWorkbench), {
  ssr: false,
  loading: () => <PageLoading message="正在加载证据验证工具…" srMessage="正在加载证据验证工具" />,
})

export default function KnowledgeEvidencePage() {
  return (
    <AppFrame>
      <PageScaffold
        title="证据验证"
        description="输入一个问题，检查当前知识范围能否提供可靠引用。此处只验证检索结果，不生成回答。"
        icon={SearchCheck}
      >
        <EvidenceWorkbench />
        <EvidenceOpsPanel />
      </PageScaffold>
    </AppFrame>
  )
}
