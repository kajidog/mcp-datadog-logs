# fstsfog-mcp-apps

Datadog と MCP Apps 周辺のサンプル/ツールをまとめた monorepo です。

主な内容は次の2つです。

- Datadog Logs を調査する MCP サーバー
- ローカル PC のメトリクスとログを Datadog に送る Node.js サンプル

## パッケージ

| Package | Path | 用途 |
|---|---|---|
| `@kajidog/mcp-datadog-logs` | `apps/mcp-datadog-logs` | Datadog Logs を MCP から検索/集計/可視化する公開 npm package |
| `@kajidog/datadog-pc-telemetry-sample` | `apps/datadog-pc-telemetry-sample` | ローカル PC のメトリクスとログを Datadog に送るサンプル |
| `@kajidog/investigator-ui` | `packages/investigator-ui` | MCP Apps 用 UI。サーバーに単一 HTML として同梱 |
| `@kajidog/investigation-shared` | `packages/shared` | UI と MCP サーバー間で共有する型 |

## Datadog PC Telemetry Sample

ローカル PC から Datadog に次のデータを送る最小サンプルです。

- `v2.MetricsApi.submitMetrics` によるカスタムメトリクス送信
- `v2.LogsApi.submitLog` によるログ送信
- CPU 使用率、メモリ使用量、load average、uptime、Node.js process memory などの収集

実行方法:

```bash
cd apps/datadog-pc-telemetry-sample
cp .env.example .env
```

`.env` に Datadog の API key と site を設定します。Japan site の場合は `ap1.datadoghq.com` です。

```dotenv
DD_API_KEY=your-datadog-api-key
DD_SITE=ap1.datadoghq.com
DD_ENV=dev
DD_SERVICE=datadog-pc-telemetry-sample
```

送信せずに payload を確認:

```bash
npm run dry-run
```

Datadog に1回送信:

```bash
npm run dev
```

10秒ごとに60回送信:

```bash
npm run dev -- --samples=60 --interval=10
```

詳細は [apps/datadog-pc-telemetry-sample/README.md](./apps/datadog-pc-telemetry-sample/README.md) を見てください。

## MCP Datadog Logs

Datadog Logs を MCP クライアントから調査するためのサーバーです。ログ検索、集計、MCP Apps UI での調査画面、HTML レポート出力に対応しています。

公開 package:

```bash
npx -y @kajidog/mcp-datadog-logs
```

必要な環境変数:

- `DD_API_KEY`
- `DD_APP_KEY`
- `DD_SITE`

詳細は [apps/mcp-datadog-logs/README.md](./apps/mcp-datadog-logs/README.md) を見てください。

## 開発

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
```

個別パッケージの実行例:

```bash
pnpm -C apps/datadog-pc-telemetry-sample dry-run
pnpm -C apps/datadog-pc-telemetry-sample dev
pnpm --filter @kajidog/investigator-ui dev
DD_API_KEY=... DD_APP_KEY=... pnpm --filter @kajidog/mcp-datadog-logs dev
```

## MCP Inspector でのスモークテスト

```bash
pnpm build
DD_API_KEY=... DD_APP_KEY=... npx @modelcontextprotocol/inspector node apps/mcp-datadog-logs/dist/index.js
```

## リリース

`@kajidog/mcp-datadog-logs` の公開は changesets で管理しています。

```bash
pnpm changeset
```

`main` に merge すると Release workflow が version PR を作成し、その PR を merge すると npm に publish されます。publish には repository secret の `NPM_TOKEN` が必要です。

version PR を merge するときは、server package の `src/version.ts` と `package.json` の version が揃っていることを確認してください。
