// shadcn/ui 的浮層元件(Dialog、DropdownMenu、Select、Tooltip、Popover、Tabs、ScrollArea)。
import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import * as SelectPrimitive from '@radix-ui/react-select'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'
import {Check, ChevronDown, ChevronRight, ChevronUp, X} from 'lucide-react'
import {cn} from '@/lib/utils'

// ---- Dialog ----
export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>>(
    ({className, children, ...props}, ref) => (
        <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"/>
            <DialogPrimitive.Content ref={ref}
                                     className={cn('fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-card p-6 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 rounded-xl', className)}
                                     {...props}>
                {children}
                <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring">
                    <X className="h-4 w-4"/>
                    <span className="sr-only">關閉</span>
                </DialogPrimitive.Close>
            </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
    ))
DialogContent.displayName = DialogPrimitive.Content.displayName

export const DialogHeader = ({className, ...props}: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={cn('flex flex-col space-y-1.5 text-left', className)} {...props}/>
)
export const DialogFooter = ({className, ...props}: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={cn('flex flex-row justify-end gap-2', className)} {...props}/>
)
export const DialogTitle = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Title>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(
    ({className, ...props}, ref) => <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props}/>)
DialogTitle.displayName = DialogPrimitive.Title.displayName
export const DialogDescription = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Description>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>>(
    ({className, ...props}, ref) => <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props}/>)
DialogDescription.displayName = DialogPrimitive.Description.displayName

// ---- DropdownMenu ----
export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
export const DropdownMenuSub = DropdownMenuPrimitive.Sub

const menuContent = 'z-50 min-w-[9rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
const menuItem = 'relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0'

export const DropdownMenuContent = React.forwardRef<React.ElementRef<typeof DropdownMenuPrimitive.Content>, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>>(
    ({className, sideOffset = 4, ...props}, ref) => (
        <DropdownMenuPrimitive.Portal>
            <DropdownMenuPrimitive.Content ref={ref} sideOffset={sideOffset} className={cn(menuContent, className)} {...props}/>
        </DropdownMenuPrimitive.Portal>
    ))
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

export const DropdownMenuItem = React.forwardRef<React.ElementRef<typeof DropdownMenuPrimitive.Item>, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>>(
    ({className, ...props}, ref) => <DropdownMenuPrimitive.Item ref={ref} className={cn(menuItem, className)} {...props}/>)
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName

export const DropdownMenuSubTrigger = React.forwardRef<React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger>>(
    ({className, children, ...props}, ref) => (
        <DropdownMenuPrimitive.SubTrigger ref={ref} className={cn(menuItem, 'data-[state=open]:bg-accent', className)} {...props}>
            {children}
            <ChevronRight className="ml-auto"/>
        </DropdownMenuPrimitive.SubTrigger>
    ))
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName

export const DropdownMenuSubContent = React.forwardRef<React.ElementRef<typeof DropdownMenuPrimitive.SubContent>, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>>(
    ({className, ...props}, ref) => (
        <DropdownMenuPrimitive.Portal>
            <DropdownMenuPrimitive.SubContent ref={ref} className={cn(menuContent, className)} {...props}/>
        </DropdownMenuPrimitive.Portal>
    ))
DropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName

