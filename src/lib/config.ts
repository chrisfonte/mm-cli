import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";

export interface MmAccount {
  email: string;
  password: string;
}

export interface MmConfig {
  serverUrl: string;
  accountName: string;
  account: MmAccount;
}

interface MmAccountsFile {
  accounts?: Record<string, MmAccount>;
}

export interface LoadConfigOptions {
  accountName?: string;
  credentialsPath?: string;
  env?: NodeJS.ProcessEnv;
}

export function loadConfig(options: LoadConfigOptions = {}): MmConfig {
  const env = options.env ?? process.env;
  const serverUrl = env.MM_URL ?? "http://localhost:8065";
  const credentialsPath =
    options.credentialsPath ??
    join(homedir(), ".credentials", "mattermost", "agent-accounts.yaml");

  const fileRaw = readFileSync(credentialsPath, "utf-8");
  const parsed = (yaml.load(fileRaw) as MmAccountsFile | undefined) ?? {};
  const accounts = parsed.accounts ?? {};
  const accountNames = Object.keys(accounts);

  if (accountNames.length === 0) {
    throw new Error("USER: No accounts found in credentials file.");
  }

  const selectedAccountName =
    options.accountName ?? env.MM_ACCOUNT ?? accountNames[0]!;
  const account = accounts[selectedAccountName];

  if (!account) {
    throw new Error(
      `USER: Account '${selectedAccountName}' not found in credentials file.`,
    );
  }

  return {
    serverUrl,
    accountName: selectedAccountName,
    account,
  };
}
