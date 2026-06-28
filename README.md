<p align="center">
  <a href="https://sightradar.com">
    <img src="https://assets.sightradar.com/brand/sightradar-logo-lockup.svg" alt="SightRadar — Face Recognition API" width="360">
  </a>
</p>

<h1 align="center">SightRadar — Face Recognition API for Node.js & TypeScript</h1>

<p align="center">
  <strong>A high-accuracy face recognition API and a drop-in AWS Rekognition alternative.</strong><br>
  Official Node.js / TypeScript client for the <a href="https://sightradar.com">SightRadar</a> facial recognition API — face detection, 1:1 verification, and 1:N face search with zero runtime dependencies.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/sightradar"><img src="https://img.shields.io/npm/v/sightradar?color=ff3b2f" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/sightradar"><img src="https://img.shields.io/npm/dm/sightradar?color=ffce4a" alt="npm downloads"></a>
  <a href="https://github.com/sightradar-hq/sightradar-node/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/sightradar?color=1b1712" alt="License: MIT"></a>
  <a href="https://www.npmjs.com/package/sightradar"><img src="https://img.shields.io/badge/types-included-3178c6?logo=typescript&logoColor=white" alt="TypeScript types included"></a>
  <a href="https://sightradar.com/docs"><img src="https://img.shields.io/badge/docs-sightradar.com-ffce4a" alt="Documentation"></a>
</p>

---

## What is SightRadar?

**SightRadar** is a fast, accurate, and affordable **face recognition API** for developers. This is the official **Node.js / TypeScript SDK** — a thin, fully-typed wrapper over the [SightRadar facial recognition API](https://sightradar.com) that lets you add **face detection**, **face matching**, **1:1 face verification**, and **1:N face search** to any application in minutes.

If you are looking for an **AWS Rekognition alternative** with **high-accuracy face recognition**, simpler pricing, and a cleaner API, SightRadar is built for you. The SDK has **no runtime dependencies** (uses the built-in `fetch` — Node ≥ 18, Deno, Bun, and browsers), and ships **full TypeScript types** for every request and response.

- 🎯 **High-accuracy facial recognition** — state-of-the-art embeddings with quality gating for reliable matches
- ⚡ **Fast face search** — index millions of faces and search a collection with a single selfie
- 🔁 **Drop-in AWS Rekognition alternative** — familiar `index` / `search` / `detect` / `compare` operations
- 🟦 **First-class TypeScript** — typed inputs and responses, works in Node, Deno, Bun, and the browser
- 💸 **Transparent, usage-based pricing** — pay per call, no minimums ([see pricing](https://sightradar.com/pricing))

> Get a free API key at **[sightradar.com](https://sightradar.com/login)** and start building.

## SightRadar vs. AWS Rekognition

Already wrote code against **AWS Rekognition**? SightRadar mirrors the operations you know — `IndexFaces`, `SearchFacesByImage`, `DetectFaces`, `CompareFaces` — so migrating is mostly a find-and-replace, not a rewrite. See the [migration guide](https://sightradar.com/migrate).

| | SightRadar | AWS Rekognition |
|---|---|---|
| Face detection API | ✅ | ✅ |
| 1:1 face verification (compare) | ✅ | ✅ |
| 1:N face search (collections) | ✅ | ✅ |
| Selfie / liveness-style registration | ✅ | ⚠️ limited |
| Zero-dependency SDK | ✅ | ❌ (aws-sdk) |
| First-class TypeScript types | ✅ | ⚠️ partial |
| Transparent per-call pricing | ✅ | ⚠️ complex tiers |
| Free API key to start | ✅ | ⚠️ AWS account required |

## Install

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

## Core workflow — index and search faces

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

// 1:1 face verification between two faces.
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

## Resources

- 🌐 **Website:** [sightradar.com](https://sightradar.com)
- 📚 **API documentation:** [sightradar.com/docs](https://sightradar.com/docs)
- 🔑 **Get an API key:** [sightradar.com/login](https://sightradar.com/login)
- 💸 **Pricing:** [sightradar.com/pricing](https://sightradar.com/pricing)
- 🔄 **Migrate from AWS Rekognition:** [sightradar.com/migrate](https://sightradar.com/migrate)
- 🐍 **Python SDK:** [github.com/sightradar-hq/sightradar-python](https://github.com/sightradar-hq/sightradar-python)

## License

MIT © [SightRadar](https://sightradar.com)

---

<p align="center">
  <sub>
    SightRadar — high-accuracy <a href="https://sightradar.com">face recognition API</a> and <a href="https://sightradar.com/migrate">AWS Rekognition alternative</a>.
    Face detection, facial recognition, 1:1 verification, and 1:N face search for developers.
  </sub>
</p>
