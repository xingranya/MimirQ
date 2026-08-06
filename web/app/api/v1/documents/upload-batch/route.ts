import { proxyDocumentUpload } from '@/lib/server-upload-proxy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export function POST(request: Request): Promise<Response> {
  return proxyDocumentUpload(request, 'upload-batch')
}
