/**
 * SightRadar — official Node.js / TypeScript client for the face recognition API.
 *
 * @example
 * ```ts
 * import { SightRadar } from "sightradar";
 *
 * const sr = new SightRadar({ apiKey: "frs_..." }); // or set SIGHTRADAR_API_KEY
 * await sr.createCollection("event-2026");
 * await sr.index("event-2026", { url: "https://example.com/group.jpg" });
 * const result = await sr.search("event-2026", { url: "https://example.com/selfie.jpg" });
 * for (const m of result.matches) console.log(m.photo_id, m.similarity);
 * ```
 */

export { SightRadar } from "./client.js";
export {
  SightRadarError,
  AuthenticationError,
  InsufficientCreditsError,
  NotFoundError,
  RateLimitError,
} from "./errors.js";
export type {
  Collection,
  Match,
  SearchResult,
  IndexResult,
  CompareResult,
  DetectResult,
  Wallet,
  ClientOptions,
  ImageSource,
  SearchOptions,
  CompareOptions,
} from "./types.js";
