# mm-cli

Purpose-built Mattermost CLI for agent tooling.

## Install

```bash
npm install -g github:chrisfonte/mm-cli
```

## Auth Setup

Create credentials at `~/.credentials/mattermost/agent-accounts.yaml`.

Bearer token is preferred and supports token-only bot accounts:

```yaml
accounts:
  venture-ceo:
    email: agent-venture-ceo@localhost
    token: "<mattermost personal access token or bot token>"
```

Password login remains supported as a fallback for older accounts:

```yaml
accounts:
  bob:
    email: builder@fontasticllc.local
    password: "<mattermost password>"
```

Account selection order:

- `--account <agent>`
- `MM_ACCOUNT` env var
- first account in YAML

## Server URL

Set `MM_URL` to point at your Mattermost server.

```bash
export MM_URL="http://localhost:8065"
```

If unset, default is `http://localhost:8065`.

## Auth Behavior

- If the selected account has `token`, `mm` uses `Authorization: Bearer <token>` directly.
- If no `token` is present, `mm` falls back to `POST /api/v4/users/login` with `email` and `password`.
- Accounts must provide either `token` or `email` plus `password`.

## Commands

### Post

```bash
# Channel names and IDs both work
mm post --channel town-square --message "hello" --account bob
mm post --channel town-square --message "hello" --account bob --apply
```

`post` is dry-run by default. Add `--apply` to actually send.

### Reply

```bash
mm reply --post <root_id> --message "ack" --account bob
mm reply --post <root_id> --message "ack" --account bob --apply
```

`reply` is dry-run by default. Add `--apply` to actually send.

### Read

```bash
mm read --channel town-square --limit 10 --account bob
mm read --channel town-square --since 1710000000000 --json
```

### Mentions

```bash
mm mentions --account bob
mm mentions --since 1710000000000 --json
```

## Safety

`mm post` and `mm reply` are dry-run by default. No write API calls are made unless `--apply` is provided.
