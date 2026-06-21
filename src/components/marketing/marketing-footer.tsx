'use client';

import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { Globe, Heart, Mail, MessageCircle } from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import { BrandMark } from '~/components/brand-mark';

const VP = { once: true, margin: '-80px' } as const;

const SOCIALS = [
  { Icon: MessageCircle, label: 'WhatsApp' },
  { Icon: Mail, label: 'Email' },
  { Icon: Globe, label: 'Website' },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-border">
      <MotionConfig reducedMotion="user">
        <motion.div
          className="mx-auto max-w-6xl px-6 py-16"
          initial="hidden"
          whileInView="visible"
          viewport={VP}
          variants={{
            hidden: { opacity: 0, y: 16 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
          }}
        >
          <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
            {/* Brand */}
            <div className="max-w-sm">
              <div className="flex items-center gap-2">
                <BrandMark className="h-5 w-auto text-foreground" />
                <span className="font-semibold">kodapos</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                <Trans>
                  POS pintar untuk kafe dan resto di Indonesia. Satu aplikasi untuk kasir, stok, dan
                  laporan, dengan bantuan AI.
                </Trans>
              </p>
              <ul className="mt-5 flex items-center gap-4 text-muted-foreground">
                {SOCIALS.map(({ Icon, label }) => (
                  <li key={label}>
                    <a href="#" aria-label={label} className="transition-colors hover:text-primary">
                      <Icon className="size-5" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Link columns */}
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:gap-16">
              <div>
                <h4 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Trans>Produk</Trans>
                </h4>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li>
                    <a href="#features" className="hover:text-foreground">
                      <Trans>Fitur</Trans>
                    </a>
                  </li>
                  <li>
                    <a href="#pricing" className="hover:text-foreground">
                      <Trans>Harga</Trans>
                    </a>
                  </li>
                  <li>
                    <a href="#faq" className="hover:text-foreground">
                      FAQ
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Trans>Akun</Trans>
                </h4>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li>
                    <Link to="/signin" className="hover:text-foreground">
                      <Trans>Masuk</Trans>
                    </Link>
                  </li>
                  <li>
                    <Link to="/signup" className="hover:text-foreground">
                      <Trans>Daftar</Trans>
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Legal
                </h4>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li>
                    <Link to="/privacy" className="hover:text-foreground">
                      <Trans>Privasi</Trans>
                    </Link>
                  </li>
                  <li>
                    <Link to="/terms" className="hover:text-foreground">
                      <Trans>Ketentuan</Trans>
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-12 flex flex-col gap-3 border-t border-border pt-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
            <span>© 2026 kodapos. All rights reserved.</span>
            <span className="inline-flex items-center gap-1.5">
              Made with
              <Heart className="size-3.5 fill-red-500 text-red-500" aria-hidden="true" />
              by Dede Mahendra
            </span>
          </div>
        </motion.div>
      </MotionConfig>
    </footer>
  );
}
