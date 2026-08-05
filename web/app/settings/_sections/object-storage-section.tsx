'use client'

import { SettingsSwitch } from '@/components/settings/settings-switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { settingsTextTokens } from '@/components/ui/system-page-tokens'
import type { SystemSettings } from '@/lib/api'
import { getObjectStorageEnabledPatch } from '@/lib/object-storage-settings'
import { Archive, FileText, ImageIcon, LockKeyhole, Server } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type MinIOSettings = NonNullable<SystemSettings['minio']>

type ObjectStorageSectionProps = {
  minio: MinIOSettings
  updateMinIO: (patch: Partial<MinIOSettings>) => void
}

const STORAGE_INPUT = 'h-9 rounded-md border-border bg-background text-sm'

function StorageCard({
  icon: Icon,
  title,
  description,
  action,
  children,
}: Readonly<{
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
  children?: ReactNode
}>) {
  return (
    <div className="min-w-0 border-b border-border py-4 xl:px-4 xl:[&:nth-child(odd)]:border-r">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-primary">
            <Icon className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">
              {title}
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
        {action}
      </div>
      {children ? <div className="mt-3 space-y-3">{children}</div> : null}
    </div>
  )
}

function Field({
  id,
  label,
  children,
  hint,
}: Readonly<{ id: string; label: string; children: ReactNode; hint?: string }>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={settingsTextTokens.fieldLabel}>{label}</Label>
      {children}
      {hint ? <p className={settingsTextTokens.helpText}>{hint}</p> : null}
    </div>
  )
}

function ToggleRow({
  title,
  description,
  checked,
  onToggle,
  label,
  disabled = false,
}: Readonly<{
  title: string
  description: string
  checked: boolean
  onToggle: (checked: boolean) => void
  label: string
  disabled?: boolean
}>) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-border py-3">
      <div className="min-w-0">
        <p className={settingsTextTokens.panelTitle}>{title}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <SettingsSwitch
        checked={checked}
        onCheckedChange={onToggle}
        disabled={disabled}
        className="shrink-0"
        aria-label={label}
      />
    </div>
  )
}

export function ObjectStorageSection({
  minio,
  updateMinIO,
}: Readonly<ObjectStorageSectionProps>) {
  const isEnabled = Boolean(minio.enabled)
  const isDocumentStorageEnabled = Boolean(minio.documents_enabled)
  const isSslEnabled = Boolean(minio.use_ssl)

  return (
    <section className="grid border-t border-border xl:grid-cols-2">
      <StorageCard
        icon={Archive}
        title="对象存储开关"
        description="控制图片、解析结果和文档的对象存储。服务已启动时，仍需打开此开关。"
        action={
          <SettingsSwitch
            checked={isEnabled}
            onCheckedChange={(enabled) =>
              updateMinIO(getObjectStorageEnabledPatch(enabled))
            }
            className="shrink-0"
            aria-label="切换 MinIO 对象存储"
          />
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Field id="minio-endpoint" label="服务地址" hint="本机部署通常为 localhost:9000，容器部署通常为 mimirq-minio:9000。">
            <Input
              id="minio-endpoint"
              value={minio.endpoint}
              onChange={(event) => updateMinIO({ endpoint: event.target.value })}
              placeholder="localhost:9000"
              className={STORAGE_INPUT}
            />
          </Field>
          <Field id="minio-bucket" label="存储桶名称">
            <Input
              id="minio-bucket"
              value={minio.bucket_name}
              onChange={(event) => updateMinIO({ bucket_name: event.target.value })}
              placeholder="mimirq"
              className={STORAGE_INPUT}
            />
          </Field>
        </div>
      </StorageCard>

      <StorageCard
        icon={LockKeyhole}
        title="访问凭证"
        description="已保存的密钥会脱敏显示。保留脱敏值不会覆盖原密钥。"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Field id="minio-access-key" label="访问密钥">
            <Input
              id="minio-access-key"
              value={minio.access_key}
              onChange={(event) => updateMinIO({ access_key: event.target.value })}
              placeholder="minioadmin"
              className={STORAGE_INPUT}
            />
          </Field>
          <Field id="minio-secret-key" label="私密密钥">
            <Input
              id="minio-secret-key"
              type="password"
              value={minio.secret_key}
              onChange={(event) => updateMinIO({ secret_key: event.target.value })}
              placeholder="minioadmin"
              className={STORAGE_INPUT}
            />
          </Field>
        </div>
      </StorageCard>

      <StorageCard
        icon={Server}
        title="连接与 TLS"
        description="本地服务通常使用 HTTP，生产环境的对象存储通常需要启用 HTTPS。"
      >
        <ToggleRow
          title="使用 SSL"
          description="打开后以 HTTPS/S3 secure 模式连接 endpoint"
          checked={isSslEnabled}
          onToggle={(checked) => updateMinIO({ use_ssl: checked })}
          label="切换 MinIO SSL"
        />
      </StorageCard>

      <StorageCard
        icon={FileText}
        title="文档对象存储"
        description="启用后，文档下载、对象引用和大文件管理将使用对象存储。"
      >
        <ToggleRow
          title="存储文档对象"
          description={
            isEnabled
              ? '关闭时仍可使用本地文件路径；开启后需要存储桶可写'
              : '请先启用对象存储，再开启文档对象存储。'
          }
          checked={isDocumentStorageEnabled}
          onToggle={(checked) => updateMinIO({ documents_enabled: checked })}
          label="切换 MinIO 文档对象存储"
          disabled={!isEnabled}
        />
      </StorageCard>

      <StorageCard
        icon={ImageIcon}
        title="图片读取上限"
        description="限制单张图片的最大读取字节数，0 表示不额外限制。"
      >
        <Field id="minio-image-max-bytes" label="单张图片最大字节数">
          <Input
            id="minio-image-max-bytes"
            type="number"
            min={0}
            value={minio.image_max_bytes}
            onChange={(event) =>
              updateMinIO({
                image_max_bytes: Math.max(0, Number.parseInt(event.target.value || '0', 10)),
              })
            }
            className={STORAGE_INPUT}
          />
        </Field>
      </StorageCard>
    </section>
  )
}
