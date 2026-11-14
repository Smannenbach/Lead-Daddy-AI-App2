// Browser helpers for calling the app's own API.

/** Why a call failed, in words the user can act on. Prefers the server's own message. */
export function describeFailure(status: number, body: unknown): string {
  const apiError =
    body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
      ? (body as { error: string }).error
      : "";
  if (status === 401) return "Your session has expired. Sign in again.";
  if (apiError) return apiError;
  if (status === 403) return "This account doesn't have access to Lead Daddy yet. Ask an admin to add it.";
  return "Something went wrong on our side. Try again in a minute.";
}

export type JsonResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

/** GET a JSON API route, failing loudly. A redirect or HTML answer means the session ended. */
export async function getJson<T>(path: string): Promise<JsonResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, { cache: "no-store" });
  } catch {
    return { ok: false, status: 0, message: "Can't reach the server. Check your connection and try again." };
  }
  const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
  if (res.redirected || !isJson) return { ok: false, status: 401, message: describeFailure(401, null) };
  const body = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, status: res.status, message: describeFailure(res.status, body) };
  return { ok: true, data: body as T };
}

/** POST/PATCH/DELETE with JSON; returns status + parsed body (never throws). */
export async function sendJson(path: string, method: string, body?: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    if (!res.ok && typeof data.error !== "string") data.error = describeFailure(res.status, data);
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Can't reach the server. Check your connection and try again." } };
  }
}
