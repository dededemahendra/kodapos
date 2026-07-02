import { Link, useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation } from 'convex/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { ListChecks, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import { OnboardingStepHeader } from '~/components/onboarding/step-header';
import { Button } from '~/components/ui/button';

export function MenuStep() {
  const { t } = useLingui();
  const markComplete = useMutation(api.cafes.markSetupComplete);
  const navigate = useNavigate();

  async function finish(target: '/menu' | '/menu/categories') {
    // markComplete requires an active outlet; a cafe-less user who reached this
    // step via a direct URL would otherwise hit an unhandled rejection.
    try {
      await markComplete();
      navigate({ to: target });
    } catch (err) {
      console.error('Onboarding finish failed', err);
      toast.error(t`Tidak dapat menyelesaikan penyiapan. Coba lagi.`);
    }
  }

  return (
    <>
      <OnboardingStepHeader
        icon={<UtensilsCrossed />}
        title={<Trans>Susun menu kafe</Trans>}
        description={
          <Trans>
            Buat kategori, tambah item, dan kelompokkan modifier yang bisa dipakai ulang. Bisa
            diselesaikan sekarang atau dilanjutkan kapan pun lewat menu utama.
          </Trans>
        }
      />
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <ListChecks className="size-4 text-muted-foreground" />
          <Trans>Langkah singkat</Trans>
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li><Trans>Buat 2-3 kategori (Kopi, Non-Kopi, Makanan).</Trans></li>
          <li><Trans>Tambahkan beberapa item beserta harganya.</Trans></li>
          <li><Trans>Buat grup modifier (mis. Ukuran) dan pasang ke item.</Trans></li>
        </ol>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={() => finish('/menu/categories')}>
          <Trans>Mulai dengan kategori →</Trans>
        </Button>
        <Button asChild variant="outline">
          <Link to="/onboarding/cashier"><Trans>Lanjut: PIN & Kasir →</Trans></Link>
        </Button>
        <Button variant="ghost" onClick={() => finish('/menu')}>
          <Trans>Selesaikan nanti</Trans>
        </Button>
      </div>
      <div className="mt-4">
        <Button asChild variant="ghost" className="text-muted-foreground">
          <Link to="/onboarding/profile"><Trans>← Kembali</Trans></Link>
        </Button>
      </div>
    </>
  );
}
