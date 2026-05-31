import * as React from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

// App-wide toast surface. Mounted once in the POS layout. The app uses a
// light-by-default tweakcn theme with a `.dark` variant and no next-themes,
// so we let sonner follow the OS via theme="system" and map its surface
// colors to our CSS tokens so toasts match popovers/borders everywhere.
export function Toaster({ style, ...props }: ToasterProps) {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          ...style,
        } as React.CSSProperties
      }
      {...props}
    />
  );
}
