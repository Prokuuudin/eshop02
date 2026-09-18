"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

const TooltipProvider = ({ delayDuration = 200, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>): React.ReactElement => (
  <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />
)

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-dropdown max-w-xs break-words rounded-md border border-border bg-card px-3 py-1.5 text-center text-xs font-normal leading-relaxed text-foreground shadow-md duration-150 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-[state=delayed-open]:ease-out data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:ease-in",
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

function Hint({ content, children }: { content?: string; children: React.ReactElement }): React.ReactElement {
  if (!content) return children

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent>{content}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, Hint }
