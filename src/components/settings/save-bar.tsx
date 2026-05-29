import { Trans } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { cn } from '~/lib/utils';

/**
 * Sticky footer shown while a settings form is dirty. Renders Cancel + Save,
 * a saving spinner, and a transient "Tersimpan ✓" confirmation after a
 * successful save. `onSave` should resolve once the mutation completes.
 */
export function SaveBar({
  dirty,
  onSave,
  onReset,
}: {
  dirty: boolean;
  onSave: () => Promise<void>;
  onReset: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);

  useEffect(() => {
    if (savedAt === 0) return;
    const id = setTimeout(() => setSavedAt(0), 2500);
    return () => clearTimeout(id);
  }, [savedAt]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave();
      setSavedAt((n) => n + 1);
    } finally {
      setSaving(false);
    }
  }

  const visible = dirty || saving || savedAt > 0;

  return (
    <div
      className={cn(
        'sticky bottom-0 mt-6 flex items-center justify-end gap-3 border-t border-border bg-background/95 py-3 backdrop-blur transition-opacity',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      )}
    >
      {savedAt > 0 && !dirty && (
        <span className="text-sm text-muted-foreground">
          <Trans>Tersimpan ✓</Trans>
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        onClick={onReset}
        disabled={!dirty || saving}
      >
        <Trans>Batal</Trans>
      </Button>
      <Button type="button" onClick={handleSave} disabled={!dirty || saving}>
        {saving && <Spinner data-icon="inline-start" />}
        <Trans>Simpan perubahan</Trans>
      </Button>
    </div>
  );
}
