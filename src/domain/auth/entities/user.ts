export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicUser {
  id: string;
  email: string;
}

export function toPublicUser(user: User): PublicUser {
  return { id: user.id, email: user.email };
}
