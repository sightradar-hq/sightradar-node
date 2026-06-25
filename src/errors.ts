// Error types for the SightRadar client.

export class SightRadarError extends Error {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "SightRadarError";
    this.statusCode = statusCode;
    // Restore prototype chain for instanceof across transpile targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 401 — the API key is missing, malformed, or revoked. */
export class AuthenticationError extends SightRadarError {
  constructor(message: string, statusCode?: number) {
    super(message, statusCode);
    this.name = "AuthenticationError";
  }
}

/** 402 — the wallet does not have enough credits. */
export class InsufficientCreditsError extends SightRadarError {
  constructor(message: string, statusCode?: number) {
    super(message, statusCode);
    this.name = "InsufficientCreditsError";
  }
}

/** 404 — the collection, key, or resource does not exist. */
export class NotFoundError extends SightRadarError {
  constructor(message: string, statusCode?: number) {
    super(message, statusCode);
    this.name = "NotFoundError";
  }
}

/** 429 — too many requests; back off and retry. */
export class RateLimitError extends SightRadarError {
  constructor(message: string, statusCode?: number) {
    super(message, statusCode);
    this.name = "RateLimitError";
  }
}

export function errorForStatus(
  statusCode: number,
  message: string,
): SightRadarError {
  switch (statusCode) {
    case 401:
      return new AuthenticationError(message, statusCode);
    case 402:
      return new InsufficientCreditsError(message, statusCode);
    case 404:
      return new NotFoundError(message, statusCode);
    case 429:
      return new RateLimitError(message, statusCode);
    default:
      return new SightRadarError(message, statusCode);
  }
}
