// The SightRadar API client. Uses the global `fetch` (Node >=18, Deno, browsers),
// so there are no runtime dependencies.

import { errorForStatus, SightRadarError } from "./errors.js";
import type {
  Collection,
  CompareOptions,
  CompareResult,
  DetectResult,
  ImageSource,
  IndexResult,
  ClientOptions,
  SearchOptions,
  SearchResult,
  Wallet,
} from "./types.js";

const VERSION = "1.0.0";
const DEFAULT_BASE_URL = "https://api.sightradar.com";

interface RequestOptions {
  method?: string;
  jsonBody?: unknown;
  body?: BodyInit;
  query?: Record<string, string | number | undefined>;
}

export class SightRadar {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        method: opts.method ?? "GET",
        headers,
        body,
        signal: controller.signal,
      });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      throw new SightRadarError(`request failed: ${reason}`);
    } finally {
      clearTimeout(timer);
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
  search(collectionId: string, opts: SearchOptions): Promise<SearchResult> {
    const path = `/v1/collections/${encodeURIComponent(collectionId)}/search`;
    if (opts.file) {
      return this.request<SearchResult>(path, {
        method: "POST",
        body: this.multipart(opts.file, opts.filename, {
          threshold: opts.threshold,
          limit: opts.limit,
        }),
      });
    }
    const payload: Record<string, unknown> = {};
    if (opts.embedding) payload.embedding = opts.embedding;
    else if (opts.url) payload.url = opts.url;
    else if (opts.gcsKey) payload.gcsKey = opts.gcsKey;
    else throw new SightRadarError("search needs one of: url, gcsKey, embedding, or file");
    if (opts.threshold !== undefined) payload.threshold = opts.threshold;
    if (opts.limit !== undefined) payload.limit = opts.limit;
    return this.request<SearchResult>(path, { method: "POST", jsonBody: payload });
  }

  /** Search using a previously-stored selfie point id. */
  searchById(
    collectionId: string,
    pointId: string,
    opts: { threshold?: number; limit?: number } = {},
  ): Promise<SearchResult> {
    const payload: Record<string, unknown> = { id: pointId };
    if (opts.threshold !== undefined) payload.threshold = opts.threshold;
    if (opts.limit !== undefined) payload.limit = opts.limit;
    return this.request<SearchResult>(
      `/v1/collections/${encodeURIComponent(collectionId)}/search-by-id`,
      { method: "POST", jsonBody: payload },
    );
  }

  /** Register a selfie point you can later search by id. */
  registerSelfie(collectionId: string, src: ImageSource): Promise<Record<string, unknown>> {
    const path = `/v1/collections/${encodeURIComponent(collectionId)}/selfies`;
    if (src.file) {
      return this.request(path, {
        method: "POST",
        body: this.multipart(src.file, src.filename, { photoId: src.photoId }),
      });
    }
    return this.request(path, { method: "POST", jsonBody: imageBody(src) });
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
}

function imageBody(src: ImageSource): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (src.url) body.url = src.url;
  else if (src.gcsKey) body.gcsKey = src.gcsKey;
  else throw new SightRadarError("provide one of: url, gcsKey, or file");
  if (src.photoId) body.photoId = src.photoId;
  return body;
}
