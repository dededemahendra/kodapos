import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation } from 'convex/react';
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
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Susun menu kafe</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Buat kategori, tambah item, dan kelompokkan modifier yang bisa dipakai ulang. Bisa
        diselesaikan sekarang atau dilanjutkan kapan pun lewat menu utama.
      </p>
      <div className="space-y-3 p-4 rounded-md border border-border bg-background max-w-md mb-6">
        <h2 className="font-semibold text-sm">Langkah singkat</h2>
        <ol className="list-decimal pl-5 text-sm space-y-1">
          <li>Buat 2–3 kategori (Kopi, Non-Kopi, Makanan).</li>
          <li>Tambahkan beberapa item beserta harganya.</li>
          <li>Buat grup modifier (mis. Ukuran) dan pasang ke item.</li>
        </ol>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => finish('/menu/categories')}>Mulai dengan kategori →</Button>
        <Button asChild variant="outline">
          <Link to="/onboarding/cashier">Lanjut: PIN & Kasir →</Link>
        </Button>
        <Button variant="ghost" onClick={() => finish('/menu')}>
          Selesaikan nanti
        </Button>
      </div>
      <div className="mt-4">
        <Button asChild variant="ghost">
          <Link to="/onboarding/profile">← Kembali</Link>
        </Button>
      </div>
    </div>
  );
}
