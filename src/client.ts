// The SightRadar API client. Uses the global `fetch` (Node >=18, Deno, browsers),
// so there are no runtime dependencies.

import { createHmac, timingSafeEqual } from "node:crypto";
import { errorForStatus, SightRadarError } from "./errors.js";
import type {
  Batch,
  Collection,
  CompareOptions,
  CompareResult,
  DetectResult,
  ImageSource,
  IndexResult,
  ClientOptions,
  ListBatchesResult,
  ListWebhooksResult,
  RegisterWebhookOptions,
  SearchOptions,
  SelfieSource,
  SearchResult,
  SubmitBatchOptions,
  VerifyWebhookSignatureOptions,
  Wallet,
  Webhook,
} from "./types.js";

const VERSION = "1.1.0";
const DEFAULT_BASE_URL = "https://api.sightradar.com";

// Retry only on these transient statuses when maxRetries > 0.
const RETRYABLE_STATUS = new Set([429, 502, 503]);

interface RequestOptions {
  method?: string;
  jsonBody?: unknown;
  body?: BodyInit;
  query?: Record<string, string | number | undefined>;
  /**
   * Idempotency key sent as the Idempotency-Key header. Set on mutating calls
   * so a retry (below) can't double-charge. Retries are only performed on a
   * request that either is safe (GET) or carries this key.
   */
  idempotencyKey?: string;
}

export class SightRadar {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(opts: ClientOptions = {}) {
    const key =
      opts.apiKey ??
      (typeof process !== "undefined" ? process.env?.SIGHTRADAR_API_KEY : undefined);
    if (!key) {
      throw new SightRadarError(
        "No API key. Pass { apiKey } or set SIGHTRADAR_API_KEY.",
      );
    }
    this.apiKey = key;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.maxRetries = Math.max(0, opts.maxRetries ?? 0);
  }

  // -- transport ------------------------------------------------------------

