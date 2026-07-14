export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const data = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}
