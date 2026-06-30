'use client';

import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import type { Variants } from 'motion/react';
import { Button } from '~/components/ui/button';
import { Meteors } from '~/components/ui/meteors';
import { AnimatedGroup } from './animated-group';
import { RegisterPreview } from './register-preview';

const transitionVariants: { item: Variants } = {
  item: {
    hidden: { opacity: 0, filter: 'blur(12px)', y: 12 },
    visible: {
      opacity: 1,
      filter: 'blur(0px)',
      y: 0,
      transition: { type: 'spring', bounce: 0.3, duration: 1.5 },
    },
  },
};

const delayedGroup: { container: Variants; item: Variants } = {
  container: {
    visible: { transition: { staggerChildren: 0.05, delayChildren: 0.75 } },
  },
  ...transitionVariants,
};

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Decorative glows (large screens). Low-opacity gray reads as a soft
          sheen on light and a subtle aurora on dark. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 isolate -z-10 hidden opacity-60 lg:block"
      >
        <div className="absolute left-0 top-0 h-[80rem] w-[35rem] -translate-y-[350px] -rotate-45 rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,hsla(0,0%,55%,.10)_0,hsla(0,0%,45%,.03)_50%,transparent_80%)]" />
        <div className="absolute left-0 top-0 h-[80rem] w-56 -translate-y-[350px] -rotate-45 bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,55%,.06)_0,transparent_80%)]" />
      </div>
      {/* Fades the section into the page background, theme aware. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 [background:radial-gradient(125%_125%_at_50%_100%,transparent_0%,var(--background)_75%)]"
      />
      {/* Meteor streaks behind the content (kept at z-0, content sits at z-10) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <Meteors number={44} />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-6 pt-20 text-center md:pt-28">
        <AnimatedGroup variants={transitionVariants}>
          <a
            href="#features"
            className="group mx-auto flex w-fit items-center gap-3 rounded-full border border-border bg-muted/60 p-1 pl-4 text-sm shadow-sm transition-colors hover:bg-muted"
          >
            <span className="text-foreground">
              <Trans>Asisten AI kini hadir di kodapos</Trans>
            </span>
            <span className="block h-4 w-px bg-border" />
            <span className="flex size-6 items-center justify-center rounded-full bg-background">
              <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </a>

          <h1 className="mx-auto mt-8 max-w-3xl text-balance text-5xl font-extrabold tracking-tight md:text-6xl xl:text-7xl">
            <Trans>Jalankan kafe Anda, bukan kasirnya.</Trans>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
            <Trans>
              Satu aplikasi untuk kasir, stok, dan laporan. Jual lebih cepat, jaga margin, dan ambil
              keputusan dengan bantuan AI.
            </Trans>
          </p>
        </AnimatedGroup>

        <AnimatedGroup
          variants={delayedGroup}
          className="mt-10 flex flex-col items-center justify-center gap-2 sm:flex-row"
        >
          <Button asChild size="lg">
            <Link to="/signin">
              <Trans>Mulai gratis</Trans>
            </Link>
          </Button>
          <Button asChild size="lg" variant="ghost">
            <a href="#features">
              <Trans>Lihat fitur</Trans>
            </a>
          </Button>
        </AnimatedGroup>

        <AnimatedGroup variants={delayedGroup} className="mt-5">
          <p className="text-sm text-muted-foreground">
            <Trans>Gratis selama akses awal. Tanpa kartu kredit.</Trans>
          </p>
        </AnimatedGroup>
      </div>

      <AnimatedGroup variants={delayedGroup}>
        <div className="relative z-10 mx-auto mt-12 max-w-5xl px-6 sm:mt-16">
          <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-transparent from-55% to-background" />
          <div className="relative overflow-hidden rounded-2xl border border-border bg-background p-2 shadow-xl ring-1 ring-border/50">
            <RegisterPreview />
          </div>
        </div>
      </AnimatedGroup>
    </section>
  );
}
