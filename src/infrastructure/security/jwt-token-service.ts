import jwt from "jsonwebtoken";

import type {
  AccessTokenPayload,
  TokenServicePort,
} from "@application/auth/ports/out/token-service.port.js";

type JwtExpiresIn = Exclude<jwt.SignOptions["expiresIn"], undefined>;

interface JwtTokenServiceOptions {
  secret: string;
  expiresIn: JwtExpiresIn;
}

export class JwtTokenService implements TokenServicePort {
  constructor(private readonly options: JwtTokenServiceOptions) {}

  signAccessToken(payload: AccessTokenPayload): string {
    return jwt.sign(payload, this.options.secret, {
      algorithm: "HS256",
      expiresIn: this.options.expiresIn,
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    const decoded = jwt.verify(token, this.options.secret, {
      algorithms: ["HS256"],
    });

    if (typeof decoded !== "object" || decoded === null) {
      throw new Error("Invalid token payload");
    }

    const sub = typeof decoded.sub === "string" ? decoded.sub : undefined;
    const email = typeof decoded.email === "string" ? decoded.email : undefined;

    if (!sub || !email) {
      throw new Error("Invalid token claims");
    }

    return { sub, email };
  }
}
