import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const alertVariants = cva(
  'relative w-full rounded-xl border p-4 text-sm [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-slate-200',
  {
    variants: {
      variant: {
        default: 'bg-slate-900/80 border-slate-800 text-slate-200',
        destructive:
          'border-red-900/50 bg-red-950/40 text-red-300 dark:border-red-900 [&>svg]:text-red-400',
        warning:
          'border-amber-900/50 bg-amber-950/40 text-amber-300 [&>svg]:text-amber-400',
        info: 'border-blue-900/50 bg-blue-950/40 text-blue-300 [&>svg]:text-blue-400',
        success:
          'border-emerald-900/50 bg-emerald-950/40 text-emerald-300 [&>svg]:text-emerald-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
))
Alert.displayName = 'Alert'

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn('mb-1 font-semibold leading-none tracking-tight text-white', className)}
    {...props}
  />
))
AlertTitle.displayName = 'AlertTitle'

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-xs [&_p]:leading-relaxed text-slate-400', className)}
    {...props}
  />
))
AlertDescription.displayName = 'AlertDescription'

export { Alert, AlertTitle, AlertDescription }
