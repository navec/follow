export type SyncProvider = "tmdb" | "mangadex";

export type SyncRequest =
  | {
      provider: SyncProvider;
      params: {
        target: "work";
        externalId: number | string;
        type: string;
      };
    }
  | {
      provider: SyncProvider;
      params: {
        target: "feed";
        feed: string;
      };
    };
