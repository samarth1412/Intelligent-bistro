const fallbackApiUrl = 'http://localhost:4000';

export const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? fallbackApiUrl;

export async function getJson<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as TResponse;
}
