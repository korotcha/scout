import { getRawDb } from "@/db";

type PutBody = string | Uint8Array | ArrayBuffer | ReadableStream<Uint8Array> | null;
type PutOptions = {
  onlyIf?: { etagDoesNotMatch?: string };
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
};

type StoredRow = { body: Buffer | Uint8Array; content_type: string | null; etag: string };

async function bytes(body: PutBody): Promise<Uint8Array> {
  if (body == null) return new Uint8Array();
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return new Uint8Array(await new Response(body).arrayBuffer());
}

function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, "0")).join("");
}

class StoredObject {
  readonly body: Uint8Array;
  readonly httpMetadata: { contentType?: string };
  readonly etag: string;

  constructor(row: StoredRow) {
    this.body = new Uint8Array(row.body);
    this.httpMetadata = row.content_type ? { contentType: row.content_type } : {};
    this.etag = row.etag;
  }

  async arrayBuffer() {
    return this.body.buffer.slice(this.body.byteOffset, this.body.byteOffset + this.body.byteLength);
  }

  async text() {
    return new TextDecoder().decode(this.body);
  }

  async json<T = unknown>() {
    return JSON.parse(await this.text()) as T;
  }
}

class ObjectStore {
  async get(key: string) {
    const row = await getRawDb().prepare("SELECT body, content_type, etag FROM object_store WHERE object_key = ?").bind(key).first<StoredRow>();
    return row ? new StoredObject(row) : null;
  }

  async put(key: string, body: PutBody, options: PutOptions = {}) {
    const data = await bytes(body);
    const etag = hex(await crypto.subtle.digest("SHA-256", new Uint8Array(data).buffer));
    const now = new Date().toISOString();
    const contentType = options.httpMetadata?.contentType ?? "application/octet-stream";
    const metadata = JSON.stringify(options.customMetadata ?? {});
    if (options.onlyIf?.etagDoesNotMatch === "*") {
      const inserted = await getRawDb().prepare("INSERT INTO object_store (object_key, body, content_type, etag, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(object_key) DO NOTHING RETURNING object_key")
        .bind(key, data, contentType, etag, metadata, now, now).first();
      if (!inserted) throw new Error("Object already exists");
      return;
    }
    await getRawDb().prepare("INSERT INTO object_store (object_key, body, content_type, etag, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(object_key) DO UPDATE SET body = excluded.body, content_type = excluded.content_type, etag = excluded.etag, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at")
      .bind(key, data, contentType, etag, metadata, now, now).run();
  }

  async delete(key: string) {
    await getRawDb().prepare("DELETE FROM object_store WHERE object_key = ?").bind(key).run();
  }
}

const store = new ObjectStore();
export function getObjectStore() { return store; }
