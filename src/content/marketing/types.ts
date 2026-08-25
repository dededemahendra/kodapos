import type { Localized } from '~/lib/localized';
import type { ShotId } from '~/lib/shots';

/**
 * Marketing page copy lives here as { id, en } documents rather than in the
 * Lingui catalog, following src/content/legal/. Prose is easier to review as a
 * whole document than as fragmented catalog entries, and a 7,970-line .po would
 * silently fall back to Indonesian for any string someone forgets to translate.
 *
 * The template's own chrome (buttons, nav labels) still uses <Trans> — those are
 * UI strings and belong in the catalog.
 */
export interface HeroBlock {
  kind: 'hero';
  eyebrow: Localized;
  title: Localized;
  lede: Localized;
  shot?: ShotId;
  shotAlt?: Localized;
}

export interface CapabilityBlock {
  kind: 'capability';
  id: string;
  heading: Localized;
  body: Localized;
  bullets: Localized[];
  shot?: ShotId;
  shotAlt?: Localized;
  /** Screenshot side on desktop. Alternate down the page. */
  side: 'left' | 'right';
}

export interface FlowBlock {
  kind: 'flow';
  heading: Localized;
  steps: { title: Localized; body: Localized }[];
}

/** What the feature deliberately does not do. Stated, not hidden. */
export interface TruthBlock {
  kind: 'truth';
  heading: Localized;
  lede: Localized;
  does: Localized[];
  doesNot: Localized[];
}

export interface FaqBlock {
  kind: 'faq';
  heading: Localized;
  items: { q: Localized; a: Localized }[];
}

export interface CtaBlock {
  kind: 'cta';
  heading: Localized;
  body: Localized;
}

export type FeatureSectionBlock =
  | HeroBlock
  | CapabilityBlock
  | FlowBlock
  | TruthBlock
  | FaqBlock
  | CtaBlock;

export interface FeaturePageContent {
  /** URL segment under /fitur. */
  slug: string;
  seoTitle: Localized;
  seoDescription: Localized;
  /** Breadcrumb label. */
  navLabel: Localized;
  sections: FeatureSectionBlock[];
}
