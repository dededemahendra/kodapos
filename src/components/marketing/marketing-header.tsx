import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { MotionConfig, motion } from 'motion/react';
import { Button } from '~/components/ui/button';
import { BrandMark } from '~/components/brand-mark';
import { ThemeToggle } from '~/components/theme-toggle';

export function MarketingHeader() {
  return (
    <MotionConfig reducedMotion="user">
      <motion.header
        className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-6">
        <a href="/#top" className="flex items-center gap-2">
          <BrandMark className="h-5 w-auto text-foreground" />
          <span className="font-semibold">kodapos</span>
        </a>
        <nav className="ml-6 hidden gap-6 text-sm text-muted-foreground md:flex">
          <a href="/#features" className="transition-colors hover:text-foreground"><Trans>Fitur</Trans></a>
          <a href="/#how-it-works" className="transition-colors hover:text-foreground"><Trans>Cara kerja</Trans></a>
          <a href="/#pricing" className="transition-colors hover:text-foreground"><Trans>Harga</Trans></a>
          <a href="/#faq" className="transition-colors hover:text-foreground">FAQ</a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle className="size-9" />
          <Button asChild variant="outline" size="sm">
            <Link to="/signin"><Trans>Masuk</Trans></Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/signin"><Trans>Daftar</Trans></Link>
          </Button>
        </div>
      </div>
      </motion.header>
    </MotionConfig>
  );
}
