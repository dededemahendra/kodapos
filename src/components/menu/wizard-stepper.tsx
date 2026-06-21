import { Check } from 'lucide-react';
import { cn } from '~/lib/utils';

export interface WizardStep {
  label: string;
  enabled: boolean;
}

export interface WizardStepperProps {
  steps: ReadonlyArray<WizardStep>;
  currentIndex: number;
  className?: string;
}

export function WizardStepper({ steps, currentIndex, className }: WizardStepperProps) {
  return (
    <ol className={cn('flex items-center', className)} aria-label="Setup progress">
      {steps.map((step, i) => {
        const isCurrent = i === currentIndex;
        const isDone = i < currentIndex;
        const isEnabled = step.enabled;
        const isLast = i === steps.length - 1;
        return (
          <li
            key={step.label}
            className={cn('flex items-center', !isLast && 'flex-1')}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
                  isDone && 'border-primary bg-primary text-primary-foreground',
                  isCurrent &&
                    'border-primary bg-primary text-primary-foreground ring-4 ring-primary/10',
                  !isCurrent && !isDone && isEnabled && 'border-border bg-background text-muted-foreground',
                  !isEnabled && 'border-dashed border-border bg-muted text-muted-foreground/50'
                )}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {isDone ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  'hidden text-sm font-medium sm:inline',
                  isCurrent
                    ? 'text-foreground'
                    : isEnabled
                      ? 'text-muted-foreground'
                      : 'text-muted-foreground/50'
                )}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <span
                className={cn('mx-3 h-px flex-1', isDone ? 'bg-primary' : 'bg-border')}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
