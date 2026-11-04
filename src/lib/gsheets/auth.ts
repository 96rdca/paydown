/**
 * Service-account OAuth for the Sheets write API.
 *
 * A JWT client (google-auth-library) is built from the service-account JSON and
 * scoped to `spreadsheets`. Access tokens last ~1h, so the token (not the
 * client) is cached until shortly before expiry; the client is rebuilt on every
 * refresh, which also picks up a rotated key file without a server restart.
 *
 * Errors are wrapped in UpstreamError with a message that is safe to show the
 * owner — no key material, no signature details.
 */
import { JWT } from "google-auth-library";
import { loadServiceAccount } from "./config";
import { NotConfiguredError, UpstreamError } from "./errors";

export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

/** Refresh a minute early so an in-flight write never uses an expiring token. */
export const TOKEN_EXPIRY_MARGIN_MS = 60_000;
const FALLBACK_TTL_MS = 3_600_000;

let cachedToken: { token: string; expiresAt: number } | null = null;

function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error);
}

/** Cached (until expiry) bearer token for the Sheets API. */
export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - TOKEN_EXPIRY_MARGIN_MS > Date.now()) {
    return cachedToken.token;
  }

  const credentials = loadServiceAccount();
  if (!credentials) {
    throw new NotConfiguredError();
  }

  const client = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [SHEETS_SCOPE],
  });

  let token: string | null | undefined;
  let expiresAt: number;

  try {
    const response = await client.getAccessToken();
    token = response.token;
    expiresAt =
      typeof client.credentials.expiry_date === "number"
        ? client.credentials.expiry_date
        : Date.now() + FALLBACK_TTL_MS;
  } catch (error) {
    throw new UpstreamError(
      `No se pudo autenticar con Google (service account): ${describe(error)}`,
    );
  }

  if (!token) {
    throw new UpstreamError(
      "No se pudo autenticar con Google: la service account no devolvió un token.",
    );
  }

  cachedToken = { token, expiresAt };
  return token;
}

/** Test seam: forget the cached token (used by auth/write tests). */
export function resetAccessTokenCache(): void {
  cachedToken = null;
}
