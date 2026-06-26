import { Sparkles } from 'lucide-react';
import { cn } from '~/lib/utils';
import whatsappLogo from '~/assets/integrations/whatsapp.svg?url';
import gojekLogo from '~/assets/integrations/gojek.svg?url';
import grabLogo from '~/assets/integrations/grab.svg?url';
import shopeeLogo from '~/assets/integrations/shopee.svg?url';
import gopayLogo from '~/assets/integrations/gopay.svg?url';
import danaLogo from '~/assets/integrations/dana.svg?url';
import ovoLogo from '~/assets/integrations/ovo.svg?url';
import accurateLogo from '~/assets/integrations/accurate.svg?url';
import qrisLogo from '~/assets/integrations/qris.svg?url';
import mekariLogo from '~/assets/integrations/mekari.png?url';

/**
 * Brand identity for an integration card. Every card uses the SAME fixed-size
 * white logo plate, with the logo centered via object-contain — so wide
 * wordmarks (DANA, Accurate) and narrow ones (OVO) sit in an identical box and
 * the cards stay consistent. The white plate also keeps dark-text wordmarks
 * legible in dark mode. Parent-brand marks stand in for their sub-services
 * (GoFood→Gojek, GrabFood→Grab, ShopeeFood→Shopee — same company). The AI card is
 * vendor-agnostic (OpenAI/Anthropic), so it uses a generic glyph; unknown keys
 * fall back to a monogram. The brand name is always shown beside the plate (the
 * catalog name carries extra context, e.g. "QRIS (Midtrans/Xendit)").
 */
type LogoDef = { type: 'img'; src: string } | { type: 'ai' };

const LOGOS: Record<string, LogoDef> = {
  // payment
  qris: { type: 'img', src: qrisLogo },
  gopay: { type: 'img', src: gopayLogo },
  ovo: { type: 'img', src: ovoLogo },
  dana: { type: 'img', src: danaLogo },
  // delivery (parent-brand glyphs)
  gofood: { type: 'img', src: gojekLogo },
  grabfood: { type: 'img', src: grabLogo },
  shopeefood: { type: 'img', src: shopeeLogo },
  // accounting
  accurate: { type: 'img', src: accurateLogo },
  mekari: { type: 'img', src: mekariLogo },
  // messaging
  whatsapp: { type: 'img', src: whatsappLogo },
  // ai
  ai: { type: 'ai' },
};

// Fixed plate so every logo occupies an identical box regardless of its shape.
const PLATE = 'flex h-8 w-20 shrink-0 items-center justify-center rounded border border-border';

export function IntegrationLogo({ entryKey, name }: { entryKey: string; name: string }) {
  const def = LOGOS[entryKey];

  return (
    <span className="flex min-w-0 items-center gap-3">
      {def?.type === 'img' ? (
        <span className={cn(PLATE, 'bg-white')}>
          <img src={def.src} alt="" className="max-h-5 max-w-[64px] object-contain" />
        </span>
      ) : def?.type === 'ai' ? (
        <span className={cn(PLATE, 'bg-primary/10 text-primary')} aria-hidden>
          <Sparkles className="size-4" />
        </span>
      ) : (
        <span className={cn(PLATE, 'bg-muted text-base font-semibold')} aria-hidden>
          {name.charAt(0)}
        </span>
      )}
      <span className="truncate">{name}</span>
    </span>
  );
}