export const DropdownMenuLabel = ({className, ...props}: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={cn('px-2 py-1.5 text-xs font-medium text-muted-foreground', className)} {...props}/>
)
export const DropdownMenuSeparator = React.forwardRef<React.ElementRef<typeof DropdownMenuPrimitive.Separator>, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>>(
    ({className, ...props}, ref) => <DropdownMenuPrimitive.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-border', className)} {...props}/>)
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName

// ---- Select ----
export const Select = SelectPrimitive.Root
export const SelectValue = SelectPrimitive.Value

export const SelectTrigger = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>>(
    ({className, children, ...props}, ref) => (
        <SelectPrimitive.Trigger ref={ref}
                                 className={cn('flex h-9 w-full items-center justify-between gap-2 whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1 [&>span]:text-left', className)}
                                 {...props}>
            {children}
            <SelectPrimitive.Icon asChild><ChevronDown className="h-4 w-4 opacity-50"/></SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
    ))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

export const SelectContent = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Content>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>>(
    ({className, children, position = 'popper', ...props}, ref) => (
        <SelectPrimitive.Portal>
            <SelectPrimitive.Content ref={ref} position={position}
                                     className={cn('relative z-[60] max-h-80 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
                                         position === 'popper' && 'data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1', className)}
                                     {...props}>
                <SelectPrimitive.ScrollUpButton className="flex cursor-default items-center justify-center py-1"><ChevronUp className="h-4 w-4"/></SelectPrimitive.ScrollUpButton>
                <SelectPrimitive.Viewport className={cn('p-1', position === 'popper' && 'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]')}>
                    {children}
                </SelectPrimitive.Viewport>
                <SelectPrimitive.ScrollDownButton className="flex cursor-default items-center justify-center py-1"><ChevronDown className="h-4 w-4"/></SelectPrimitive.ScrollDownButton>
            </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
    ))
SelectContent.displayName = SelectPrimitive.Content.displayName

export const SelectItem = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Item>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>>(
    ({className, children, ...props}, ref) => (
        <SelectPrimitive.Item ref={ref}
                              className={cn('relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50', className)}
                              {...props}>
            <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
                <SelectPrimitive.ItemIndicator><Check className="h-4 w-4"/></SelectPrimitive.ItemIndicator>
            </span>
            <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
        </SelectPrimitive.Item>
    ))
SelectItem.displayName = SelectPrimitive.Item.displayName

// ---- Tooltip ----
export const TooltipProvider = TooltipPrimitive.Provider
export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger
export const TooltipContent = React.forwardRef<React.ElementRef<typeof TooltipPrimitive.Content>, React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>>(
    ({className, sideOffset = 6, ...props}, ref) => (
        <TooltipPrimitive.Portal>
            <TooltipPrimitive.Content ref={ref} sideOffset={sideOffset}
                                      className={cn('z-[70] overflow-hidden rounded-md bg-foreground px-2.5 py-1 text-xs text-background animate-in fade-in-0 zoom-in-95', className)}
                                      {...props}/>
        </TooltipPrimitive.Portal>
    ))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

/** 有提示文字的圖示按鈕外框 */
export function Tip({label, side = 'right', children}: {label: string; side?: 'top' | 'right' | 'bottom' | 'left'; children: React.ReactNode}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent side={side}>{label}</TooltipContent>
        </Tooltip>
    )
}

// ---- Popover ----
export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export const PopoverContent = React.forwardRef<React.ElementRef<typeof PopoverPrimitive.Content>, React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>>(
    ({className, align = 'center', sideOffset = 4, ...props}, ref) => (
        <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content ref={ref} align={align} sideOffset={sideOffset}
                                      className={cn('z-[60] w-72 rounded-md border bg-popover p-3 text-popover-foreground shadow-lg outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0', className)}
                                      {...props}/>
        </PopoverPrimitive.Portal>
    ))
PopoverContent.displayName = PopoverPrimitive.Content.displayName

// ---- Tabs ----
export const Tabs = TabsPrimitive.Root
export const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(
    ({className, ...props}, ref) => (
        <TabsPrimitive.List ref={ref} className={cn('inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground', className)} {...props}/>
    ))
TabsList.displayName = TabsPrimitive.List.displayName
export const TabsTrigger = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(
    ({className, ...props}, ref) => (
        <TabsPrimitive.Trigger ref={ref}
                               className={cn('inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow', className)}
                               {...props}/>
    ))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName
export const TabsContent = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Content>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(
    ({className, ...props}, ref) => <TabsPrimitive.Content ref={ref} className={cn('mt-3 focus-visible:outline-none', className)} {...props}/>)
TabsContent.displayName = TabsPrimitive.Content.displayName

// ---- ScrollArea ----
export const ScrollArea = React.forwardRef<React.ElementRef<typeof ScrollAreaPrimitive.Root>, React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>>(
    ({className, children, ...props}, ref) => (
        <ScrollAreaPrimitive.Root ref={ref} className={cn('relative overflow-hidden', className)} {...props}>
            <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit] [&>div]:!block">{children}</ScrollAreaPrimitive.Viewport>
            <ScrollAreaPrimitive.ScrollAreaScrollbar orientation="vertical" className="flex h-full w-2 touch-none select-none border-l border-l-transparent p-[1px] transition-colors">
                <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border"/>
            </ScrollAreaPrimitive.ScrollAreaScrollbar>
            <ScrollAreaPrimitive.Corner/>
        </ScrollAreaPrimitive.Root>
    ))
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName
