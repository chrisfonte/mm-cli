#!/usr/bin/env node
import { Command } from "commander";
import { resolveAuthToken, type FetchLike } from "./lib/auth.js";
import { MattermostClient, type MattermostPost } from "./lib/client.js";
import { loadConfig, type MmConfig } from "./lib/config.js";
import { printJson, printText, type JsonEnvelope } from "./lib/output.js";

interface SharedOptions {
  account?: string;
  json?: boolean;
}

interface PostOptions extends SharedOptions {
  channel: string;
  message: string;
  apply?: boolean;
}

interface ReplyOptions extends SharedOptions {
  post: string;
  message: string;
  apply?: boolean;
}

interface ReadOptions extends SharedOptions {
  channel: string;
  since?: string;
  limit?: string;
}

interface MentionsOptions extends SharedOptions {
  since?: string;
}

interface WhoamiOptions extends SharedOptions {}

interface RunDeps {
  fetchImpl?: FetchLike;
  config?: MmConfig;
  credentialsPath?: string;
  env?: NodeJS.ProcessEnv;
}

function parsePositiveInt(
  input: string | undefined,
  field: string,
): number | undefined {
  if (typeof input === "undefined") {
    return undefined;
  }

  const value = Number(input);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`USER: ${field} must be a non-negative integer.`);
  }

  return value;
}

function resolveConfig(account: string | undefined, deps: RunDeps): MmConfig {
  if (deps.config) {
    return deps.config;
  }

  return loadConfig({
    accountName: account,
    credentialsPath: deps.credentialsPath,
    env: deps.env,
  });
}

async function buildClient(
  account: string | undefined,
  deps: RunDeps,
): Promise<MattermostClient> {
  const config = resolveConfig(account, deps);
  const token = await resolveAuthToken({
    serverUrl: config.serverUrl,
    email: config.account.email,
    password: config.account.password,
    token: config.account.token,
    fetchImpl: deps.fetchImpl,
  });

  return new MattermostClient(config.serverUrl, token, deps.fetchImpl);
}

export async function runPost(
  options: PostOptions,
  deps: RunDeps = {},
): Promise<string | MattermostPost> {
  if (!options.apply) {
    return `DRY RUN: would post to #${options.channel}: ${options.message}`;
  }

  const client = await buildClient(options.account, deps);
  const channelId = await client.resolveChannelId(options.channel);
  return client.createPost(channelId, options.message);
}

export async function runReply(
  options: ReplyOptions,
  deps: RunDeps = {},
): Promise<string | MattermostPost> {
  if (!options.apply) {
    return `DRY RUN: would reply to root_id ${options.post}: ${options.message}`;
  }

  const client = await buildClient(options.account, deps);
  const rootPost = await client.getPost(options.post);
  return client.createPost(rootPost.channel_id, options.message, options.post);
}

export async function runRead(
  options: ReadOptions,
  deps: RunDeps = {},
): Promise<MattermostPost[]> {
  const since = parsePositiveInt(options.since, "since");
  const limit = parsePositiveInt(options.limit, "limit") ?? 10;
  const client = await buildClient(options.account, deps);
  const channelId = await client.resolveChannelId(options.channel);
  return client.readChannelPosts(channelId, since, limit);
}

export async function runMentions(
  options: MentionsOptions,
  deps: RunDeps = {},
): Promise<MattermostPost[]> {
  const since = parsePositiveInt(options.since, "since");
  const client = await buildClient(options.account, deps);
  const user = await client.getCurrentUser();
  return client.searchMentions(user.username, since);
}

export async function runWhoami(
  options: WhoamiOptions,
  deps: RunDeps = {},
): Promise<{ id: string; username: string }> {
  const client = await buildClient(options.account, deps);
  return client.getCurrentUser();
}

function normalizeErrorCode(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("USER:")) {
    return 1;
  }

  if (message.startsWith("API:")) {
    return 2;
  }

  if (message.startsWith("AUTH:")) {
    return 3;
  }

  return 1;
}

function emitResult(
  command: string,
  result: MattermostPost[] | string | MattermostPost,
  json: boolean,
): JsonEnvelope<MattermostPost> | string {
  if (json && Array.isArray(result)) {
    return printJson(command, result, { count: result.length });
  }

  if (typeof result === "string") {
    return printText(result);
  }

  if (Array.isArray(result)) {
    if (result.length === 0) {
      return printText("No results.");
    }

    const lines = result.map((post) => `[${post.id}] ${post.message}`);
    return printText(lines.join("\n"));
  }

  return printText(`[${result.id}] ${result.message}`);
}

export async function runCli(argv = process.argv): Promise<void> {
  const program = new Command();

  program
    .name("mm")
    .description("Purpose-built Mattermost CLI for agent tooling");

  program
    .command("post")
    .description("Post a message to a channel")
    .requiredOption("--channel <name|id>", "Channel name or id")
    .requiredOption("--message <text>", "Message text")
    .option("--account <agent>", "Agent account key")
    .option("--apply", "Execute write operation")
    .action(async (options: PostOptions) => {
      const result = await runPost(options);
      emitResult("post", result, false);
    });

  program
    .command("reply")
    .description("Reply to a root post id")
    .requiredOption("--post <root_id>", "Root post id")
    .requiredOption("--message <text>", "Message text")
    .option("--account <agent>", "Agent account key")
    .option("--apply", "Execute write operation")
    .action(async (options: ReplyOptions) => {
      const result = await runReply(options);
      emitResult("reply", result, false);
    });

  program
    .command("read")
    .description("Read posts from a channel")
    .requiredOption("--channel <name|id>", "Channel name or id")
    .option("--since <epoch_ms>", "Only include posts after this epoch ms")
    .option("--limit <count>", "Max posts to return", "10")
    .option("--account <agent>", "Agent account key")
    .option("--json", "Emit JSON output envelope")
    .action(async (options: ReadOptions) => {
      const result = await runRead(options);
      emitResult("read", result, Boolean(options.json));
    });

  program
    .command("mentions")
    .description("Find mentions for current user")
    .option("--account <agent>", "Agent account key")
    .option("--since <epoch_ms>", "Only include posts after this epoch ms")
    .option("--json", "Emit JSON output envelope")
    .action(async (options: MentionsOptions) => {
      const result = await runMentions(options);
      emitResult("mentions", result, Boolean(options.json));
    });

  program
    .command("whoami")
    .description("Verify auth and print the current Mattermost user")
    .option("--account <agent>", "Agent account key")
    .option("--json", "Emit JSON output envelope")
    .action(async (options: WhoamiOptions) => {
      const result = await runWhoami(options);
      if (options.json) {
        printJson("whoami", [result], { count: 1 });
        return;
      }

      printText(`${result.username} (${result.id})`);
    });

  try {
    await program.parseAsync(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = normalizeErrorCode(error);
  }
}

// Always run — this file is the CLI entry point.
// Symlink-based invocation (npm install -g) breaks import.meta.url comparison,
// so unconditional call is the correct pattern for a pure CLI entry point.
await runCli();
