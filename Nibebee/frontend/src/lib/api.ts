const base = () =>
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api").replace(
    /\/$/,
    "",
  );

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const token =
    typeof window !== "undefined"
      ? window.sessionStorage.getItem("nibebee_access")
      : null;
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers,
    credentials: "include",
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const j = JSON.parse(text) as { message?: string | string[] };
      if (Array.isArray(j.message)) msg = j.message.join(", ");
      else if (j.message) msg = j.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg || res.statusText);
  }
  return (await res.json()) as T;
}
