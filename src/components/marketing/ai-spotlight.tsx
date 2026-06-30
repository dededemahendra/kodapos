'use client';

import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { ArrowUp, Check, Sparkles } from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import { Button } from '~/components/ui/button';

/** Shared viewport settings: trigger once when the element is 80px inside the viewport */
const VP = { once: true, margin: '-80px' } as const;

function makeSlide(delay: number) {
  return {
    hidden: { opacity: 0, y: 16 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.55,
        ease: [0.25, 0, 0, 1] as [number, number, number, number],
        delay,
      },
    },
  };
}

const CHECKS = [
  <Trans key="a">Jawaban instan dari data Anda</Trans>,
  <Trans key="b">Saran stok otomatis</Trans>,
  <Trans key="c">Pakai kunci API Anda sendiri</Trans>,
];

/** A windowed mock of the kodapos AI chat page: slim nav rail, chat thread, composer. */
function AiChatPreview() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card" aria-hidden={false}>
      {/* Window chrome */}
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3.5 py-2.5">
        <span className="size-2.5 rounded-full bg-muted-foreground/25" />
        <span className="size-2.5 rounded-full bg-muted-foreground/25" />
        <span className="size-2.5 rounded-full bg-muted-foreground/25" />
        <span className="ml-2 text-xs text-muted-foreground">kodapos</span>
      </div>

      {/* App body: slim nav rail + chat page */}
      <div className="grid min-h-[460px] grid-cols-[52px_1fr]">
        {/* Nav rail */}
        <div
          aria-hidden="true"
          className="flex flex-col items-center gap-3 border-r border-border bg-muted/20 py-4"
        >
          <span className="size-6 rounded-md bg-primary/20" />
          <span className="size-4 rounded bg-muted-foreground/20" />
          <span className="size-4 rounded bg-muted-foreground/20" />
          <span className="size-4 rounded bg-muted-foreground/20" />
          <span className="mt-auto size-6 rounded-full bg-muted-foreground/25" />
        </div>

        {/* Chat page */}
        <div className="flex min-w-0 flex-col">
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <span className="flex size-7 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="size-4 text-primary" />
            </span>
            <span className="text-sm font-medium">
              <Trans>Asisten AI</Trans>
            </span>
          </div>

          {/* Message thread */}
          <div className="flex flex-col gap-3 p-4 sm:p-5">
            <ChatBubble side="user" delay={0.15}>
              <Trans>Berapa penjualan hari ini?</Trans>
            </ChatBubble>
            <ChatBubble side="ai" delay={0.28}>
              <Trans>
                Penjualan hari ini Rp 2.450.000, naik 12% dari kemarin. Menu terlaris: Es Kopi Susu.
              </Trans>
            </ChatBubble>
            <ChatBubble side="user" delay={0.42}>
              <Trans>Bahan apa yang perlu distok?</Trans>
            </ChatBubble>
            <ChatBubble side="ai" delay={0.55}>
              <Trans>Stok susu cukup untuk 2 hari. Mau saya buatkan daftar belanja?</Trans>
            </ChatBubble>
          </div>

          {/* Pinned composer */}
          <div className="mt-auto border-t border-border p-3 sm:px-5 sm:pb-4">
            <div className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2">
              <span className="flex-1 truncate text-sm text-muted-foreground">
                <Trans>Tanya tentang penjualan, stok, pelanggan...</Trans>
              </span>
              <Button size="icon" className="size-7 shrink-0 rounded-full" tabIndex={-1}>
                <ArrowUp className="size-4" />
              </Button>
            </div>
            <p className="mt-2 text-center text-[10px] text-muted-foreground">
              <Trans>AI bisa keliru. Periksa informasi penting.</Trans>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({
  side,
  delay,
  children,
}: {
  side: 'user' | 'ai';
  delay: number;
  children: React.ReactNode;
}) {
  const isUser = side === 'user';
  return (
    <motion.div
      className={isUser ? 'flex justify-end' : 'flex justify-start'}
      initial="hidden"
      whileInView="visible"
      viewport={VP}
      variants={makeSlide(delay)}
    >
      <div
        className={
          isUser
            ? 'ml-auto max-w-[78%] rounded-2xl bg-primary px-3.5 py-2 text-sm text-primary-foreground'
            : 'max-w-[85%] rounded-2xl bg-muted px-3.5 py-2 text-sm text-foreground'
        }
      >
        {children}
      </div>
    </motion.div>
  );
}

export function AiSpotlight() {
  return (
    <MotionConfig reducedMotion="user">
      <section className="relative overflow-hidden py-20">
        {/* Centered copy */}
        <div className="mx-auto max-w-2xl px-6 text-center">
          <motion.span
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
            initial="hidden"
            whileInView="visible"
            viewport={VP}
            variants={makeSlide(0)}
          >
            <Sparkles className="size-3.5 text-primary" />
            <Trans>Asisten AI</Trans>
          </motion.span>

          <motion.h2
            className="mt-5 text-balance text-4xl font-extrabold tracking-tight md:text-5xl"
            initial="hidden"
            whileInView="visible"
            viewport={VP}
            variants={makeSlide(0.08)}
          >
            <Trans>Tanya apa saja tentang bisnis Anda</Trans>
          </motion.h2>

          <motion.p
            className="mx-auto mt-4 max-w-xl text-balance text-lg text-muted-foreground"
            initial="hidden"
            whileInView="visible"
            viewport={VP}
            variants={makeSlide(0.16)}
          >
            <Trans>
              Asisten AI kodapos menjawab dari data kafe Anda sendiri. Tahu penjualan, stok, dan menu
              terlaris tanpa membuka laporan.
            </Trans>
          </motion.p>

          <motion.div
            className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground"
            initial="hidden"
            whileInView="visible"
            viewport={VP}
            variants={makeSlide(0.24)}
          >
            {CHECKS.map((label, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static list
              <span key={i} className="inline-flex items-center gap-1.5">
                <Check className="size-3.5 text-emerald-600" />
                {label}
              </span>
            ))}
          </motion.div>

          <motion.div
            className="mt-8"
            initial="hidden"
            whileInView="visible"
            viewport={VP}
            variants={makeSlide(0.32)}
          >
            <Button asChild size="lg">
              <Link to="/signin">
                <Trans>Mulai gratis</Trans>
              </Link>
            </Button>
          </motion.div>
        </div>

        {/* Big framed AI chat page preview, hero style */}
        <motion.div
          className="relative mx-auto mt-14 max-w-5xl px-6"
          initial="hidden"
          whileInView="visible"
          viewport={VP}
          variants={makeSlide(0.2)}
        >
          <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-transparent from-60% to-background" />
          <div className="relative overflow-hidden rounded-2xl border border-border bg-background p-2 shadow-xl ring-1 ring-border/50">
            <AiChatPreview />
          </div>
        </motion.div>
      </section>
    </MotionConfig>
  );
}
