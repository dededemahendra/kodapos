import type { ReactNode } from 'react';
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
          <AlertDialogTitle>Arsipkan {noun}?</AlertDialogTitle>
          <AlertDialogDescription>
            “{name}” akan disembunyikan dari daftar aktif. Bisa dipulihkan dari tampilan arsip.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction onClick={() => void onConfirm()}>Arsipkan</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
