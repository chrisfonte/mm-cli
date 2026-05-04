import { describe, expect, it, vi } from "vitest";
import { loginAndGetToken, resolveAuthToken } from "../src/lib/auth.js";

describe("auth", () => {
  it("mock HTTP returns 200 + Token header and resolves token string", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("", { status: 200, headers: { Token: "abc123" } }),
    );

    const token = await loginAndGetToken({
      serverUrl: "http://localhost:8065",
      email: "builder@fontasticllc.local",
      password: "secret",
      fetchImpl: fetchMock,
    });

    expect(token).toBe("abc123");
  });

  it("returns stored bearer token without calling login", async () => {
    const fetchMock = vi.fn();

    const token = await resolveAuthToken({
      serverUrl: "http://localhost:8065",
      token: "stored-token",
      fetchImpl: fetchMock,
    });

    expect(token).toBe("stored-token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to password login when no bearer token is present", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("", { status: 200, headers: { Token: "abc123" } }),
    );

    const token = await resolveAuthToken({
      serverUrl: "http://localhost:8065",
      email: "builder@fontasticllc.local",
      password: "secret",
      fetchImpl: fetchMock,
    });

    expect(token).toBe("abc123");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
