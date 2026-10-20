import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer active:scale-[0.98]',
  {
    variants: {
      variant: {
        default:
          'bg-blue-600 text-white shadow-md hover:bg-blue-700 shadow-blue-500/20 border border-blue-500/40',
        destructive:
          'bg-red-600 text-white shadow-sm hover:bg-red-700 border border-red-500/40',
        outline:
          'border border-slate-700/80 bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-white',
        secondary:
          'bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700/50',
        ghost:
          'hover:bg-slate-800/80 text-slate-300 hover:text-white',
        link: 'text-blue-400 underline-offset-4 hover:underline p-0 h-auto',
        success:
          'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 border border-emerald-500/40',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-12 rounded-xl px-8 text-base',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
