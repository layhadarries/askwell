import type { ComponentPropsWithoutRef } from 'react';

export function GlassPanel({ className = '', ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={`rounded-lg border border-glass-border bg-glass p-4 text-fg shadow-md backdrop-blur-md sm:p-6 ${className}`}
      {...props}
    />
  );
}
