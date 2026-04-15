import * as React from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CheckboxProps
  extends Omit<React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>, 'onCheckedChange'> {
  label?: string
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<React.ElementRef<typeof CheckboxPrimitive.Root>, CheckboxProps>(
  ({ className, label, id, onCheckedChange, ...props }, ref) => {
    const generatedId = React.useId()
    const checkboxId = id ?? generatedId

    return (
      <label htmlFor={checkboxId} className={cn('inline-flex items-center gap-2 cursor-pointer', className)}>
        <CheckboxPrimitive.Root
          ref={ref}
          id={checkboxId}
          className="peer h-5 w-5 shrink-0 rounded border-2 border-gray-400 bg-white text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-500 dark:bg-gray-900 data-[state=checked]:border-indigo-600 data-[state=checked]:bg-indigo-600"
          onCheckedChange={(checked) => onCheckedChange?.(checked === true)}
          {...props}
        >
          <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
            <Check className="h-4 w-4" />
          </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
        {label && <span className="text-sm text-gray-900 dark:text-gray-100">{label}</span>}
      </label>
    )
  }
)

Checkbox.displayName = 'Checkbox'

export { Checkbox }
