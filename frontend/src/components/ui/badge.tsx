import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border border-blue-500/30 bg-blue-500/15 text-blue-400',
        secondary:
          'border border-slate-700 bg-slate-800 text-slate-300',
        destructive:
          'border border-red-500/30 bg-red-500/15 text-red-400',
        outline: 'border border-slate-700 text-slate-400',
        success:
          'border border-emerald-500/30 bg-emerald-500/15 text-emerald-400',
        warning:
          'border border-amber-500/30 bg-amber-500/15 text-amber-400',
        purple:
          'border border-purple-500/30 bg-purple-500/15 text-purple-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
