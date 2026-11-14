// One error shape for every API route: a stable machine code plus a plain message a
// person can act on. Provider names, column names, IDs and raw driver errors stay in
// the server log, never in `error`.
//
// Response body: { code: "invalid_url", error: "Enter a valid URL." , ...extra }
// `error` keeps its old name so the existing pages keep showing it.

export function apiError(code: string, message: string, status: number, extra: Record<string, unknown> = {}): Response {
  return Response.json({ code, error: message, ...extra }, { status });
}

/** Logs the raw cause on the server and returns a plain 500/502 to the caller. */
export function serverError(where: string, cause: unknown, status = 500, message = "Something went wrong on our side. Try again in a minute."): Response {
  console.error(`[${where}]`, cause instanceof Error ? cause.message : cause);
  return apiError(status === 502 ? "provider_failed" : "server_error", message, status);
}
