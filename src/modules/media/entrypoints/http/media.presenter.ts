import type { SyncResult } from "@media/public/media-api.js";

export const mediaPresenter = {
  sync(result: SyncResult) {
    return { data: result };
  },
};
