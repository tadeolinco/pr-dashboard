const GITHUB_API_ORIGIN = "https://api.github.com";
const GITHUB_GRAPHQL = `${GITHUB_API_ORIGIN}/graphql`;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(response: Response): number | null {
  const raw = response.headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const dateMs = Date.parse(raw);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

function isRetryableGraphqlHttp(status: number) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

export async function githubGraphql<T>(
  token: string,
  query: string,
  variables: Record<string, string | null | undefined>,
  options?: { attempts?: number },
): Promise<T> {
  const attempts = options?.attempts ?? 3;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(GITHUB_GRAPHQL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(typeof window === "undefined"
            ? { "User-Agent": "pr-dashboard" }
            : {}),
        },
        body: JSON.stringify({ query, variables }),
      });

      if (!response.ok) {
        if (
          isRetryableGraphqlHttp(response.status) &&
          attempt < attempts - 1
        ) {
          const wait =
            retryAfterMs(response) ?? 400 * 2 ** attempt;
          await sleep(wait);
          continue;
        }
        throw new Error(`GitHub GraphQL failed (${response.status})`);
      }

      const json = (await response.json()) as {
        data?: T;
        errors?: Array<{ message: string }>;
      };
      if (json.errors?.length) {
        throw new Error(json.errors.map((e) => e.message).join("; "));
      }
      if (!json.data) throw new Error("GitHub GraphQL returned no data");
      return json.data;
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof TypeError ||
        (error instanceof Error && error.message.includes("fetch failed"));
      if (!retryable || attempt >= attempts - 1) break;
      await sleep(400 * 2 ** attempt);
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error(String(lastError ?? "GitHub GraphQL failed"));
}

export async function githubFetchWithRetry(
  url: string,
  init: RequestInit,
  options?: { attempts?: number },
): Promise<Response> {
  // Callers attach the user's token; never send it anywhere but the GitHub API
  // (pagination follows Link headers, so the URL is not always built here).
  if (new URL(url).origin !== GITHUB_API_ORIGIN) {
    throw new Error(`Refusing to send GitHub credentials to ${new URL(url).origin}`);
  }
  const attempts = options?.attempts ?? 3;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, init);
      if (
        isRetryableGraphqlHttp(response.status) &&
        attempt < attempts - 1
      ) {
        const wait = retryAfterMs(response) ?? 400 * 2 ** attempt;
        await sleep(wait);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof TypeError ||
        (error instanceof Error && error.message.includes("fetch failed"));
      if (!retryable || attempt >= attempts - 1) break;
      await sleep(400 * 2 ** attempt);
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error(String(lastError ?? "GitHub request failed"));
}
