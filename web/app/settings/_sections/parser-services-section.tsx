'use client'

import { useState, type ReactNode } from 'react'
import { SettingsSwitch } from '@/components/settings/settings-switch'
import { Input } from '@/components/ui/input'
import type {
  Etl4LlmConfig,
  FeatureFlags,
  MagicPDFConfig,
  MarkerConfig,
  MinerUConfig,
  PaddleVLConfig,
  SystemStatus,
  TextInConfig,
} from '@/lib/api'
import { ChevronDown, LayoutGrid, ScanLine, Wand2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type ParserServicesSectionProps = {
  mineru: MinerUConfig
  etl4llm: Etl4LlmConfig
  marker: MarkerConfig
  paddleVl: PaddleVLConfig
  textIn: TextInConfig
  magicPdf: MagicPDFConfig
  editedFeatureFlags?: Partial<FeatureFlags>
  getFeatureValue: (key: keyof FeatureFlags) => boolean
  toggleFeature: (key: keyof FeatureFlags) => void
  parserStatuses?: SystemStatus['parsers']
  searchQuery?: string
  settingsWritable: boolean
  updateMinerU: (patch: Partial<MinerUConfig>) => void
  updateEtl4Llm: (patch: Partial<Etl4LlmConfig>) => void
  updateMarker: (patch: Partial<MarkerConfig>) => void
  updatePaddleVL: (patch: Partial<PaddleVLConfig>) => void
  updateTextIn: (patch: Partial<TextInConfig>) => void
  updateMagicPDF: (patch: Partial<MagicPDFConfig>) => void
}

type ConfiguredParserFeatureKey =
  | 'mineru_enabled'
  | 'etl4llm_enabled'
  | 'marker_enabled'
  | 'paddle_vl_enabled'
  | 'textin_enabled'
  | 'magicpdf_enabled'

const CARD = 'space-y-4'
const GRID = 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'
const FIELD_LABEL = 'text-xs font-semibold text-muted-foreground'
const FIELD_HINT = 'text-xs leading-5 text-muted-foreground'
const DENSE_INPUT = 'h-9 rounded-md border-border bg-background text-sm'
const DENSE_SELECT = 'h-9 w-full rounded-md border border-border bg-background px-3 text-sm'

function parserSearchMatches(query: string, terms: readonly string[]): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  return Boolean(
    normalizedQuery &&
    terms.some((term) => term.toLocaleLowerCase('zh-CN').includes(normalizedQuery))
  )
}

function parserStatusLabel({
  enabled,
  edited,
  status,
}: Readonly<{
  enabled: boolean
  edited: boolean
  status?: NonNullable<SystemStatus['parsers']>[string]
}>): { label: string; tone: string } {
  if (edited) {
    return {
      label: enabled ? '启用待保存' : '停用待保存',
      tone: 'text-primary',
    }
  }
  if (status?.available) return { label: '运行正常', tone: 'text-success' }
  if (status?.enabled) return { label: '暂不可用', tone: 'text-destructive' }
  return enabled
    ? { label: '保存后检查', tone: 'text-warning' }
    : { label: '未启用', tone: 'text-muted-foreground' }
}

