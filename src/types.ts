// Response and option types for the SightRadar Node/TypeScript client.

export interface Collection {
  collection_id: string;
  status: "active" | "deleting" | "deleted" | string;
  photo_count: number;
  face_count: number;
  selfie_count: number;
  created_at?: string;
}

export interface Match {
  photo_id?: string;
  /** Cosine similarity (0-1) of this match. Primary field returned by the engine. */
  score?: number;
  /**
   * @deprecated Use {@link Match.score} instead. Kept as a back-compat alias;
   * the SDK populates both `score` and `similarity` with the same value.
   */
  similarity?: number;
  point_id?: string;
  /** Any fields not modelled above. */
  [key: string]: unknown;
}

export interface SearchResult {
  collection_id: string;
  matches: Match[];
  photo_ids: string[];
  /** Present when no match: no_face | low_quality_selfie | point_not_found. */
  reason?: string;
  model_version?: string;
}

export interface IndexResult {
  collection_id: string;
  photo_id?: string;
  /** Faces stored. */
  indexed: number;
  detected_face_count: number;
  /** Detected but quality-gated out. */
  rejected_face_count: number;
  faces: unknown[];
  model_version?: string;
}

export interface CompareResult {
  face_found: boolean;
  /** Cosine similarity (0-1), or null when no face was found. */
  similarity: number | null;
  match: boolean;
  threshold?: number;
}

export interface DetectResult {
  detected_face_count: number;
  gated_face_count: number;
  faces: unknown[];
}

export interface Wallet {
  balance_credits: number;
}

export interface ClientOptions {
  /** Your frs_<prefix>_<secret> key. Falls back to SIGHTRADAR_API_KEY. */
  apiKey?: string;
  /** Override the API base URL. */
  baseUrl?: string;
  /** Per-request timeout (ms). Default 30000. */
  timeoutMs?: number;
  /**
   * Max automatic retries for transient failures (429/502/503). Default 0 (off).
   * Opt-in. Only safe/idempotent calls and calls carrying an Idempotency-Key
   * are retried, with exponential backoff + jitter, honouring `Retry-After`.
   */
  maxRetries?: number;
}

/** Batch operation kind. The batch API uses `match` (not `search`). */
export type BatchOp = "index" | "match";

export interface SubmitBatchOptions {
  collectionId: string;
  op: BatchOp;
  /** Photos to process. Shape mirrors the gateway's batch payload. */
  photos: unknown[];
  /** Optional webhook endpoint id to notify on completion. */
  webhookEndpointId?: string;
}

export interface Batch {
  id: string;
  collection_id?: string;
  op?: BatchOp | string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  /** Any fields not modelled above. */
  [key: string]: unknown;
}

export interface ListBatchesResult {
  batches: Batch[];
  [key: string]: unknown;
}

export interface RegisterWebhookOptions {
  url: string;
  /** Signing secret used to verify inbound webhook signatures. */
  secret?: string;
}

export interface Webhook {
  id: string;
  url?: string;
  created_at?: string;
  /** Any fields not modelled above. */
  [key: string]: unknown;
}

export interface ListWebhooksResult {
  webhooks: Webhook[];
  [key: string]: unknown;
}

/** Inputs for {@link verifyWebhookSignature}. */
export interface VerifyWebhookSignatureOptions {
  /** The endpoint signing secret. */
  secret: string;
  /** The `X-SightRadar-Timestamp` value (unix seconds, as sent). */
  timestamp: string | number;
  /** The raw request body (exact bytes/string that was signed). */
  body: string;
  /** The `X-SightRadar-Signature` header value (hex HMAC-SHA256). */
  signature: string;
  /** Max allowed age of the timestamp, in seconds. Default 300. */
  toleranceSec?: number;
}

/** One image source — provide exactly one of url / gcsKey / file. */
export interface ImageSource {
  url?: string;
  gcsKey?: string;
  /** A Blob/File (browser) or Buffer/Uint8Array (Node) to upload. */
  file?: Blob | Buffer | Uint8Array | ArrayBuffer;
  /** Optional filename for an uploaded file. */
  filename?: string;
  /** Optional per-image key. */
  photoId?: string;
}

/**
 * An image plus the identity it belongs to, for selfie registration.
 *
 * `userId` is required by the API; `selfieId` optionally names this selfie.
 * `photoId` is deliberately omitted: the selfies endpoint does not accept it,
 * so inheriting it from {@link ImageSource} would advertise a field that the
 * multipart path drops while the JSON path forwarded — two paths disagreeing
 * on the same call.
 */
export interface SelfieSource extends Omit<ImageSource, "photoId"> {
  userId: string;
  selfieId?: string;
}

export interface SearchOptions extends ImageSource {
  /** 512-d precomputed embedding (alternative to an image). */
  embedding?: number[];
  /** Minimum cosine similarity (0-1). */
  threshold?: number;
  /** Max matches to return. */
  limit?: number;
}

export interface CompareOptions {
  sourceUrl?: string;
  targetUrl?: string;
  sourceGcsKey?: string;
  targetGcsKey?: string;
  sourceEmbedding?: number[];
  targetEmbedding?: number[];
}
