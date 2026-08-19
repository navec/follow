import type { Request } from "express";

export interface AuthenticatedHttpIdentity {
  userId: string;
  email: string;
  role: string;
  permissions: string[];
}

export type AuthenticatedRequest = Request & {
  identity?: AuthenticatedHttpIdentity;
};
