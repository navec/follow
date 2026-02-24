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
      email: "user@example.com",
      password: "StrongPass123!",
      verifyPassword: "StrongPass123!",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.user.email).toBe("user@example.com");
    expect(typeof response.body.data.accessToken).toBe("string");

    const result = await ctx!.pgPool.query<{
      email: string;
      password_hash: string;
    }>("SELECT email, password_hash FROM users WHERE email = $1", [
      "user@example.com",
    ]);

    expect(result.rowCount).toBe(1);
    expect(result.rows[0]?.email).toBe("user@example.com");
    expect(result.rows[0]?.password_hash).toBeDefined();
    expect(result.rows[0]?.password_hash).not.toBe("StrongPass123!");
    expect(result.rows[0]?.password_hash.startsWith("$argon2")).toBe(true);
  });

  it("returns 409 when registering duplicate email", async () => {
    await request(ctx!.app)
      .post("/auth/register")
      .send({
        email: "user@example.com",
        password: "StrongPass123!",
        verifyPassword: "StrongPass123!",
      })
      .expect(201);

    const response = await request(ctx!.app).post("/auth/register").send({
      email: "user@example.com",
      password: "StrongPass123!",
      verifyPassword: "StrongPass123!",
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("EMAIL_ALREADY_USED");
  });

  it("logs in a user with valid credentials", async () => {
    await request(ctx!.app)
      .post("/auth/register")
      .send({
        email: "user@example.com",
        password: "StrongPass123!",
        verifyPassword: "StrongPass123!",
      })
      .expect(201);

    const response = await request(ctx!.app)
      .post("/auth/login")
      .send({ email: "user@example.com", password: "StrongPass123!" });

    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe("user@example.com");
    expect(typeof response.body.data.accessToken).toBe("string");
  });

  it("returns 401 on invalid login password", async () => {
    await request(ctx!.app)
      .post("/auth/register")
      .send({
        email: "user@example.com",
        password: "StrongPass123!",
        verifyPassword: "StrongPass123!",
      })
      .expect(201);

    const response = await request(ctx!.app)
      .post("/auth/login")
      .send({ email: "user@example.com", password: "wrong-password" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns current user for valid bearer token", async () => {
    const registerResponse = await request(ctx!.app)
      .post("/auth/register")
      .send({
        email: "user@example.com",
        password: "StrongPass123!",
        verifyPassword: "StrongPass123!",
      })
      .expect(201);

    const token = registerResponse.body.data.accessToken as string;

    const response = await request(ctx!.app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe("user@example.com");
  });

  it("returns 401 when /auth/me is called without token", async () => {
    const response = await request(ctx!.app).get("/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });
});
