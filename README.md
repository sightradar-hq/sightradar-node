# SightRadar — Node.js / TypeScript client

Official client for the [SightRadar](https://sightradar.com) face recognition
API. No runtime dependencies — uses the built-in `fetch` (Node ≥ 18, Deno,
browsers). Ships full TypeScript types.

```bash
npm install sightradar
```

## Authenticate

Create an API key in the [console](https://sightradar.com/login), then pass it
directly or via the `SIGHTRADAR_API_KEY` environment variable.

```ts
import { SightRadar } from "sightradar";

const sr = new SightRadar({ apiKey: "frs_..." }); // or new SightRadar() with the env var
```

## Core workflow

```ts
// 1. Create a collection to hold faces.
await sr.createCollection("event-2026");

// 2. Index faces from photos (URL, GCS key, or an uploaded file).
await sr.index("event-2026", { url: "https://example.com/group.jpg" });
await sr.index("event-2026", { file: buffer, filename: "photo.jpg", photoId: "img-42" });

// 3. Search the collection with one selfie.
const result = await sr.search("event-2026", { url: "https://example.com/selfie.jpg" });
for (const m of result.matches) console.log(m.photo_id, m.similarity);
```

## Stateless operations (nothing stored)

```ts
// Detect + quality-gate faces in an image.
const det = await sr.detect({ url: "https://example.com/photo.jpg" });
console.log(det.detected_face_count, det.gated_face_count);

// 1:1 verification between two faces.
const cmp = await sr.compare({
  sourceUrl: "https://example.com/a.jpg",
  targetUrl: "https://example.com/b.jpg",
});
console.log(cmp.match, cmp.similarity);
```

## Account

```ts
console.log((await sr.wallet()).balance_credits);
console.log(await sr.usage(30));
```

## Errors

Every non-2xx response rejects with a typed error:

```ts
import { NotFoundError, AuthenticationError } from "sightradar";

try {
  await sr.describeCollection("missing");
} catch (e) {
  if (e instanceof NotFoundError) console.log(e.statusCode, e.message);
}
```

Error classes: `SightRadarError` (base), `AuthenticationError` (401),
`InsufficientCreditsError` (402), `NotFoundError` (404), `RateLimitError` (429).

## Image inputs

Index / search / detect / register-selfie accept exactly one image source:

- `url` — a public image URL
- `gcsKey` — a Google Cloud Storage object key
- `file` — a `Blob`/`File` (browser) or `Buffer`/`Uint8Array` (Node), uploaded as multipart

`search` additionally accepts `embedding` (a 512-number array).

## License

MIT
