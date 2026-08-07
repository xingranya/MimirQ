/**
 * 模型配置对话框组件
 */
'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronsUpDown,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  FlaskConical,
  Save,
  ChevronRight,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ProviderIcon } from '@/components/provider-icon'
import { cn } from '@/lib/utils'
import { settingsApi } from '@/lib/api'
import { formatApiError } from '@/lib/api-errors'
import { isLocalOpenAICompatibleBaseUrl } from '@/lib/openai-compatible'
import type { ModelProvider, ProviderConfig } from '@/types/models'

interface ModelConfigDialogProps {
  provider: ModelProvider | null
  open: boolean
  onClose: () => void
  onSave: (providerId: string, config: ProviderConfig) => Promise<boolean>
}

function getDefaultApiBase(providerId: string): string {
  const defaults: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    'openai-embedding': 'https://api.openai.com/v1',
    deepseek: 'https://api.deepseek.com/v1',
    zhipu: 'https://open.bigmodel.cn/api/paas/v4',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    'qwen-embedding': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    moonshot: 'https://api.moonshot.cn/v1',
    ollama: 'http://localhost:11434/v1',
    ark: 'https://ark.cn-beijing.volces.com/api/v3',
    lingyiwanwu: 'https://api.lingyiwanwu.com/v1',
    qianfan: 'https://qianfan.baidubce.com/v2',
    siliconflow: 'https://api.siliconflow.cn/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    together: 'https://api.together.xyz/v1',
    custom: '',
    'custom-embedding': '',
  }
  return defaults[providerId] || ''
}

