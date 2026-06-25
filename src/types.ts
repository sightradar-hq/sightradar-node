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
