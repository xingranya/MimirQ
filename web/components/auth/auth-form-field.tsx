import type { LucideIcon } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function AuthFormField({
  id,
  label,
  type = 'text',
  placeholder,
  autoComplete,
  icon: Icon,
  value,
  minLength,
  maxLength,
  onChange,
}: Readonly<{
  id: string
  label: string
  type?: 'text' | 'email' | 'password'
  placeholder: string
  autoComplete: string
  icon: LucideIcon
  value: string
  minLength?: number
  maxLength?: number
  onChange: (value: string) => void
}>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <div className="relative">
        <Icon
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id={id}
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="h-10 rounded-md bg-background pl-10"
          value={value}
          minLength={minLength}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          required
        />
      </div>
    </div>
  )
}