export function ModelConfigDialog({
  provider,
  open,
  onClose,
  onSave,
}: Readonly<ModelConfigDialogProps>) {
  const idPrefix = useId()
  const [config, setConfig] = useState<ProviderConfig>({
    apiKey: '',
    apiBase: '',
    model: '',
    temperature: 0.7,
    timeout: 60,
  })
  const [showApiKey, setShowApiKey] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([])
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)
  const [modelMode, setModelMode] = useState<'catalog' | 'manual'>('catalog')
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
  } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const saveRequestInFlightRef = useRef(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const apiKeyId = `${idPrefix}-apiKey`
  const apiBaseId = `${idPrefix}-apiBase`
  const modelId = `${idPrefix}-model`
  const temperatureId = `${idPrefix}-temperature`
  const effectiveApiBase = config.apiBase || (provider ? getDefaultApiBase(provider.id) : '')
  const apiKeyOptional =
    provider?.id === 'ollama' ||
    provider?.id === 'local-embedding' ||
    isLocalOpenAICompatibleBaseUrl(effectiveApiBase)
  const canSubmit = Boolean(config.model && (config.apiKey || apiKeyOptional))
  const requestBusy = isSaving || isTesting || isDiscovering
  const modelOptions = useMemo(() => {
    const options = [...discoveredModels]
    const configuredModel = String(config.model || '').trim()
    if (configuredModel && !options.some((model) => model === configuredModel)) {
      options.unshift(configuredModel)
    }
    return options
  }, [config.model, discoveredModels])

  useEffect(() => {
    if (provider?.config) {
      setConfig({
        apiKey: provider.config.apiKey || '',
        apiBase: provider.config.apiBase || getDefaultApiBase(provider.id),
        model: provider.config.model || '',
        temperature: provider.config.temperature ?? 0.7,
        timeout: provider.config.timeout ?? 60,
      })
    } else if (provider) {
      setConfig({
        apiKey: '',
        apiBase: getDefaultApiBase(provider.id),
        model: '',
        temperature: 0.7,
        timeout: 60,
      })
    }
    setTestResult(null)
    setDiscoveryError(null)
    setDiscoveredModels([])
    setModelMode('catalog')
    setModelPickerOpen(false)
    setIsDiscovering(false)
    setSaveError(null)
    setIsSaving(false)
    saveRequestInFlightRef.current = false
    setShowAdvanced(false)
  }, [provider, open])

  const handleSave = async () => {
    if (!provider || isTesting || saveRequestInFlightRef.current) return
    saveRequestInFlightRef.current = true
    setIsSaving(true)
    setSaveError(null)
    try {
      const saved = await onSave(provider.id, config)
      if (!saved) {
        setSaveError('保存失败，请检查配置和服务连接后重试。')
        return
      }
      onClose()
    } catch {
      setSaveError('保存失败，请检查配置和服务连接后重试。')
    } finally {
      saveRequestInFlightRef.current = false
      setIsSaving(false)
    }
  }

  const handleTest = async () => {
    setIsTesting(true)
    setTestResult(null)

    try {
      if (!provider) return
      if (provider.category !== 'model') {
        setTestResult({ success: false, message: '目前仅支持测试聊天模型连接' })
        return
      }
      if (!config.apiKey && !apiKeyOptional) {
        setTestResult({ success: false, message: '请先填写访问密钥' })
        return
      }
      if (!config.model) {
        setTestResult({ success: false, message: '请选择模型' })
        return
      }

      const result = await settingsApi.testLLM({
        api_key: config.apiKey || '',
        api_base: effectiveApiBase,
        model: config.model,
        provider: provider.id,
        temperature: config.temperature,
        timeout: config.timeout,
        max_retries: 1,
      })
      setTestResult({ success: !!result.success, message: result.message })
    } catch (e: unknown) {
      setTestResult({ success: false, message: formatApiError(e, '测试失败') })
    } finally {
      setIsTesting(false)
    }
  }

  const handleDiscoverModels = async () => {
    if (!provider || requestBusy) return
    if (!effectiveApiBase.trim()) {
      setDiscoveryError('请先填写模型服务地址。')
      return
    }
    if (!config.apiKey && !apiKeyOptional) {
      setDiscoveryError('请先填写访问密钥。')
      return
    }

    setIsDiscovering(true)
    setDiscoveryError(null)
    setTestResult(null)
    try {
      const result = await settingsApi.discoverModels({
        api_key: config.apiKey || '',
        api_base: effectiveApiBase,
        provider: provider.id,
        category: provider.category === 'embedding' ? 'embedding' : 'model',
        timeout: Math.min(60, Math.max(3, config.timeout ?? 20)),
      })
      const models = Array.from(
        new Set((result.models || []).map((model) => String(model || '').trim()).filter(Boolean))
      )
      setDiscoveredModels(models)
      if (!models.length) {
        setDiscoveryError('服务已连接，但没有返回可选模型。你仍可手动填写模型名称。')
        return
      }
      if (!config.model) {
        setConfig((current) => ({ ...current, model: models[0] }))
      }
      setModelMode('catalog')
    } catch (error: unknown) {
      setDiscoveryError(formatApiError(error, '获取模型失败，请检查密钥和服务地址。'))
    } finally {
      setIsDiscovering(false)
    }
  }

  if (!provider) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isSaving) onClose()
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto p-0 gap-0 rounded-lg border border-border shadow-lg sm:max-w-[550px]">
        {/* 头部 */}
        <div className="flex items-start gap-3 border-b border-border bg-muted/30 px-4 py-4 sm:px-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
            <ProviderIcon providerId={provider.id} className="size-8 object-contain" />
          </div>
          <div>
            <DialogTitle className="mb-1 text-base font-semibold text-foreground sm:text-lg">
              配置 {provider.name}
            </DialogTitle>
            <DialogDescription className="text-xs leading-5 text-muted-foreground sm:text-sm">
              {provider.description}
            </DialogDescription>
          </div>
        </div>

        <div className="space-y-5 px-4 py-4 sm:px-5">
          {/* 访问密钥 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor={apiKeyId} className="text-sm font-medium text-foreground">
                访问密钥 {!apiKeyOptional && <span className="ml-1 text-destructive">*</span>}
              </Label>
              <a
                href={getProviderDocsUrl(provider.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-primary hover:underline"
              >
                获取密钥 <span aria-hidden>→</span>
              </a>
            </div>
            <div className="relative">
              <Input
                id={apiKeyId}
                type={showApiKey ? 'text' : 'password'}
                value={config.apiKey}
                onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                placeholder={apiKeyOptional ? '本地服务可留空' : `输入 ${provider.name} 访问密钥`}
                className="pr-10 font-mono"
                autoComplete="new-password"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                aria-label={showApiKey ? '隐藏访问密钥' : '显示访问密钥'}
                title={showApiKey ? '隐藏访问密钥' : '显示访问密钥'}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors motion-reduce:transition-none focus-ring"
              >
                {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {/* 服务地址 */}
          <div className="space-y-2">
            <Label htmlFor={apiBaseId} className="text-sm font-medium text-foreground">
              服务地址
            </Label>
            <Input
              id={apiBaseId}
              type="url"
              value={config.apiBase}
              onChange={(e) => {
                setConfig({ ...config, apiBase: e.target.value })
                setDiscoveredModels([])
                setDiscoveryError(null)
              }}
              placeholder="https://api.example.com/v1"
              className="font-mono"
              autoComplete="url"
              spellCheck={false}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              支持供应商地址、Ollama、vLLM、LM Studio 等 OpenAI 兼容服务。
            </p>
          </div>

          {/* 模型 */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor={modelId} className="text-sm font-medium text-foreground">
                模型
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 text-xs"
                onClick={handleDiscoverModels}
                disabled={requestBusy || !effectiveApiBase.trim()}
              >
                <RefreshCw
                  className={cn('mr-1.5 size-3.5', isDiscovering && 'animate-spin')}
                  aria-hidden="true"
                />
                {isDiscovering ? '正在获取' : '获取模型'}
              </Button>
            </div>

            <div
              className="grid grid-cols-2 rounded-md bg-muted p-1"
              role="radiogroup"
              aria-label="模型填写方式"
            >
              <button
                type="button"
                role="radio"
                aria-checked={modelMode === 'catalog'}
                className={cn(
                  'h-8 rounded-md px-3 text-xs font-medium transition-colors focus-ring',
                  modelMode === 'catalog'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setModelMode('catalog')}
                disabled={requestBusy}
              >
                从服务选择
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={modelMode === 'manual'}
                className={cn(
                  'h-8 rounded-md px-3 text-xs font-medium transition-colors focus-ring',
                  modelMode === 'manual'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setModelMode('manual')}
                disabled={requestBusy}
              >
                手动填写
              </button>
            </div>

            {modelMode === 'catalog' ? (
              <Popover open={modelPickerOpen} onOpenChange={setModelPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id={modelId}
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={modelPickerOpen}
                    className="h-10 w-full min-w-0 justify-between px-3 font-normal"
                    disabled={requestBusy || modelOptions.length === 0}
                  >
                    <span className="truncate">{config.model || '选择模型'}</span>
                    <ChevronsUpDown className="ml-2 size-4 shrink-0 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[var(--radix-popover-trigger-width)] p-0"
                  align="start"
                >
                  <Command>
                    <CommandInput placeholder="搜索模型" />
                    <CommandList>
                      <CommandEmpty>没有匹配的模型</CommandEmpty>
                      {modelOptions.map((model) => (
                        <CommandItem
                          key={model}
                          value={model}
                          onSelect={() => {
                            setConfig((current) => ({ ...current, model }))
                            setModelPickerOpen(false)
                          }}
                          className="gap-2"
                        >
                          <Check
                            className={cn(
                              'size-4 shrink-0',
                              config.model === model ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          <span className="min-w-0 truncate">{model}</span>
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            ) : (
              <Input
                id={modelId}
                value={config.model || ''}
                onChange={(event) => setConfig({ ...config, model: event.target.value })}
                placeholder="例如：qwen3:8b"
                className="font-mono"
                disabled={requestBusy}
                autoComplete="off"
                spellCheck={false}
              />
            )}

            {modelMode === 'catalog' && modelOptions.length === 0 && !discoveryError ? (
              <p className="text-xs leading-5 text-muted-foreground">
                点击“获取模型”读取服务中的最新模型，也可以切换为手动填写。
              </p>
            ) : null}
            {discoveryError ? (
              <p className="text-xs leading-5 text-destructive" role="alert">
                {discoveryError}
              </p>
            ) : null}
          </div>

          {provider.category === 'model' ? (
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors motion-reduce:transition-none group"
              >
                <ChevronRight
                  className={cn('size-4 transition-transform', showAdvanced && 'rotate-90')}
                />
                高级设置
              </button>

              {showAdvanced ? (
                <div className="mt-4 motion-safe:animate-in motion-safe:slide-in-from-top-2 motion-safe:duration-200">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor={temperatureId}
                      className="text-xs font-medium text-muted-foreground"
                    >
                      随机度
                    </Label>
                    <Input
                      id={temperatureId}
                      type="number"
                      step="0.1"
                      min="0"
                      max="2"
                      value={config.temperature}
                      onChange={(e) =>
                        setConfig({ ...config, temperature: Number.parseFloat(e.target.value) })
                      }
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* 测试结果 */}
          {testResult && (
            <Alert
              variant={testResult.success ? 'success' : 'destructive'}
              className="animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none"
            >
              {testResult.success ? (
                <CheckCircle2 className="size-5" />
              ) : (
                <AlertCircle className="size-5" />
              )}
              <div>
                <AlertDescription className="text-foreground font-medium">
                  {testResult.message}
                </AlertDescription>
              </div>
            </Alert>
          )}

          {saveError ? (
            <Alert variant="destructive">
              <AlertCircle className="size-5" aria-hidden="true" />
              <AlertDescription className="font-medium text-foreground">
                {saveError}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter className="border-t border-border bg-background p-4 pt-3 sm:px-5">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:gap-3">
            {provider.category === 'model' ? (
              <Button
                variant="outline"
                onClick={handleTest}
                disabled={!canSubmit || requestBusy}
                className="h-10 flex-1 rounded-md"
              >
                {isTesting ? (
                  <span className="animate-pulse motion-reduce:animate-none">测试中...</span>
                ) : (
                  <>
                    <FlaskConical className="mr-2 size-4" aria-hidden="true" />
                    测试连接
                  </>
                )}
              </Button>
            ) : null}
            <Button
              onClick={handleSave}
              disabled={!canSubmit || requestBusy}
              className="h-10 flex-1 rounded-md"
            >
              {isSaving ? (
                <Loader2
                  className="mr-2 size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <Save className="mr-2 size-4" aria-hidden="true" />
              )}
              {isSaving ? '保存中…' : '保存配置'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function getProviderDocsUrl(providerId: string): string {
  const urls: Record<string, string> = {
    openai: 'https://platform.openai.com/api-keys',
    deepseek: 'https://platform.deepseek.com/',
    zhipu: 'https://open.bigmodel.cn/',
    qwen: 'https://dashscope.console.aliyun.com/',
    'qwen-embedding': 'https://dashscope.console.aliyun.com/',
    moonshot: 'https://platform.moonshot.cn/',
    ollama: 'https://ollama.ai/',
    ark: 'https://console.volcengine.com/ark',
    lingyiwanwu: 'https://platform.lingyiwanwu.com/',
    qianfan: 'https://console.bce.baidu.com/qianfan/',
    siliconflow: 'https://cloud.siliconflow.cn/',
    openrouter: 'https://openrouter.ai/keys',
    together: 'https://api.together.xyz/',
    custom: 'https://platform.openai.com/docs/api-reference/models',
    'custom-embedding': 'https://platform.openai.com/docs/api-reference/models',
  }
  return urls[providerId] || '#'
}
