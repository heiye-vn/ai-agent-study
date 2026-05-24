import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'premium';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        className={cn(
          'focus-visible:ring-primary/50 inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200 focus-visible:ring-2 focus-visible:outline-none active:scale-95 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
          // Variants
          variant === 'default' &&
            'bg-primary text-primary-foreground shadow-sm hover:brightness-105',
          variant === 'destructive' && 'bg-red-500 text-white shadow-sm hover:bg-red-600',
          variant === 'outline' &&
            'border-border bg-background hover:bg-muted/50 hover:text-foreground border shadow-sm',
          variant === 'secondary' && 'bg-muted text-foreground hover:bg-muted/80 shadow-sm',
          variant === 'ghost' && 'hover:bg-muted hover:text-foreground',
          variant === 'link' && 'text-primary underline-offset-4 hover:underline',
          variant === 'premium' &&
            'bg-linear-to-r from-purple-500 to-indigo-600 text-white shadow-md shadow-purple-500/10 hover:from-purple-600 hover:to-indigo-700 hover:shadow-lg',
          // Sizes
          size === 'default' && 'h-10 px-4 py-2',
          size === 'sm' && 'h-8 rounded-md px-3 text-xs',
          size === 'lg' && 'h-11 rounded-lg px-8 text-base',
          size === 'icon' && 'h-10 w-10 rounded-lg',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button };
