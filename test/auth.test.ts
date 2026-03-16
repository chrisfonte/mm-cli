import { describe, expect, it, vi } from "vitest";
import { loginAndGetToken } from "../src/lib/auth.js";

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
});
