import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { currentAgencyId } from "@/server/db";
import { env } from "@/server/env";

/*
 * Where document files live. With S3_BUCKET set they go to S3, encrypted at rest; otherwise to a
 * private folder on this machine. Nothing is ever public: files are only reached through the Hub,
 * which checks who is asking first.
 */

type Storage = {
  kind: "s3" | "local";
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /* A stream of the file, for the Hub to pass on after its own permission check. */
  read(key: string): Promise<{ body: ReadableStream; size?: number }>;
  /* A link that works for a minute, for S3 only. The local store has none. */
  signedUrl(key: string, fileName: string, inline: boolean): Promise<string | null>;
  remove(key: string): Promise<void>;
};

/* Where a new file goes: under its agency's own folder, so each agency's files stay apart. */
export async function agencyKey(path: string) {
  const agencyId = await currentAgencyId();
  if (!agencyId) throw new Error("No agency is set, so the file has nowhere to go.");
  return `agencies/${agencyId}/${path}`;
}

const safeKey = (key: string) => {
  if (key.includes("..") || key.startsWith("/") || !/^[\w./-]+$/.test(key)) throw new Error("Unsafe storage key.");
  return key;
};

function s3Storage(): Storage {
  const client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: Boolean(env.S3_ENDPOINT),
    credentials: env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY } : undefined,
  });
  const Bucket = env.S3_BUCKET!;
  const full = (key: string) => `${env.S3_PREFIX}${safeKey(key)}`;
  return {
    kind: "s3",
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket, Key: full(key), Body: body, ContentType: contentType, ServerSideEncryption: env.S3_ENDPOINT ? undefined : "AES256" }));
    },
    async read(key) {
      const result = await client.send(new GetObjectCommand({ Bucket, Key: full(key) }));
      if (!result.Body) throw new Error("File not found in storage.");
      return { body: result.Body.transformToWebStream(), size: result.ContentLength };
    },
    async signedUrl(key, fileName, inline) {
      const disposition = `${inline ? "inline" : "attachment"}; filename="${fileName.replace(/["\\]/g, "")}"`;
      return getSignedUrl(client, new GetObjectCommand({ Bucket, Key: full(key), ResponseContentDisposition: disposition }), { expiresIn: 60 });
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: full(key) }));
    },
  };
}

function localStorage(): Storage {
  const root = path.resolve(process.cwd(), env.STORAGE_DIR);
  const file = (key: string) => {
    const target = path.resolve(root, safeKey(key));
    if (!target.startsWith(root + path.sep)) throw new Error("Unsafe storage key.");
    return target;
  };
  return {
    kind: "local",
    async put(key, body) {
      const target = file(key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, body, { mode: 0o600 });
    },
    async read(key) {
      const target = file(key);
      const info = await stat(target);
      return { body: Readable.toWeb(createReadStream(target)) as ReadableStream, size: info.size };
    },
    async signedUrl() {
      return null;
    },
    async remove(key) {
      await rm(file(key), { force: true });
    },
  };
}

let instance: Storage | null = null;
export function storage(): Storage {
  instance ??= env.S3_BUCKET ? s3Storage() : localStorage();
  return instance;
}

/* For tests and the health check: read a stored file back in full. */
export async function readAll(key: string) {
  if (storage().kind === "local") return readFile(path.resolve(process.cwd(), env.STORAGE_DIR, safeKey(key)));
  const { body } = await storage().read(key);
  return Buffer.from(await new Response(body).arrayBuffer());
}
