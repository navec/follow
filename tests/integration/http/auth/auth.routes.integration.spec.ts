import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  closeIntegrationTestContext,
  createIntegrationTestContext,
  type IntegrationTestContext,
} from "../../helpers/test-app.js";
import { truncateTestTables } from "../../helpers/test-db.js";

describe("Auth routes integration (Express + Postgres)", () => {
  let ctx: IntegrationTestContext | undefined;

  beforeAll(async () => {
    ctx = await createIntegrationTestContext();
  });

  beforeEach(async () => {
    if (!ctx) {
      return;
    }
    await truncateTestTables(ctx.pgPool, ["users"]);
  });

  afterAll(async () => {
    if (ctx) {
      await closeIntegrationTestContext(ctx);
    }
  });

  it("registers a user and stores a hashed password", async () => {
    const response = await request(ctx!.app).post("/auth/register").send({
      email: "register-user@example.com",
      password: "StrongPass123!",
      verifyPassword: "StrongPass123!",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.user.email).toBe("register-user@example.com");
    expect(typeof response.body.data.accessToken).toBe("string");

    const result = await ctx!.pgPool.query<{
      email: string;
      password_hash: string;
    }>("SELECT email, password_hash FROM users WHERE email = $1", [
      "register-user@example.com",
    ]);

    expect(result.rowCount).toBe(1);
    expect(result.rows[0]?.email).toBe("register-user@example.com");
    expect(result.rows[0]?.password_hash).toBeDefined();
    expect(result.rows[0]?.password_hash).not.toBe("StrongPass123!");
    expect(result.rows[0]?.password_hash.startsWith("$argon2")).toBe(true);
  });

  it("returns 409 when registering duplicate email", async () => {
    await request(ctx!.app)
      .post("/auth/register")
      .send({
        email: "duplicate-user@example.com",
        password: "StrongPass123!",
        verifyPassword: "StrongPass123!",
      })
      .expect(201);

    const response = await request(ctx!.app).post("/auth/register").send({
      email: "duplicate-user@example.com",
      password: "StrongPass123!",
      verifyPassword: "StrongPass123!",
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("EMAIL_ALREADY_USED");
  });

  it("returns 409 instead of 500 when concurrent registrations race on the same email", async () => {
    const payload = {
      email: "race@example.com",
      password: "StrongPass123!",
      verifyPassword: "StrongPass123!",
    };

    const [firstResponse, secondResponse] = await Promise.all([
      request(ctx!.app).post("/auth/register").send(payload),
      request(ctx!.app).post("/auth/register").send(payload),
    ]);

    const statuses = [firstResponse.status, secondResponse.status].sort((a, b) => a - b);

    expect(statuses).toEqual([201, 409]);
    expect([firstResponse.body.error?.code, secondResponse.body.error?.code]).toContain(
      "EMAIL_ALREADY_USED",
    );
  });

  it("logs in a user with valid credentials", async () => {
    await request(ctx!.app)
      .post("/auth/register")
      .send({
        email: "login-user@example.com",
        password: "StrongPass123!",
        verifyPassword: "StrongPass123!",
      })
      .expect(201);

    const response = await request(ctx!.app)
      .post("/auth/login")
      .send({ email: "login-user@example.com", password: "StrongPass123!" });

    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe("login-user@example.com");
    expect(typeof response.body.data.accessToken).toBe("string");
  });

  it("returns 401 on invalid login password", async () => {
    await request(ctx!.app)
      .post("/auth/register")
      .send({
        email: "invalid-password-user@example.com",
        password: "StrongPass123!",
        verifyPassword: "StrongPass123!",
      })
      .expect(201);

    const response = await request(ctx!.app)
      .post("/auth/login")
      .send({ email: "invalid-password-user@example.com", password: "wrong-password" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns current user for valid bearer token", async () => {
    const registerResponse = await request(ctx!.app)
      .post("/auth/register")
      .send({
        email: "me-user@example.com",
        password: "StrongPass123!",
        verifyPassword: "StrongPass123!",
      })
      .expect(201);

    const token = registerResponse.body.data.accessToken as string;

    const response = await request(ctx!.app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe("me-user@example.com");
  });

  it("loads role and permissions defaults from Postgres", async () => {
    const registerResponse = await request(ctx!.app)
      .post("/auth/register")
      .send({
        email: "admin-check@example.com",
        password: "StrongPass123!",
        verifyPassword: "StrongPass123!",
      })
      .expect(201);

    const token = registerResponse.body.data.accessToken as string;

    const meResponse = await request(ctx!.app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.data.user).toMatchObject({
      email: "admin-check@example.com",
      role: "user",
    });

    const result = await ctx!.pgPool.query<{
      role: string;
      permissions: string[];
    }>("SELECT role, permissions FROM users WHERE email = $1", [
      "admin-check@example.com",
    ]);

    expect(result.rowCount).toBe(1);
    expect(result.rows[0]?.role).toBe("user");
    expect(result.rows[0]?.permissions).toEqual([]);
  });

  it("returns 401 when /auth/me is called without token", async () => {
    const response = await request(ctx!.app).get("/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });
});
