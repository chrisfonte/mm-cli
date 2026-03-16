import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
export function loadConfig(options = {}) {
    const env = options.env ?? process.env;
    const serverUrl = env.MM_URL ?? "http://localhost:8065";
    const credentialsPath = options.credentialsPath ??
        join(homedir(), ".credentials", "mattermost", "agent-accounts.yaml");
    const fileRaw = readFileSync(credentialsPath, "utf-8");
    const parsed = yaml.load(fileRaw) ?? {};
    const accounts = parsed.accounts ?? {};
    const accountNames = Object.keys(accounts);
    if (accountNames.length === 0) {
        throw new Error("USER: No accounts found in credentials file.");
    }
    const selectedAccountName = options.accountName ?? env.MM_ACCOUNT ?? accountNames[0];
    const account = accounts[selectedAccountName];
    if (!account) {
        throw new Error(`USER: Account '${selectedAccountName}' not found in credentials file.`);
    }
    return {
        serverUrl,
        accountName: selectedAccountName,
        account,
    };
}
