import type { Pool, PoolClient } from "pg";

export async function acquirePostgresTransactionLock(
  client: PoolClient,
  key: string,
): Promise<void> {
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [key],
  );
}

export async function withPostgresTransaction<TResult>(
  pool: Pick<Pool, "connect">,
  operation: (client: PoolClient) => Promise<TResult>,
): Promise<TResult> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
