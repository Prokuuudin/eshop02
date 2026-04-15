'use client'

import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type ConfirmActionDialogProps = {
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  trigger: React.ReactElement
}

export default function ConfirmActionDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  trigger
}: ConfirmActionDialogProps) {
  const [open, setOpen] = React.useState(false)

  const handleConfirm = (): void => {
    onConfirm()
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {cancelLabel}
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
