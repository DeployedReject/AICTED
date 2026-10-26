export async function api<T>(path: string, data?: unknown): Promise<T> {
  const actor = sessionStorage.getItem("demo-actor");
  const response = await fetch("/api" + path, {
    method: data === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: {
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
      ...(actor ? { "x-demo-actor": actor } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/"))
      location.assign("/");
    if (
      response.status === 403 &&
      result.error === "Use the separate IT sign-in." &&
      path === "/bootstrap"
    ) {
      sessionStorage.removeItem("demo-actor");
      location.assign("/it");
    }
    throw new Error(result.error || "Request failed.");
  }
  return result as T;
}
