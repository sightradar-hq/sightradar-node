/**
 * Request-contract tests: assert the EXACT wire shape the API requires.
 *
 * Two contract bugs reached npm because nothing asserted the bytes we send.
 * Each assertion below corresponds to a real 400 observed against
 * api.sightradar.com:
 *
 *  - `search-by-id` needs `pointId`; `{id: ...}` -> 400 "pointId is required"
 *  - `selfies` needs `userId`; omitting it -> 400 "userId is required for
 *    selfie registration"
 *
 * `fetch` is stubbed, so no network access is required.
 */

import { afterEach, describe, expect, it } from "vitest";
import { SightRadar, SightRadarError } from "../src/index.js";

interface Captured {
  url: string;
  method: string;
  body: unknown;
  contentType: string | null;
}

const realFetch = globalThis.fetch;

/** Stub fetch, capturing every request the client attempts. */
function stubFetch(responseBody: Record<string, unknown> = {}): { calls: Captured[] } {
  const calls: Captured[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers as HeadersInit | undefined);
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body,
      contentType: headers.get("content-type"),
    });
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { calls };
}

function client(): SightRadar {
  return new SightRadar({ apiKey: "frs_testpref_testsecret" });
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("searchById", () => {
  it("sends pointId, never id", async () => {
    const { calls } = stubFetch({ matches: [] });
    await client().searchById("event-2026", "pt-abc", { threshold: 0.5, limit: 7 });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/v1/collections/event-2026/search-by-id");
    const body = JSON.parse(calls[0].body as string);
    // The API rejects {"id": ...} with 400 "pointId is required".
    expect(body.pointId).toBe("pt-abc");
    expect(body).not.toHaveProperty("id");
    expect(body.threshold).toBe(0.5);
    expect(body.limit).toBe(7);
  });
});

describe("registerSelfie", () => {
  it("sends userId and selfieId as multipart fields", async () => {
    const { calls } = stubFetch({ point_id: "pt-stub" });
    await client().registerSelfie("event-2026", {
      file: new Uint8Array([1, 2, 3]),
      filename: "selfie.jpg",
      userId: "user-42",
      selfieId: "selfie-9",
    });

    expect(calls[0].url).toContain("/v1/collections/event-2026/selfies");
    const form = calls[0].body as FormData;
    expect(form).toBeInstanceOf(FormData);
    // Omitting userId is a 400; photoId is NOT a field this endpoint accepts.
    expect(form.get("userId")).toBe("user-42");
    expect(form.get("selfieId")).toBe("selfie-9");
    expect(form.get("photoId")).toBeNull();
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  it("sends userId in the JSON body when given a url", async () => {
    const { calls } = stubFetch({ point_id: "pt-stub" });
    await client().registerSelfie("event-2026", {
      url: "https://cdn.example.com/a.jpg",
      userId: "user-42",
    });

    const body = JSON.parse(calls[0].body as string);
    expect(body.userId).toBe("user-42");
    expect(body.url).toBe("https://cdn.example.com/a.jpg");
  });

  it("throws locally when userId is missing, without a round-trip", async () => {
    const { calls } = stubFetch();
    expect(() =>
      // Deliberately bypassing the type to model a plain-JS caller.
      client().registerSelfie("event-2026", { file: new Uint8Array([1]) } as never),
    ).toThrow(SightRadarError);
    expect(calls).toHaveLength(0);
  });
});
