import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { BrandMark } from '~/components/brand-mark';

export function MarketingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <BrandMark className="h-5 w-auto text-foreground" />
              <span className="font-semibold">kodapos</span>
            </div>
            <p className="mt-3 max-w-64 text-sm text-muted-foreground">
              <Trans>POS pintar untuk kafe dan resto di Indonesia.</Trans>
            </p>
          </div>
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Trans>Produk</Trans></h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#fitur" className="hover:text-foreground"><Trans>Fitur</Trans></a></li>
              <li><a href="#harga" className="hover:text-foreground"><Trans>Harga</Trans></a></li>
              <li><a href="#faq" className="hover:text-foreground">FAQ</a></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Trans>Akun</Trans></h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/signin" className="hover:text-foreground"><Trans>Masuk</Trans></Link></li>
              <li><Link to="/signup" className="hover:text-foreground"><Trans>Daftar</Trans></Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/privacy" className="hover:text-foreground"><Trans>Privasi</Trans></Link></li>
              <li><Link to="/terms" className="hover:text-foreground"><Trans>Ketentuan</Trans></Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-10 flex flex-wrap justify-between gap-2 border-t border-border pt-6 text-sm text-muted-foreground">
          <span>© 2026 kodapos</span>
          <span><Trans>Dibuat untuk kafe Indonesia</Trans></span>
        </div>
      </div>
    </footer>
  );
}
