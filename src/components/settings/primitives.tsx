import type { ReactNode } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { Field, FieldDescription, FieldTitle } from '~/components/ui/field';
import { Separator } from '~/components/ui/separator';

/** Page-level title + description shown at the top of each settings page. */
export function SettingsPageHeader({
  title,
  description,
}: {
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">{title}</h1>
      {description && (
        <p className="text-muted-foreground text-sm">{description}</p>
      )}
    </div>
  );
}

/** A titled Card wrapping a group of setting rows. */
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-1">{children}</CardContent>
    </Card>
  );
}

/** A horizontal row: label + description on the left, control on the right. */
export function SettingRow({
  label,
  description,
  control,
}: {
  label: ReactNode;
  description?: ReactNode;
  control: ReactNode;
}) {
  return (
    <Field orientation="horizontal" className="items-start gap-4">
      <div className="flex-1 min-w-0">
        <FieldTitle>{label}</FieldTitle>
        {description && (
          <FieldDescription className="mt-0.5">{description}</FieldDescription>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </Field>
  );
}

/** Thin separator between rows inside a SettingsSection. */
export function RowSep() {
  return <Separator className="my-1" />;
}
