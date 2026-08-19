import type { SyncResult } from "../../public/media-api.js";

export const mediaPresenter = {
  sync(result: SyncResult) {
    return { data: result };
  },
};
