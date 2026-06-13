import { Coffee } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardContent } from '~/components/ui/card';

export interface AuthCardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}

/**
 * A centered auth card on a soft background with the kodapos brand header.
 * Reused by signin and signup.
 */
export function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <main className="min-h-screen grid place-items-center bg-muted/30 p-4 sm:p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Coffee className="size-5" aria-hidden="true" />
          </span>
          <span className="text-xl font-bold tracking-tight">kodapos</span>
        </div>
        <Card>
          <CardContent className="p-6">
            {(title || subtitle) && (
              <div className="mb-6 space-y-1 text-center">
                {title && <h1 className="text-xl font-semibold tracking-tight">{title}</h1>}
                {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
              </div>
            )}
            {children}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
