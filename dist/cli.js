import { Command } from "commander";
import { loginAndGetToken } from "./lib/auth.js";
import { MattermostClient } from "./lib/client.js";
import { loadConfig } from "./lib/config.js";
import { printJson, printText } from "./lib/output.js";
function parsePositiveInt(input, field) {
    if (typeof input === "undefined") {
        return undefined;
    }
    const value = Number(input);
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`USER: ${field} must be a non-negative integer.`);
    }
    return value;
}
function resolveConfig(account, deps) {
    if (deps.config) {
        return deps.config;
    }
    return loadConfig({
        accountName: account,
        credentialsPath: deps.credentialsPath,
        env: deps.env,
    });
}
async function buildClient(account, deps) {
    const config = resolveConfig(account, deps);
    const token = await loginAndGetToken({
        serverUrl: config.serverUrl,
        email: config.account.email,
        password: config.account.password,
        fetchImpl: deps.fetchImpl,
    });
    return new MattermostClient(config.serverUrl, token, deps.fetchImpl);
}
export async function runPost(options, deps = {}) {
    if (!options.apply) {
        return `DRY RUN: would post to #${options.channel}: ${options.message}`;
    }
    const client = await buildClient(options.account, deps);
    const channelId = await client.resolveChannelId(options.channel);
    return client.createPost(channelId, options.message);
}
export async function runReply(options, deps = {}) {
    if (!options.apply) {
        return `DRY RUN: would reply to root_id ${options.post}: ${options.message}`;
    }
    const client = await buildClient(options.account, deps);
    const rootPost = await client.getPost(options.post);
    return client.createPost(rootPost.channel_id, options.message, options.post);
}
export async function runRead(options, deps = {}) {
    const since = parsePositiveInt(options.since, "since");
    const limit = parsePositiveInt(options.limit, "limit") ?? 10;
    const client = await buildClient(options.account, deps);
    const channelId = await client.resolveChannelId(options.channel);
    return client.readChannelPosts(channelId, since, limit);
}
export async function runMentions(options, deps = {}) {
    const since = parsePositiveInt(options.since, "since");
    const client = await buildClient(options.account, deps);
    const user = await client.getCurrentUser();
    return client.searchMentions(user.username, since);
}
function normalizeErrorCode(error) {
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
function emitResult(command, result, json) {
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
export async function runCli(argv = process.argv) {
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
        .action(async (options) => {
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
        .action(async (options) => {
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
        .action(async (options) => {
        const result = await runRead(options);
        emitResult("read", result, Boolean(options.json));
    });
    program
        .command("mentions")
        .description("Find mentions for current user")
        .option("--account <agent>", "Agent account key")
        .option("--since <epoch_ms>", "Only include posts after this epoch ms")
        .option("--json", "Emit JSON output envelope")
        .action(async (options) => {
        const result = await runMentions(options);
        emitResult("mentions", result, Boolean(options.json));
    });
    try {
        await program.parseAsync(argv);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        process.exitCode = normalizeErrorCode(error);
    }
}
const isDirectExecution = (() => {
    if (!process.argv[1]) {
        return false;
    }
    return import.meta.url === new URL(`file://${process.argv[1]}`).href;
})();
if (isDirectExecution) {
    await runCli();
}
