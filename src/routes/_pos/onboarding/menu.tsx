import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation } from 'convex/react';
import { Trans } from '@lingui/react/macro';
import { ListChecks, UtensilsCrossed } from 'lucide-react';
import { OnboardingStepHeader } from '~/components/onboarding/step-header';
import { Button } from '~/components/ui/button';

export const Route = createFileRoute('/_pos/onboarding/menu')({
  component: OnboardingMenu,
});

function OnboardingMenu() {
  const markComplete = useMutation(api.cafes.markSetupComplete);
  const navigate = useNavigate();

  async function finish(target: '/menu' | '/menu/categories') {
    await markComplete();
    navigate({ to: target });
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
        <Button asChild variant="ghost" className="px-0 text-muted-foreground">
          <Link to="/onboarding/profile"><Trans>← Kembali</Trans></Link>
        </Button>
      </div>
    </>
  );
}
