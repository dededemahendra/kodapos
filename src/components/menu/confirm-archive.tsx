import type { ReactNode } from 'react';
import { Trans } from '@lingui/react/macro';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '~/components/ui/alert-dialog';

export interface ConfirmArchiveProps {
  /** What to call the thing being archived, in Bahasa (e.g., "kategori", "item"). */
  noun: string;
  /** Inline name of the specific row, used in the description ("Arsipkan 'Kopi Senja'?"). */
  name: string;
  /** Element the user clicks to open the dialog (the inline "Arsipkan" link/button). */
  trigger: ReactNode;
  /** Called when the user confirms. The mutation runs here. */
  onConfirm: () => unknown | Promise<unknown>;
}

export function ConfirmArchive({ noun, name, trigger, onConfirm }: ConfirmArchiveProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle><Trans>Arsipkan {noun}?</Trans></AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>"{name}" akan disembunyikan dari daftar aktif. Bisa dipulihkan dari tampilan arsip.</Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel><Trans>Batal</Trans></AlertDialogCancel>
          <AlertDialogAction onClick={() => void onConfirm()}><Trans>Arsipkan</Trans></AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