  private async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (opts.query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "User-Agent": `sightradar-node/${VERSION}`,
      Accept: "application/json",
    };
    let body: BodyInit | undefined;
    if (opts.jsonBody !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.jsonBody);
    } else if (opts.body !== undefined) {
      body = opts.body;
    }
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

    const method = opts.method ?? "GET";
    // Only retry when it's SAFE: a GET (idempotent by definition) or a mutating
    // call that carries an Idempotency-Key (so a retry can't double-charge).
    // A FormData body can't be replayed across attempts reliably, so never
    // retry multipart uploads.
    const retryable =
      this.maxRetries > 0 &&
      !(body instanceof FormData) &&
      (method === "GET" || Boolean(opts.idempotencyKey));
    const maxAttempts = retryable ? this.maxRetries + 1 : 1;

    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let res: Response;
      try {
        res = await fetch(url, { method, headers, body, signal: controller.signal });
      } catch (e) {
        lastErr = new SightRadarError(
          `request failed: ${e instanceof Error ? e.message : String(e)}`,
        );
        clearTimeout(timer);
        if (attempt < maxAttempts) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw lastErr;
      } finally {
        clearTimeout(timer);
      }

      // Transient status → back off and retry (honouring Retry-After) if we can.
      if (RETRYABLE_STATUS.has(res.status) && attempt < maxAttempts) {
        await sleep(retryAfterMs(res) ?? backoffMs(attempt));
        continue;
      }

      const text = await res.text();
      if (!res.ok) {
        let message = `request failed (${res.status})`;
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === "object" && "error" in parsed) {
            message = String((parsed as { error: unknown }).error);
          }
        } catch {
          if (text) message = text.slice(0, 300);
        }
        throw errorForStatus(res.status, message);
      }

      if (!text) return {} as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new SightRadarError(`non-JSON response (status ${res.status})`, res.status);
      }
    }
    // Exhausted retries on transient failures.
    throw lastErr ?? new SightRadarError("request failed after retries");
  }

  // -- multipart ------------------------------------------------------------

  private multipart(
    file: NonNullable<ImageSource["file"]>,
    filename: string | undefined,
    fields: Record<string, string | number | undefined>,
  ): FormData {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined && v !== null) form.append(k, String(v));
    }
    const blob =
      file instanceof Blob
        ? file
        : new Blob([file as BlobPart], { type: "application/octet-stream" });
    form.append("file", blob, filename ?? "upload.jpg");
    return form;
  }

  // -- collections ----------------------------------------------------------

  createCollection(collectionId: string): Promise<Collection> {
    return this.request<Collection>("/v1/collections", {
      method: "POST",
      jsonBody: { collection_id: collectionId },
    });
  }

  async listCollections(
    opts: { q?: string; limit?: number; offset?: number } = {},
  ): Promise<Collection[]> {
    const d = await this.request<{ collections?: Collection[] } | Collection[]>(
      "/v1/collections",
      { query: { q: opts.q, limit: opts.limit ?? 50, offset: opts.offset ?? 0 } },
    );
    if (Array.isArray(d)) return d;
    return d.collections ?? [];
  }

  describeCollection(collectionId: string): Promise<Collection> {
    return this.request<Collection>(`/v1/collections/${encodeURIComponent(collectionId)}`);
  }

  /** Delete a collection and CASCADE every stored face/selfie. Irreversible. */
  deleteCollection(collectionId: string): Promise<{ status?: string; workflow_id?: string }> {
    return this.request(`/v1/collections/${encodeURIComponent(collectionId)}`, {
      method: "DELETE",
    });
  }

  // -- index / search -------------------------------------------------------

  /** Detect, embed, and store every face in a photo. */
  index(collectionId: string, src: ImageSource): Promise<IndexResult> {
    const path = `/v1/collections/${encodeURIComponent(collectionId)}/index`;
    if (src.file) {
      return this.request<IndexResult>(path, {
        method: "POST",
        body: this.multipart(src.file, src.filename, { photoId: src.photoId }),
      });
    }
    return this.request<IndexResult>(path, {
      method: "POST",
      jsonBody: imageBody(src),
    });
  }

  /** Find every stored photo a person appears in, from one selfie. */
  async search(collectionId: string, opts: SearchOptions): Promise<SearchResult> {
    const path = `/v1/collections/${encodeURIComponent(collectionId)}/search`;
    if (opts.file) {
      return normalizeSearch(
        await this.request<SearchResult>(path, {
          method: "POST",
          body: this.multipart(opts.file, opts.filename, {
            threshold: opts.threshold,
            limit: opts.limit,
          }),
        }),
      );
    }
    const payload: Record<string, unknown> = {};
    if (opts.embedding) payload.embedding = opts.embedding;
    else if (opts.url) payload.url = opts.url;
    else if (opts.gcsKey) payload.gcsKey = opts.gcsKey;
    else throw new SightRadarError("search needs one of: url, gcsKey, embedding, or file");
    if (opts.threshold !== undefined) payload.threshold = opts.threshold;
    if (opts.limit !== undefined) payload.limit = opts.limit;
    return normalizeSearch(
      await this.request<SearchResult>(path, { method: "POST", jsonBody: payload }),
    );
  }

  /** Search using a previously-stored selfie point id. */
  async searchById(
    collectionId: string,
    pointId: string,
    opts: { threshold?: number; limit?: number } = {},
  ): Promise<SearchResult> {
    const payload: Record<string, unknown> = { pointId };
    if (opts.threshold !== undefined) payload.threshold = opts.threshold;
    if (opts.limit !== undefined) payload.limit = opts.limit;
    return normalizeSearch(
      await this.request<SearchResult>(
        `/v1/collections/${encodeURIComponent(collectionId)}/search-by-id`,
        { method: "POST", jsonBody: payload },
      ),
    );
  }

  /** Register a selfie point you can later search by id. */
  registerSelfie(
    collectionId: string,
    src: SelfieSource,
  ): Promise<Record<string, unknown>> {
    if (!src.userId) throw new SightRadarError("registerSelfie requires userId");
    const path = `/v1/collections/${encodeURIComponent(collectionId)}/selfies`;
    if (src.file) {
      return this.request(path, {
        method: "POST",
        body: this.multipart(src.file, src.filename, {
          userId: src.userId,
          selfieId: src.selfieId,
        }),
      });
    }
    const payload = { ...imageBody(src), userId: src.userId } as Record<string, unknown>;
    if (src.selfieId) payload.selfieId = src.selfieId;
    return this.request(path, { method: "POST", jsonBody: payload });
  }

  // -- stateless ops --------------------------------------------------------

  /** Locate and quality-gate faces in an image. Nothing is stored. */
  detect(src: ImageSource): Promise<DetectResult> {
    if (src.file) {
      return this.request<DetectResult>("/v1/detect", {
        method: "POST",
        body: this.multipart(src.file, src.filename, {}),
      });
    }
    return this.request<DetectResult>("/v1/detect", {
      method: "POST",
      jsonBody: imageBody(src),
    });
  }

  /** 1:1 similarity / verification between two faces. Nothing is stored. */
  compare(opts: CompareOptions): Promise<CompareResult> {
    const payload: Record<string, unknown> = {};
    if (opts.sourceUrl) payload.sourceUrl = opts.sourceUrl;
    if (opts.targetUrl) payload.targetUrl = opts.targetUrl;
    if (opts.sourceGcsKey) payload.sourceGcsKey = opts.sourceGcsKey;
    if (opts.targetGcsKey) payload.targetGcsKey = opts.targetGcsKey;
    if (opts.sourceEmbedding) payload.source_embedding = opts.sourceEmbedding;
    if (opts.targetEmbedding) payload.target_embedding = opts.targetEmbedding;
    return this.request<CompareResult>("/v1/compare", {
      method: "POST",
      jsonBody: payload,
    });
  }

  // -- account --------------------------------------------------------------

  /** Get the current credit balance. */
  wallet(): Promise<Wallet> {
    return this.request<Wallet>("/v1/wallet");
  }

  /** Usage report aggregated from the ledger. */
  usage(days = 30): Promise<Record<string, unknown>> {
    return this.request("/v1/usage", { query: { days } });
  }

  // -- batch ----------------------------------------------------------------

  /**
   * Submit a batch of up to 1,000 image URLs for async index or match. Results
   * stream back per-photo via your webhook, or poll with {@link getBatch}.
   * `op` is `index` | `match` (the batch API uses `match`, not `search`).
   */
  submitBatch(opts: SubmitBatchOptions): Promise<Batch> {
    if (opts.op !== "index" && opts.op !== "match") {
      throw new SightRadarError(`submitBatch op must be 'index' or 'match', got '${opts.op}'`);
    }
    const payload: Record<string, unknown> = {
      collection_id: opts.collectionId,
      op: opts.op,
      photos: opts.photos,
    };
    if (opts.webhookEndpointId) payload.webhook_endpoint_id = opts.webhookEndpointId;
    return this.request<Batch>("/v1/batches", { method: "POST", jsonBody: payload });
  }

  /** Poll a single batch's status + per-photo counts. */
  getBatch(batchId: string): Promise<Batch> {
    return this.request<Batch>(`/v1/batches/${encodeURIComponent(batchId)}`);
  }

  /** List recent batches (newest first). */
  listBatches(opts: { limit?: number } = {}): Promise<ListBatchesResult> {
    return this.request<ListBatchesResult>("/v1/batches", { query: { limit: opts.limit } });
  }

  // -- webhooks -------------------------------------------------------------

  /**
   * Register a webhook endpoint. If you omit `secret`, the server generates one
   * and returns it ONCE in the response — store it to verify deliveries with
   * {@link verifyWebhookSignature}.
   */
  registerWebhook(opts: RegisterWebhookOptions): Promise<Webhook> {
    const payload: Record<string, unknown> = { url: opts.url };
    if (opts.secret) payload.secret = opts.secret;
    return this.request<Webhook>("/v1/webhooks", { method: "POST", jsonBody: payload });
  }

  /** List registered webhook endpoints. */
  listWebhooks(): Promise<ListWebhooksResult> {
    return this.request<ListWebhooksResult>("/v1/webhooks");
  }

  /** Disable (soft-delete) a webhook endpoint. */
  deleteWebhook(webhookEndpointId: string): Promise<Record<string, unknown>> {
    return this.request(`/v1/webhooks/${encodeURIComponent(webhookEndpointId)}`, {
      method: "DELETE",
    });
  }
}

