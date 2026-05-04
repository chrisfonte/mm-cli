import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/lib/config.js";

describe("config", () => {
  it("loads serverUrl and first account from YAML correctly", () => {
    const dir = mkdtempSync(join(tmpdir(), "mm-config-"));
    const file = join(dir, "agent-accounts.yaml");

    writeFileSync(
      file,
      [
        "accounts:",
        "  bob:",
        "    email: builder@fontasticllc.local",
        '    password: "GJnSTCQgttSi9SxKbE4IRA=="',
      ].join("\n"),
      "utf-8",
    );

    const config = loadConfig({
      credentialsPath: file,
      env: { MM_URL: "http://localhost:8065" },
    });

    expect(config.serverUrl).toBe("http://localhost:8065");
    expect(config.accountName).toBe("bob");
    expect(config.account.email).toBe("builder@fontasticllc.local");
  });

  it("accepts token-only accounts from YAML", () => {
    const dir = mkdtempSync(join(tmpdir(), "mm-config-"));
    const file = join(dir, "agent-accounts.yaml");

    writeFileSync(
      file,
      [
        "accounts:",
        "  venture-ceo:",
        "    email: agent-venture-ceo@localhost",
        '    token: "token-123"',
      ].join("\n"),
      "utf-8",
    );

    const config = loadConfig({
      credentialsPath: file,
      env: { MM_URL: "http://localhost:8065" },
    });

    expect(config.accountName).toBe("venture-ceo");
    expect(config.account.token).toBe("token-123");
  });
});
