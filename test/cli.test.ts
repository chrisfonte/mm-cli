import { describe, expect, it, vi } from "vitest";
import {
  runMentions,
  runPost,
  runRead,
  runReply,
  runWhoami,
} from "../src/cli.js";
import { printJson } from "../src/lib/output.js";
import type { MmConfig } from "../src/lib/config.js";

const config: MmConfig = {
  serverUrl: "http://localhost:8065",
  accountName: "bob",
  account: {
    token: "token123",
  },
};

describe("cli", () => {
  it("post dry-run does not call fetch and returns dry-run string", async () => {
    const fetchMock = vi.fn();

    const result = await runPost(
      { channel: "town-square", message: "hello world", apply: false },
      { fetchImpl: fetchMock, config },
    );

    expect(result).toBe("DRY RUN: would post to #town-square: hello world");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("post apply calls POST /api/v4/posts with valid JSON payload", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const channelId = "abcdefghijklmnopqrstuvwxyz";

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });

      if (url.endsWith("/api/v4/posts")) {
        return new Response(
          JSON.stringify({
            id: "post1",
            channel_id: channelId,
            user_id: "u1",
            create_at: 1,
            message: "ship it",
          }),
          { status: 201 },
        );
      }

      return new Response("not found", { status: 404 });
    });

    await runPost(
      { channel: channelId, message: "ship it", apply: true },
      { fetchImpl: fetchMock, config },
    );

    const postCall = calls.find((entry) => entry.url.endsWith("/api/v4/posts"));
    expect(postCall).toBeTruthy();
    expect(
      calls.some((entry) => entry.url.endsWith("/api/v4/users/login")),
    ).toBe(false);
    expect(postCall?.init?.method).toBe("POST");
    expect(postCall?.init?.body).toBe(
      JSON.stringify({
        channel_id: channelId,
        message: "ship it",
      }),
    );
  });

  it("read returns posts array with correct structure", async () => {
    const channelId = "abcdefghijklmnopqrstuvwxyz";
    const fetchedAt = 1770000000000;

    vi.spyOn(Date, "now").mockReturnValue(fetchedAt);

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes(`/api/v4/channels/${channelId}/posts`)) {
        return new Response(
          JSON.stringify({
            order: ["p1"],
            posts: {
              p1: {
                id: "p1",
                channel_id: channelId,
                user_id: "u1",
                create_at: 100,
                message: "hello",
              },
            },
          }),
          { status: 200 },
        );
      }

      if (url.endsWith(`/api/v4/channels/${channelId}`)) {
        return new Response(
          JSON.stringify({
            id: channelId,
            name: "decisions",
          }),
          { status: 200 },
        );
      }

      if (url.endsWith("/api/v4/users/ids")) {
        return new Response(
          JSON.stringify([
            {
              id: "u1",
              username: "agent-venture-ceo",
            },
          ]),
          { status: 200 },
        );
      }

      return new Response("not found", { status: 404 });
    });

    const posts = await runRead(
      { channel: channelId, limit: "10" },
      { fetchImpl: fetchMock, config },
    );

    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      id: "p1",
      root_id: "p1",
      channel_id: channelId,
      channel_name: "decisions",
      user_id: "u1",
      author_username: "agent-venture-ceo",
      message: "hello",
      fetched_at: fetchedAt,
    });
  });

  it("mentions returns normalized records with thread and author metadata", async () => {
    const channelId = "zyxwvutsrqponmlkjihgfedcba";
    const fetchedAt = 1770000001234;

    vi.spyOn(Date, "now").mockReturnValue(fetchedAt);

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/api/v4/users/me")) {
        return new Response(
          JSON.stringify({
            id: "user123",
            username: "agent-venture-ceo",
          }),
          { status: 200 },
        );
      }

      if (url.endsWith("/api/v4/posts/search")) {
        expect(init?.method).toBe("POST");
        return new Response(
          JSON.stringify({
            order: ["p2"],
            posts: {
              p2: {
                id: "p2",
                root_id: "root123",
                channel_id: channelId,
                user_id: "u2",
                create_at: 200,
                update_at: 250,
                message: "@agent-venture-ceo hello",
              },
            },
          }),
          { status: 200 },
        );
      }

      if (url.endsWith(`/api/v4/channels/${channelId}`)) {
        return new Response(
          JSON.stringify({
            id: channelId,
            name: "agent-coordination",
          }),
          { status: 200 },
        );
      }

      if (url.endsWith("/api/v4/users/ids")) {
        return new Response(
          JSON.stringify([
            {
              id: "u2",
              username: "agent-maxx",
            },
          ]),
          { status: 200 },
        );
      }

      return new Response("not found", { status: 404 });
    });

    const posts = await runMentions(
      { account: "venture-ceo" },
      { fetchImpl: fetchMock, config },
    );

    expect(posts).toEqual([
      {
        id: "p2",
        root_id: "root123",
        channel_id: channelId,
        channel_name: "agent-coordination",
        user_id: "u2",
        author_username: "agent-maxx",
        create_at: 200,
        update_at: 250,
        message: "@agent-venture-ceo hello",
        fetched_at: fetchedAt,
      },
    ]);
  });

  it("reply dry-run shows root_id and does not call fetch", async () => {
    const fetchMock = vi.fn();

    const result = await runReply(
      { post: "root123", message: "replying", apply: false },
      { fetchImpl: fetchMock, config },
    );

    expect(result).toBe("DRY RUN: would reply to root_id root123: replying");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("whoami returns the current Mattermost user for token-only accounts", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v4/users/me")) {
        return new Response(
          JSON.stringify({
            id: "user123",
            username: "agent-venture-ceo",
          }),
          { status: 200 },
        );
      }

      return new Response("not found", { status: 404 });
    });

    const result = await runWhoami(
      { account: "venture-ceo" },
      { fetchImpl: fetchMock, config },
    );

    expect(result).toEqual({
      id: "user123",
      username: "agent-venture-ceo",
    });
  });

  it("output.printJson returns object with schema_version 1.0", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const payload = printJson("read", [{ id: "p1" }], { count: 1 });
    spy.mockRestore();

    expect(payload.schema_version).toBe("1.0");
    expect(payload.command).toBe("read");
  });
});
