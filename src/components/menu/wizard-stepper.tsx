import { cn } from '~/lib/utils';

export interface WizardStep {
  label: string;
  enabled: boolean;
}

export interface WizardStepperProps {
  steps: ReadonlyArray<WizardStep>;
  currentIndex: number;
}

export function WizardStepper({ steps, currentIndex }: WizardStepperProps) {
  return (
    <ol className="flex items-center gap-2 text-xs mb-6" aria-label="Setup progress">
      {steps.map((step, i) => {
        const isCurrent = i === currentIndex;
        const isDone = i < currentIndex;
        const isEnabled = step.enabled;
        return (
          <li key={step.label} className="flex items-center gap-2 flex-1 last:flex-none">
            <span
              className={cn(
                'inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium',
                isDone && 'bg-primary text-white',
                isCurrent && 'bg-primary text-white',
                !isCurrent && !isDone && isEnabled && 'bg-muted text-muted-foreground',
                !isEnabled && 'bg-muted text-muted-foreground/50'
              )}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {i + 1}
            </span>
            <span
              className={cn(
                'font-medium',
                isCurrent && 'text-foreground',
                !isCurrent && isEnabled && 'text-muted-foreground',
                !isEnabled && 'text-muted-foreground/50'
              )}
            >
              {step.label}
            </span>
            {i < steps.length - 1 && (
              <span
                className={cn('flex-1 h-px', isDone ? 'bg-primary' : 'bg-border')}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
