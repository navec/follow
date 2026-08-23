import type { SyncProvider } from "@media/application/dto/sync-request.dto.js";

export interface NormalizedWorkTranslation {
  localeCode: string;
  language: string;
  title: string;
  summary?: string;
  tagline?: string;
}

export interface NormalizedWorkImage {
  type: "poster" | "backdrop" | "profile";
  sourceValue: string;
  url: string;
  localeCode?: string;
  language?: string;
}

export interface NormalizedWorkContributor {
  sourceValue: string;
  name: string;
  role: "actor";
  characterName?: string;
  profileImage?: NormalizedWorkImage;
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
    statusCode?: string;
  };
  translations?: ReadonlyArray<NormalizedWorkTranslation>;
  images?: ReadonlyArray<NormalizedWorkImage>;
  contributors?: ReadonlyArray<NormalizedWorkContributor>;
}
