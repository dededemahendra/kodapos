// scripts/lib/shots-manifest.d.mts
export interface ShotManifestEntry {
  readonly id: string;
  readonly path: string;
  readonly waitFor: string;
}

export const SHOT_MANIFEST: readonly ShotManifestEntry[];