function imageBody(src: ImageSource): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (src.url) body.url = src.url;
  else if (src.gcsKey) body.gcsKey = src.gcsKey;
  else throw new SightRadarError("provide one of: url, gcsKey, or file");
  if (src.photoId) body.photoId = src.photoId;
  return body;
}

// normalizeSearch backfills each match's `score` from the engine's field, and
// mirrors it onto the deprecated `similarity` alias so both are populated. The
// engine returns `score` (cosine similarity 0-1); older SDK builds read
// `similarity` and always got undefined — this is the P0 fix.
function normalizeSearch(res: SearchResult): SearchResult {
  if (res && Array.isArray(res.matches)) {
    for (const m of res.matches) {
      const s = m.score ?? m.similarity;
      if (s !== undefined) {
        m.score = s;
        m.similarity = s;
      }
    }
  }
  return res;
}

/** Exponential backoff with full jitter, capped at 10s. attempt is 1-based. */
function backoffMs(attempt: number): number {
  const base = Math.min(10_000, 250 * 2 ** (attempt - 1));
  return Math.floor(Math.random() * base);
}

/** Parse a Retry-After header (delta-seconds or HTTP-date) into ms, or null. */
function retryAfterMs(res: Response): number | null {
  const h = res.headers.get("retry-after");
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const when = Date.parse(h);
  if (!Number.isNaN(when)) return Math.max(0, when - Date.now());
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Verify a SightRadar webhook signature. Recomputes
 * `HMAC-SHA256(secret, `${timestamp}.${body}`)` and constant-time compares it
 * against the `X-SightRadar-Signature` header, rejecting deliveries whose
 * `X-SightRadar-Timestamp` is older than `toleranceSec` (default 300) to guard
 * against replay. `body` MUST be the exact raw request body that was signed.
 *
 * Returns true on a valid, in-window signature; false otherwise (never throws
 * on a bad signature — only on obviously invalid input).
 */
export function verifyWebhookSignature(opts: VerifyWebhookSignatureOptions): boolean {
  const { secret, timestamp, body, signature } = opts;
  const toleranceSec = opts.toleranceSec ?? 300;
  if (!secret || !signature) return false;

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return false;
  const ageSec = Math.abs(Date.now() / 1000 - tsNum);
  if (ageSec > toleranceSec) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  // Constant-time compare; length-mismatch → false without leaking timing.
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
