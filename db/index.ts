import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

type QueryResult<T = Record<string, unknown>> = { results: T[] };

type BoundValue = string | number | boolean | null | Uint8Array | Buffer;

let pool: Pool | null = null;

function databaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is unavailable");
  return value;
}

export function getPool() {
  if (!pool) pool = new Pool({ connectionString: databaseUrl() });
  return pool;
}

function postgresSql(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

class Statement {
  readonly text: string;
  readonly values: BoundValue[];

  constructor(text: string, values: BoundValue[] = []) {
    this.text = text;
    this.values = values;
  }

  bind(...values: BoundValue[]) {
    return new Statement(this.text, values);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const result = await getPool().query(postgresSql(this.text), this.values);
    return (result.rows[0] as T | undefined) ?? null;
  }

  async all<T = Record<string, unknown>>(): Promise<QueryResult<T>> {
    const result = await getPool().query(postgresSql(this.text), this.values);
    return { results: result.rows as T[] };
  }

  async run() {
    const result = await getPool().query(postgresSql(this.text), this.values);
    return { success: true, meta: { changes: result.rowCount ?? 0 }, results: result.rows };
  }
}

class RawDb {
  prepare(sql: string) {
    return new Statement(sql);
  }

  async batch(statements: Statement[]) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const results = [];
      for (const statement of statements) {
        results.push(await client.query(postgresSql(statement.text), statement.values));
      }
      await client.query("COMMIT");
      return results;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

const rawDb = new RawDb();

export function getRawDb() {
  return rawDb;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}
