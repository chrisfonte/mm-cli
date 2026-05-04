export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface LoginOptions {
  serverUrl: string;
  email: string;
  password: string;
  fetchImpl?: FetchLike;
}

export interface ResolveAuthTokenOptions {
  serverUrl: string;
  email?: string;
  password?: string;
  token?: string;
  fetchImpl?: FetchLike;
}

export async function loginAndGetToken(options: LoginOptions): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${options.serverUrl}/api/v4/users/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      login_id: options.email,
      password: options.password,
    }),
  });

  if (!response.ok) {
    throw new Error(`AUTH: Login failed with status ${response.status}.`);
  }

  const token = response.headers.get("Token") ?? response.headers.get("token");
  if (!token) {
    throw new Error("AUTH: Login response did not include a Token header.");
  }

  return token;
}

export async function resolveAuthToken(
  options: ResolveAuthTokenOptions,
): Promise<string> {
  if (typeof options.token === "string" && options.token.length > 0) {
    return options.token;
  }

  if (!options.email || !options.password) {
    throw new Error(
      "AUTH: Account is missing both bearer token and email/password login credentials.",
    );
  }

  return loginAndGetToken({
    serverUrl: options.serverUrl,
    email: options.email,
    password: options.password,
    fetchImpl: options.fetchImpl,
  });
}
