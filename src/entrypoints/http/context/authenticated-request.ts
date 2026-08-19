import type { Request } from "express";

import type { AuthenticatedIdentity } from "@auth";

export type AuthenticatedRequest = Request & {
  identity?: AuthenticatedIdentity;
};
