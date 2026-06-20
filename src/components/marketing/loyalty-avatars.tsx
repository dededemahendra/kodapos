'use client';

import type { MouseEvent, ReactNode } from 'react';
import { Trans } from '@lingui/react/macro';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';

function TooltipAvatar({
  name,
  initial,
  designation,
}: {
  name: string;
  initial: string;
  designation: ReactNode;
}) {
  const x = useMotionValue(0);
  const rotate = useSpring(useTransform(x, [-100, 100], [-45, 45]), { stiffness: 100, damping: 15 });
  const translateX = useSpring(useTransform(x, [-100, 100], [-50, 50]), { stiffness: 100, damping: 15 });

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    x.set(e.clientX - rect.left - rect.width / 2);
  }

  return (
    <div className="group relative" onMouseMove={handleMouseMove}>
      {/* Spring-animated tooltip */}
      <motion.div
        style={{ rotate, translateX }}
        className="pointer-events-none absolute -top-14 left-1/2 hidden -translate-x-1/2 flex-col items-center rounded-md px-3 py-1.5 shadow-xl group-hover:flex bg-foreground text-background"
      >
        <span className="text-sm font-medium whitespace-nowrap">{name}</span>
        <span className="text-xs text-background/60 whitespace-nowrap">{designation}</span>
      </motion.div>
      {/* Avatar circle */}
      <div className="size-10 rounded-full bg-muted text-foreground ring-2 ring-background flex items-center justify-center text-sm font-semibold transition group-hover:scale-105 group-hover:z-30">
        {initial}
      </div>
    </div>
  );
}

const people = [
  { name: 'Emma Carter', initial: 'E', designation: <Trans>Pelanggan setia</Trans> },
  { name: 'Liam Bennett', initial: 'L', designation: <Trans>Anggota emas</Trans> },
  { name: 'Olivia Hayes', initial: 'O', designation: <Trans>Sering berkunjung</Trans> },
  { name: 'Noah Parker', initial: 'N', designation: <Trans>Pelanggan baru</Trans> },
];

export function LoyaltyAvatars() {
  return (
    <div className="flex items-center -space-x-2">
      {people.map((p) => (
        <TooltipAvatar key={p.name} {...p} />
      ))}
    </div>
  );
}
