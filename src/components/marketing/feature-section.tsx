import { Trans } from '@lingui/react/macro';
import { BarChart3, CloudSun, ShieldCheck, Users } from 'lucide-react';
import { Card, CardContent } from '~/components/ui/card';
import { SectionHeading } from './section-heading';

export function FeatureSection() {
  return (
    <section id="fitur" className="scroll-mt-16 border-y border-border bg-muted/30 py-20">
      <div className="mx-auto max-w-5xl px-6">
        <SectionHeading sub={<Trans>Dari pesanan pertama sampai laporan akhir bulan.</Trans>}>
          <Trans>Semua yang dibutuhkan kafe Anda, dalam satu tempat</Trans>
        </SectionHeading>

        <div className="grid grid-cols-6 gap-3">
          {/* Row 1: three cards */}

          {/* Card 1: Stat card - Berbasis web */}
          <Card className="col-span-full sm:col-span-3 lg:col-span-2">
            <CardContent className="p-6">
              <div className="mb-4 flex flex-col items-start gap-1">
                <span className="text-4xl font-bold text-primary leading-none">100%</span>
                <div className="h-1 w-10 rounded-full bg-primary/30" />
              </div>
              <h3 className="text-lg font-medium">
                <Trans>Berbasis web</Trans>
              </h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                <Trans>Jalan di tablet, HP, atau laptop.</Trans>
              </p>
            </CardContent>
          </Card>

          {/* Card 2: ShieldCheck card - Aman secara bawaan */}
          <Card className="col-span-full sm:col-span-3 lg:col-span-2">
            <CardContent className="p-6">
              <div className="mb-4 flex items-center justify-center size-14 rounded-full border-2 border-border relative">
                <div className="absolute inset-[-6px] rounded-full border border-border/40" />
                <ShieldCheck className="size-6 text-primary" />
              </div>
              <h3 className="text-lg font-medium">
                <Trans>Aman secara bawaan</Trans>
              </h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                <Trans>Data kafe tersimpan aman di cloud dan hanya bisa diakses oleh akun Anda.</Trans>
              </p>
            </CardContent>
          </Card>

          {/* Card 3: Bar-chart card - Laporan waktu nyata */}
          <Card className="col-span-full sm:col-span-3 lg:col-span-2">
            <CardContent className="p-6">
              <div className="mb-4 flex items-end gap-1 h-10">
                <div className="w-3 rounded-t bg-primary/30 h-4" />
                <div className="w-3 rounded-t bg-primary/60 h-6" />
                <div className="w-3 rounded-t bg-primary h-9" />
                <div className="w-3 rounded-t bg-primary/60 h-7" />
                <div className="w-3 rounded-t bg-primary/30 h-5" />
                <BarChart3 className="ml-2 size-5 text-muted-foreground self-end" />
              </div>
              <h3 className="text-lg font-medium">
                <Trans>Laporan waktu nyata</Trans>
              </h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                <Trans>Penjualan, produk, dan laba rugi yang diperbarui setiap transaksi.</Trans>
              </p>
            </CardContent>
          </Card>

          {/* Row 2: two wide cards */}

          {/* Card 4: Demand forecast - Prakiraan permintaan */}
          <Card className="col-span-full lg:col-span-3">
            <CardContent className="p-6">
              <div className="mb-4 flex items-center gap-3">
                <CloudSun className="size-7 text-primary" />
                <svg
                  viewBox="0 0 120 40"
                  className="h-10 flex-1 text-primary"
                  fill="none"
                  aria-hidden="true"
                >
                  <polyline
                    points="0,35 20,25 40,30 60,15 80,20 100,8 120,12"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    className="opacity-40"
                  />
                  <polyline
                    points="0,35 20,25 40,30 60,15 80,20 100,8 120,12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeDasharray="4 3"
                    className="opacity-80"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium">
                <Trans>Prakiraan permintaan</Trans>
              </h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                <Trans>AI memperkirakan permintaan harian dari pola penjualan dan cuaca lokal.</Trans>
              </p>
            </CardContent>
          </Card>

          {/* Card 5: Customer loyalty - Loyalitas pelanggan */}
          <Card className="col-span-full lg:col-span-3">
            <CardContent className="p-6">
              <div className="mb-4 flex items-center gap-3">
                <Users className="size-6 text-primary" />
                <div className="flex gap-2">
                  {[
                    { initial: 'A', name: 'Ayu' },
                    { initial: 'S', name: 'Sari' },
                    { initial: 'R', name: 'Rian' },
                  ].map(({ initial, name }) => (
                    <div key={name} className="flex flex-col items-center gap-1">
                      <div className="flex size-9 items-center justify-center rounded-full bg-muted border border-border text-sm font-semibold text-foreground">
                        {initial}
                      </div>
                      <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                        {name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <h3 className="text-lg font-medium">
                <Trans>Loyalitas pelanggan</Trans>
              </h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                <Trans>Kumpulkan pelanggan, beri poin dan hadiah, lalu buat mereka kembali.</Trans>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
