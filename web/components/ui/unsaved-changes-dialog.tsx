'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type UnsavedChangesDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDiscard: () => void
  title?: string
  description?: string
}

export function UnsavedChangesDialog({
  open,
  onOpenChange,
  onDiscard,
  title = '放弃未保存的修改？',
  description = '当前修改尚未保存。继续后，这些修改将丢失。',
}: Readonly<UnsavedChangesDialogProps>) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>继续编辑</AlertDialogCancel>
          <AlertDialogAction onClick={onDiscard}>放弃修改</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