function ParserServicePanel({
  id,
  title,
  description,
  Icon,
  enabled,
  edited,
  status,
  forceOpen,
  settingsWritable,
  onToggleEnabled,
  children,
}: Readonly<{
  id: string
  title: string
  description: string
  Icon: LucideIcon
  enabled: boolean
  edited: boolean
  status?: NonNullable<SystemStatus['parsers']>[string]
  forceOpen: boolean
  settingsWritable: boolean
  onToggleEnabled: () => void
  children: ReactNode
}>) {
  const [manualOpen, setManualOpen] = useState(false)
  const open = forceOpen || manualOpen
  const statusLabel = parserStatusLabel({ enabled, edited, status })
  const panelId = `parser-service-${id}`

  return (
    <section data-parser-service={id} className="border-b border-border last:border-b-0">
      <div className="flex min-h-16 items-center gap-2 py-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setManualOpen((current) => !current)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-left focus-ring hover:bg-muted/40"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">{title}</span>
            <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
              {description}
            </span>
          </span>
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
              open && 'rotate-180'
            )}
            aria-hidden="true"
          />
        </button>
        <div className="flex shrink-0 items-center gap-2 pr-2">
          <span className={cn('hidden text-xs sm:inline', statusLabel.tone)}>
            {statusLabel.label}
          </span>
          <SettingsSwitch
            checked={enabled}
            disabled={!settingsWritable}
            onCheckedChange={onToggleEnabled}
            aria-label={`${enabled ? '停用' : '启用'}${title}`}
          />
        </div>
      </div>
      {open ? (
        <fieldset disabled={!settingsWritable} className="contents">
          <div id={panelId} className="border-t border-border px-2 py-4 sm:px-4">
            {children}
          </div>
        </fieldset>
      ) : null}
    </section>
  )
}

function TogglePill({
  enabled,
  onClick,
  label,
}: Readonly<{
  enabled: boolean
  onClick: () => void
  label: string
}>) {
  return (
    <SettingsSwitch
      checked={enabled}
      onCheckedChange={onClick}
      aria-label={label}
      className="shrink-0"
    />
  )
}

