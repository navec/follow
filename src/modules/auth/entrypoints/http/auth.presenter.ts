import type {
  AuthenticatedIdentity,
  AuthResult,
} from "@auth/public/auth-api.js";

export const authPresenter = {
  auth(data: AuthResult) {
    return { data };
  },
  me(identity: AuthenticatedIdentity) {
    return {
      data: {
        user: {
          id: identity.userId,
          email: identity.email,
          role: identity.role,
        },
      },
    };
  },
};
