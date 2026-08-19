import type { MediaActor } from "../models/media-actor.js";

export class MediaAuthorizationPolicy {
  canSync(actor: MediaActor): boolean {
    return actor.role === "admin" && actor.permissions.includes("media:write");
  }
}
