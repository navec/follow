export interface AccessTokenPayload {
  sub: string;
  email: string;
}

export interface TokenServicePort {
  signAccessToken(payload: AccessTokenPayload): string;
  verifyAccessToken(token: string): AccessTokenPayload;
}
