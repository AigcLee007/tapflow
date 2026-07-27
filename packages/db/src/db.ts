import { Pool, type PoolConfig } from "pg";

export function getDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error("DATABASE_URL is required to run v2 PostgreSQL migrations");
  }
  return value;
}

export function createPgPool(config: PoolConfig = {}): Pool {
  const pool = new Pool({
    connectionString: getDatabaseUrl(),
    ...config,
  });

  pool.on("error", (error) => {
    const code = (error as Error & { code?: unknown }).code;
    console.error("[db] idle PostgreSQL client error", {
      code: typeof code === "string" ? code : undefined,
      message: error.message,
      name: error.name,
      stack: error.stack,
    });
  });

  return pool;
}