export function ParserServicesSection({
  mineru,
  etl4llm,
  marker,
  paddleVl,
  textIn,
  magicPdf,
  editedFeatureFlags,
  getFeatureValue,
  toggleFeature,
  parserStatuses,
  searchQuery = '',
  settingsWritable,
  updateMinerU,
  updateEtl4Llm,
  updateMarker,
  updatePaddleVL,
  updateTextIn,
  updateMagicPDF,
}: Readonly<ParserServicesSectionProps>) {
  const mineruBackend = mineru.backend || 'pipeline'
  const parserFeature = (key: ConfiguredParserFeatureKey) => ({
    enabled: getFeatureValue(key),
    edited: Boolean(editedFeatureFlags && key in editedFeatureFlags),
    onToggleEnabled: () => toggleFeature(key),
  })

  return (
    <div className="border-y border-border">
      <ParserServicePanel
        id="mineru"
        title="MinerU"
        description="本地服务或云端 API"
        Icon={ScanLine}
        {...parserFeature('mineru_enabled')}
        status={parserStatuses?.mineru}
        forceOpen={parserSearchMatches(searchQuery, ['MinerU', '本地服务', '云端 API'])}
        settingsWritable={settingsWritable}
      >
        <div className={CARD}>
          <div className="rounded-md bg-primary/5 px-3 py-2.5">
            <div className="text-sm font-semibold text-foreground">本地部署优先</div>
            <div className={`${FIELD_HINT} mt-1`}>
              配置本地 MinerU 服务地址后，解析会走本地 ZIP 模式；未配置时再使用在线 API 令牌
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(220px,1fr)]">
            <div className="space-y-3">
              <div className="space-y-2">
                <div className={FIELD_LABEL}>本地 MinerU API 地址</div>
                <Input
                  className={DENSE_INPUT}
                  value={mineru.local_server_url}
                  onChange={(event) => updateMinerU({ local_server_url: event.target.value })}
                  placeholder="http://localhost:30001"
                />
                <div className={FIELD_HINT}>本地部署入口，解析会优先发送到这个服务</div>
              </div>

              <details
                open={mineruBackend === 'vlm-http-client'}
                className="group rounded-md border border-dashed border-border bg-muted/20 px-3 py-2"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground">
                  <span>VLM HTTP 后端</span>
                  <span className="text-xs text-muted-foreground">
                    {mineruBackend === 'vlm-http-client' ? '当前会使用' : '默认不会使用'}
                  </span>
                </summary>
                <div className="mt-3 space-y-2">
                  <div className={FIELD_LABEL}>VLM 模型服务地址</div>
                  <Input
                    className={DENSE_INPUT}
                    value={mineru.vl_server}
                    onChange={(event) => updateMinerU({ vl_server: event.target.value })}
                    placeholder="http://localhost:30002"
                  />
                  <div className={FIELD_HINT}>
                    切到 VLM HTTP 模式时需要填写，供本地 MinerU 调用模型服务
                  </div>
                </div>
              </details>
            </div>

            <div className="space-y-2">
              <div className={FIELD_LABEL}>本地后端模式</div>
              <select
                value={mineruBackend}
                onChange={(event) => updateMinerU({ backend: event.target.value })}
                className={DENSE_SELECT}
              >
                <option value="pipeline">Pipeline</option>
                <option value="vlm-http-client">VLM HTTP</option>
              </select>
              <div className={FIELD_HINT}>
                Pipeline 只使用本地 API；VLM HTTP 会额外传入下方模型服务地址
              </div>
            </div>
          </div>

          <div className={GRID}>
            <div className="space-y-2 lg:col-span-2">
              <div className={FIELD_LABEL}>在线 API 地址</div>
              <Input
                className={DENSE_INPUT}
                value={mineru.api_base}
                onChange={(event) => updateMinerU({ api_base: event.target.value })}
                placeholder="https://mineru.net/api/v4"
              />
              <div className={FIELD_HINT}>未配置本地服务时，在线 MinerU 会使用这个 API 地址</div>
            </div>

            <div className="space-y-2">
              <div className={FIELD_LABEL}>模型版本</div>
              <select
                value={mineru.model_version}
                onChange={(event) => updateMinerU({ model_version: event.target.value })}
                className={DENSE_SELECT}
              >
                <option value="vlm">VLM</option>
                <option value="pipeline">Pipeline</option>
              </select>
            </div>

            <div className="space-y-2 lg:col-span-3">
              <div className={FIELD_LABEL}>在线 API 令牌</div>
              <Input
                className={DENSE_INPUT}
                type="password"
                value={mineru.api_token}
                onChange={(event) => updateMinerU({ api_token: event.target.value })}
                placeholder="本地服务已配置时可留空"
              />
              <div className={FIELD_HINT}>只用于在线 MinerU，本地部署时可留空</div>
            </div>
          </div>
        </div>
      </ParserServicePanel>

      <ParserServicePanel
        id="etl4llm"
        title="ETL4LLM"
        description="版面、表格和图片解析服务"
        Icon={LayoutGrid}
        {...parserFeature('etl4llm_enabled')}
        status={parserStatuses?.etl4llm}
        forceOpen={parserSearchMatches(searchQuery, ['ETL4LLM', '版面', '表格', '图片'])}
        settingsWritable={settingsWritable}
      >
        <div className={CARD}>
          <div className={GRID}>
            <div className="space-y-2 lg:col-span-2">
              <div className={FIELD_LABEL}>服务地址</div>
              <Input
                className={DENSE_INPUT}
                value={etl4llm.api_url}
                onChange={(event) => updateEtl4Llm({ api_url: event.target.value })}
                placeholder="http://localhost:10001/v1/etl4llm/predict"
              />
              <div className={FIELD_HINT}>ETL4LLM 解析服务入口</div>
            </div>

            <div className="space-y-2">
              <div className={FIELD_LABEL}>解析模式（mode）</div>
              <select
                value={etl4llm.mode}
                onChange={(event) => updateEtl4Llm({ mode: event.target.value })}
                className={DENSE_SELECT}
              >
                <option value="partition">版面结构（partition）</option>
                <option value="text">纯文本（text）</option>
              </select>
            </div>

            <div className="space-y-2">
              <div className={FIELD_LABEL}>超时（秒）</div>
              <Input
                className={DENSE_INPUT}
                type="number"
                min={10}
                value={etl4llm.timeout_sec}
                onChange={(event) =>
                  updateEtl4Llm({
                    timeout_sec: Number.parseInt(event.target.value || '0', 10) || 120,
                  })
                }
              />
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border/70 pt-3">
            <div>
              <div className="text-sm font-medium text-foreground">强制 OCR</div>
              <div className={FIELD_HINT}>扫描件/图片型 PDF 建议开启</div>
            </div>
            <TogglePill
              enabled={etl4llm.force_ocr}
              onClick={() => updateEtl4Llm({ force_ocr: !etl4llm.force_ocr })}
              label="切换强制 OCR"
            />
          </div>

          <div className="flex items-center justify-between border-t border-border/70 pt-3">
            <div>
              <div className="text-sm font-medium text-foreground">提取图片</div>
              <div className={FIELD_HINT}>输出图片引用用于预览/入库</div>
            </div>
            <TogglePill
              enabled={etl4llm.extract_images}
              onClick={() => updateEtl4Llm({ extract_images: !etl4llm.extract_images })}
              label="切换提取图片"
            />
          </div>

          <div className="flex items-center justify-between border-t border-border/70 pt-3">
            <div>
              <div className="text-sm font-medium text-foreground">公式识别</div>
              <div className={FIELD_HINT}>尽量保留公式/LaTeX 输出</div>
            </div>
            <TogglePill
              enabled={etl4llm.enable_formula}
              onClick={() => updateEtl4Llm({ enable_formula: !etl4llm.enable_formula })}
              label="切换公式识别"
            />
          </div>

          <div className="flex items-center justify-between border-t border-border/70 pt-3">
            <div>
              <div className="text-sm font-medium text-foreground">过滤页眉页脚</div>
              <div className={FIELD_HINT}>减少检索噪音（若服务支持）</div>
            </div>
            <TogglePill
              enabled={etl4llm.filter_page_header_footer}
              onClick={() =>
                updateEtl4Llm({
                  filter_page_header_footer: !etl4llm.filter_page_header_footer,
                })
              }
              label="切换过滤页眉页脚"
            />
          </div>
        </div>
      </ParserServicePanel>

      <ParserServicePanel
        id="marker"
        title="Marker"
        description="PDF 转 Markdown 服务"
        Icon={LayoutGrid}
        {...parserFeature('marker_enabled')}
        status={parserStatuses?.marker}
        forceOpen={parserSearchMatches(searchQuery, ['Marker', 'PDF', 'Markdown'])}
        settingsWritable={settingsWritable}
      >
        <div className={CARD}>
          <div className={GRID}>
            <div className="space-y-2 lg:col-span-2">
              <div className={FIELD_LABEL}>服务地址</div>
              <Input
                className={DENSE_INPUT}
                value={marker.api_url}
                onChange={(event) => updateMarker({ api_url: event.target.value })}
                placeholder="http://localhost:2080/convert"
              />
              <div className={FIELD_HINT}>Marker 解析服务入口</div>
            </div>

            <div className="space-y-2">
              <div className={FIELD_LABEL}>超时（秒）</div>
              <Input
                className={DENSE_INPUT}
                type="number"
                min={30}
                value={marker.timeout_sec}
                onChange={(event) =>
                  updateMarker({
                    timeout_sec: Number.parseInt(event.target.value || '0', 10) || 600,
                  })
                }
              />
              <div className={FIELD_HINT}>大文件/复杂 PDF 建议调大</div>
            </div>
          </div>
        </div>
      </ParserServicePanel>

      <ParserServicePanel
        id="paddle-vl"
        title="PaddleOCR-VL"
        description="扫描件和复杂版面识别服务"
        Icon={ScanLine}
        {...parserFeature('paddle_vl_enabled')}
        status={parserStatuses?.paddle_vl}
        forceOpen={parserSearchMatches(searchQuery, ['PaddleOCR-VL', 'PaddleVL', '扫描件', 'OCR'])}
        settingsWritable={settingsWritable}
      >
        <div className={CARD}>
          <div className={GRID}>
            <div className="space-y-2 lg:col-span-2">
              <div className={FIELD_LABEL}>服务地址</div>
              <Input
                className={DENSE_INPUT}
                value={paddleVl.api_url}
                onChange={(event) => updatePaddleVL({ api_url: event.target.value })}
                placeholder="http://localhost:9030/convert"
              />
              <div className={FIELD_HINT}>PaddleOCR-VL 解析服务入口</div>
            </div>

            <div className="space-y-2">
              <div className={FIELD_LABEL}>超时（秒）</div>
              <Input
                className={DENSE_INPUT}
                type="number"
                min={30}
                value={paddleVl.timeout_sec}
                onChange={(event) =>
                  updatePaddleVL({
                    timeout_sec: Number.parseInt(event.target.value || '0', 10) || 600,
                  })
                }
              />
              <div className={FIELD_HINT}>扫描件/OCR 场景建议调大</div>
            </div>
          </div>
        </div>
      </ParserServicePanel>

      <ParserServicePanel
        id="textin"
        title="TextIn xParse"
        description="云端文档解析服务"
        Icon={LayoutGrid}
        {...parserFeature('textin_enabled')}
        status={parserStatuses?.textin}
        forceOpen={parserSearchMatches(searchQuery, ['TextIn', 'xParse', 'APP ID', 'Secret Code'])}
        settingsWritable={settingsWritable}
      >
        <div className={CARD}>
          <div className={GRID}>
            <div className="space-y-2 lg:col-span-2">
              <div className={FIELD_LABEL}>API 地址</div>
              <Input
                className={DENSE_INPUT}
                value={textIn.api_url}
                onChange={(event) => updateTextIn({ api_url: event.target.value })}
                placeholder="https://api.textin.com/ai/service/v1/pdf_to_markdown"
              />
              <div className={FIELD_HINT}>TextIn 文档解析服务入口</div>
            </div>

            <div className="space-y-2">
              <div className={FIELD_LABEL}>超时（秒）</div>
              <Input
                className={DENSE_INPUT}
                type="number"
                min={10}
                value={textIn.timeout_sec}
                onChange={(event) =>
                  updateTextIn({
                    timeout_sec: Number.parseInt(event.target.value || '0', 10) || 180,
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <div className={FIELD_LABEL}>APP ID</div>
              <Input
                className={DENSE_INPUT}
                value={textIn.app_id}
                onChange={(event) => updateTextIn({ app_id: event.target.value })}
                placeholder="你的 TextIn APP ID"
              />
            </div>

            <div className="space-y-2 lg:col-span-2">
              <div className={FIELD_LABEL}>Secret Code</div>
              <Input
                className={DENSE_INPUT}
                type="password"
                value={textIn.secret_code}
                onChange={(event) => updateTextIn({ secret_code: event.target.value })}
                placeholder="你的 TextIn Secret Code"
              />
            </div>

            <div className="space-y-2">
              <div className={FIELD_LABEL}>解析模式</div>
              <select
                value={textIn.parse_mode}
                onChange={(event) => updateTextIn({ parse_mode: event.target.value })}
                className={DENSE_SELECT}
              >
                <option value="auto">auto</option>
                <option value="scan">scan</option>
                <option value="parse">parse</option>
                <option value="lite">lite</option>
                <option value="vlm">vlm</option>
              </select>
            </div>

            <div className="space-y-2">
              <div className={FIELD_LABEL}>表格输出</div>
              <select
                value={textIn.table_flavor}
                onChange={(event) => updateTextIn({ table_flavor: event.target.value })}
                className={DENSE_SELECT}
              >
                <option value="html">html</option>
                <option value="markdown">markdown</option>
              </select>
            </div>

            <div className="space-y-2">
              <div className={FIELD_LABEL}>DPI</div>
              <Input
                className={DENSE_INPUT}
                type="number"
                min={72}
                value={textIn.dpi}
                onChange={(event) =>
                  updateTextIn({
                    dpi: Number.parseInt(event.target.value || '0', 10) || 144,
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <div className={FIELD_LABEL}>页数限制（0=全部）</div>
              <Input
                className={DENSE_INPUT}
                type="number"
                min={0}
                value={textIn.page_count}
                onChange={(event) =>
                  updateTextIn({
                    page_count: Number.parseInt(event.target.value || '0', 10) || 0,
                  })
                }
              />
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border/70 pt-3">
            <div>
              <div className="text-sm font-medium text-foreground">应用文档树</div>
              <div className={FIELD_HINT}>尽量保留标题层级 / 文档结构</div>
            </div>
            <TogglePill
              enabled={textIn.apply_document_tree}
              onClick={() =>
                updateTextIn({
                  apply_document_tree: !textIn.apply_document_tree,
                })
              }
              label="切换应用文档树"
            />
          </div>

          <div className="flex items-center justify-between border-t border-border/70 pt-3">
            <div>
              <div className="text-sm font-medium text-foreground">Markdown 细节增强</div>
              <div className={FIELD_HINT}>返回更丰富的 Markdown 结构</div>
            </div>
            <TogglePill
              enabled={textIn.markdown_details}
              onClick={() => updateTextIn({ markdown_details: !textIn.markdown_details })}
              label="切换 Markdown 细节增强"
            />
          </div>
        </div>
      </ParserServicePanel>

      <ParserServicePanel
        id="magicpdf"
        title="MagicPDF"
        description="本地命令或独立解析服务"
        Icon={Wand2}
        {...parserFeature('magicpdf_enabled')}
        status={parserStatuses?.magicpdf}
        forceOpen={parserSearchMatches(searchQuery, [
          'MagicPDF',
          '模型目录',
          '设备模式',
          '本地命令',
        ])}
        settingsWritable={settingsWritable}
      >
        <div className={CARD}>
          <div className={GRID}>
            <div className="space-y-2">
              <div className={FIELD_LABEL}>解析方法（method）</div>
              <select
                value={magicPdf.method}
                onChange={(event) => updateMagicPDF({ method: event.target.value })}
                className={DENSE_SELECT}
              >
                <option value="auto">自动（auto）</option>
                <option value="txt">文本优先（txt）</option>
                <option value="ocr">OCR 优先（ocr）</option>
              </select>
            </div>

            <div className="space-y-2">
              <div className={FIELD_LABEL}>文档语言</div>
              <Input
                className={DENSE_INPUT}
                value={magicPdf.lang}
                onChange={(event) => updateMagicPDF({ lang: event.target.value })}
                placeholder='例如"ch"'
              />
            </div>

            <div className="space-y-2">
              <div className={FIELD_LABEL}>超时（秒）</div>
              <Input
                className={DENSE_INPUT}
                type="number"
                min={30}
                value={magicPdf.timeout_sec}
                onChange={(event) =>
                  updateMagicPDF({
                    timeout_sec: Number.parseInt(event.target.value || '0', 10) || 600,
                  })
                }
              />
            </div>

            <div className="space-y-2 lg:col-span-2">
              <div className={FIELD_LABEL}>模型目录</div>
              <Input
                className={DENSE_INPUT}
                value={magicPdf.models_dir}
                onChange={(event) => updateMagicPDF({ models_dir: event.target.value })}
                placeholder="/opt/mimirq-model-cache/.../PDF-Extract-Kit-1.0/.../models"
              />
              <div className={FIELD_HINT}>
                留空时后端会自动查找 Docker 挂载的 MinerU / PDF-Extract-Kit 模型缓存
              </div>
            </div>

            <div className="space-y-2">
              <div className={FIELD_LABEL}>设备模式</div>
              <select
                className={DENSE_SELECT}
                value={magicPdf.device_mode || 'cpu'}
                onChange={(event) => updateMagicPDF({ device_mode: event.target.value })}
              >
                <option value="cpu">CPU</option>
                <option value="cuda">CUDA / GPU</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border/70 pt-3">
            <div>
              <div className="text-sm font-medium text-foreground">保留解析产物</div>
              <div className={FIELD_HINT}>默认会在入库流程完成后清理 `.magicpdf/` 目录</div>
            </div>
            <TogglePill
              enabled={magicPdf.keep_artifacts}
              onClick={() => updateMagicPDF({ keep_artifacts: !magicPdf.keep_artifacts })}
              label="切换保留解析产物"
            />
          </div>
        </div>
      </ParserServicePanel>
    </div>
  )
}
