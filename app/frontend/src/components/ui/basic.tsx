// shadcn/ui 的小型元件(Input、Textarea、Label、Badge、Separator、Switch、Checkbox)集中在此檔。
import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import * as SeparatorPrimitive from '@radix-ui/react-separator'
import * as SwitchPrimitives from '@radix-ui/react-switch'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import {cva, type VariantProps} from 'class-variance-authority'
import {Check} from 'lucide-react'
import {cn} from '@/lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(({className, type, ...props}, ref) => (
    <input type={type} ref={ref}
           className={cn('flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', className)}
           {...props}/>
))
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(({className, ...props}, ref) => (
    <textarea ref={ref}
              className={cn('flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', className)}
              {...props}/>
))
Textarea.displayName = 'Textarea'

export const Label = React.forwardRef<React.ElementRef<typeof LabelPrimitive.Root>, React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>>(
    ({className, ...props}, ref) => (
        <LabelPrimitive.Root ref={ref} className={cn('text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', className)} {...props}/>
    ))
Label.displayName = LabelPrimitive.Root.displayName

const badgeVariants = cva(
    'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
    {
        variants: {
            variant: {
                default: 'border-transparent bg-primary text-primary-foreground',
                secondary: 'border-transparent bg-secondary text-secondary-foreground',
                outline: 'text-foreground',
                warning: 'border-warning/40 bg-warning/15 text-warning',
                success: 'border-success/40 bg-success/15 text-success',
            },
        },
        defaultVariants: {variant: 'default'},
    },
)

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({className, variant, ...props}: BadgeProps) {
    return <div className={cn(badgeVariants({variant}), className)} {...props}/>
}

export const Separator = React.forwardRef<React.ElementRef<typeof SeparatorPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>>(
    ({className, orientation = 'horizontal', decorative = true, ...props}, ref) => (
        <SeparatorPrimitive.Root ref={ref} decorative={decorative} orientation={orientation}
                                 className={cn('shrink-0 bg-border', orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]', className)} {...props}/>
    ))
Separator.displayName = SeparatorPrimitive.Root.displayName

export const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitives.Root>, React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>>(
    ({className, ...props}, ref) => (
        <SwitchPrimitives.Root ref={ref}
                               className={cn('peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input', className)}
                               {...props}>
            <SwitchPrimitives.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"/>
        </SwitchPrimitives.Root>
    ))
Switch.displayName = SwitchPrimitives.Root.displayName

export const Checkbox = React.forwardRef<React.ElementRef<typeof CheckboxPrimitive.Root>, React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>>(
    ({className, ...props}, ref) => (
        <CheckboxPrimitive.Root ref={ref}
                                className={cn('peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground', className)}
                                {...props}>
            <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
                <Check className="h-3.5 w-3.5"/>
            </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
    ))
Checkbox.displayName = CheckboxPrimitive.Root.displayName
