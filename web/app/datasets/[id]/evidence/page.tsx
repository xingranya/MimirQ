'use client'

import { useMemo } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'

import { AppFrame } from '@/components/app-frame'
import { DatasetDetailShell } from '@/components/datasets/dataset-detail-shell'
import { EvidenceSuiteWorkbench } from '@/components/evidence/evidence-suite-workbench'

function asDatasetId(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.trim()) return raw
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0]
  return null
}

export default function DatasetEvidencePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const datasetId = useMemo(() => asDatasetId((params as Record<string, unknown>).id), [params])
  const initialFeedbackId = useMemo(() => {
    const raw = searchParams.get('feedback_id')
    return raw?.trim() ? raw.trim() : undefined
  }, [searchParams])

  return (
    <AppFrame>
      {datasetId ? (
        <DatasetDetailShell
          activeSection="evidence"
          datasetId={datasetId}
          title="证据库"
          icon={ShieldCheck}
          description="管理可复用的证据集、审核结果，并同步到回归用例库。"
        >
          <EvidenceSuiteWorkbench
            datasetId={datasetId}
            initialFeedbackId={initialFeedbackId}
          />
        </DatasetDetailShell>
      ) : null}
    </AppFrame>
  )
}
