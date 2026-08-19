export type SyncProvider = "tmdb" | "mangadex";

export type SyncMediaCommand =
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

export interface MediaActor {
  id: string;
  role: string;
  permissions: string[];
}

export interface SyncError {
  code: string;
  message: string;
  target?: string;
}

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  errors: ReadonlyArray<SyncError>;
}

export interface MediaApi {
  sync(command: SyncMediaCommand, actor: MediaActor): Promise<SyncResult>;
}
