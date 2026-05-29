import { Trans } from '@lingui/react/macro';
import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/_public/privacy')({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-4"><Trans>Kebijakan Privasi</Trans></h1>
        <p className="text-muted-foreground">
          <Trans>
            Halaman ini akan diisi sebelum peluncuran resmi. Untuk pertanyaan terkait
            kebijakan privasi, hubungi tim kodapos.
          </Trans>
        </p>
        <Link to="/" className="text-primary underline mt-4 inline-block">
          <Trans>Kembali</Trans>
        </Link>
      </div>
    </main>
  );
}
