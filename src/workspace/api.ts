export async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch("/api" + path, {
    method: data === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: {
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/"))
      location.assign(location.pathname.startsWith("/it/") ? "/it" : "/");
    throw new Error(result.error || "Request failed.");
  }
  return result as T;
}
