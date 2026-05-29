import { Trans } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { useLocale } from '~/components/locale-provider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { type Locale, LOCALES } from '~/lib/locale';

export const Route = createFileRoute('/_pos/settings/language')({
  component: LanguageSettings,
});

function LanguageSettings() {
  const { locale, setLocale } = useLocale();
  return (
    <div className="max-w-sm space-y-2">
      <h3 className="font-semibold text-base">
        <Trans>Bahasa</Trans>
      </h3>
      <p className="text-muted-foreground text-sm">
        <Trans>Pilih bahasa tampilan kasir.</Trans>
      </p>
      <Select onValueChange={(v) => setLocale(v as Locale)} value={locale}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LOCALES.map((l) => (
            <SelectItem key={l.value} value={l.value}>
              {l.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
