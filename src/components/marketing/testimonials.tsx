'use client';

import { useState } from 'react';
import { Trans } from '@lingui/react/macro';
import { MotionConfig, motion } from 'motion/react';
import { SectionHeading } from './section-heading';

const VP = { once: true, margin: '-80px' } as const;

function avatarUrl(seed: string) {
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}`;
}

const TESTIMONIALS = [
  {
    seed: 'Sari Pemilik',
    name: 'Sari',
    role: <Trans>Pemilik kafe</Trans>,
    quote: <Trans>Kasirnya ringan dan cepat, antrian jam sibuk jauh lebih lancar.</Trans>,
  },
  {
    seed: 'Budi Pemilik',
    name: 'Budi',
    role: <Trans>Pemilik resto</Trans>,
    quote: <Trans>Laporan harian bikin saya tahu menu mana yang harus didorong.</Trans>,
  },
  {
    seed: 'Ayu Pemilik',
    name: 'Ayu',
    role: <Trans>Pemilik kedai</Trans>,
    quote: <Trans>Stok bahan kepantau, jadi jarang kehabisan saat ramai.</Trans>,
  },
];

export function Testimonials() {
  const [active, setActive] = useState(0);
  // active is always 0-2 (set only by clicking a TESTIMONIALS pill), so the index is always valid
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const person = TESTIMONIALS[active]!;

  return (
    <MotionConfig reducedMotion="user">
      <section className="py-20">
        <motion.div
          className="mx-auto max-w-4xl px-6"
          initial="hidden"
          whileInView="visible"
          viewport={VP}
          variants={{
            hidden: { opacity: 0, y: 16 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
          }}
        >
        <SectionHeading>
          <Trans>Dipakai pemilik kafe seperti Anda</Trans>
        </SectionHeading>

        {/* Quote display */}
        <figure className="flex flex-col items-center gap-6 text-center">
          <blockquote
            key={active}
            className="max-w-2xl text-xl font-medium italic leading-relaxed text-foreground animate-in fade-in duration-300"
          >
            {person.quote}
          </blockquote>
          <figcaption className="text-sm text-muted-foreground">
            {person.name}, {person.role}
          </figcaption>

          {/* Avatar pills */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            {TESTIMONIALS.map((t, i) => (
              <button
                key={t.seed}
                type="button"
                onClick={() => setActive(i)}
                className={[
                  'group flex items-center gap-2 rounded-full transition-all duration-300',
                  'overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                  i === active
                    ? 'bg-foreground text-background px-3 py-1'
                    : 'bg-muted text-foreground px-1 py-1 hover:bg-foreground hover:text-background hover:px-3',
                ].join(' ')}
              >
                <img
                  src={avatarUrl(t.seed)}
                  alt=""
                  width={32}
                  height={32}
                  loading="lazy"
                  className="size-8 shrink-0 rounded-full bg-muted"
                />
                <span
                  className={[
                    'whitespace-nowrap text-sm font-medium transition-all duration-300',
                    i === active
                      ? 'max-w-[120px] opacity-100'
                      : 'max-w-0 opacity-0 group-hover:max-w-[120px] group-hover:opacity-100',
                  ].join(' ')}
                >
                  {t.name}
                </span>
              </button>
            ))}
          </div>
        </figure>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          <Trans>Placeholder. Ganti dengan testimoni pelanggan asli.</Trans>
        </p>
        </motion.div>
      </section>
    </MotionConfig>
  );
}
