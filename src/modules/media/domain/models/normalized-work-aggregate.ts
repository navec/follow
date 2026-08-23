import type { SyncProvider } from "@media/application/dto/sync-request.dto.js";

export interface NormalizedWorkTranslation {
  localeCode: string;
  language: string;
  title: string;
  summary?: string;
  tagline?: string;
}

export interface NormalizedWorkImage {
  type: "poster" | "backdrop";
  sourceValue: string;
  url: string;
}

export interface NormalizedWorkContributor {
  sourceValue: string;
  name: string;
  role: "actor" | "director";
  characterName?: string;
}

export interface NormalizedWorkAggregate {
  source: {
    provider: SyncProvider;
    sourceValue: string;
  };
  work: {
    type: string;
    releaseDate?: string;
    originalTitle?: string;
    originalLanguage?: string;
  };
  translations?: ReadonlyArray<NormalizedWorkTranslation>;
  images?: ReadonlyArray<NormalizedWorkImage>;
  contributors?: ReadonlyArray<NormalizedWorkContributor>;
}
