# Datadog PC Telemetry Sample

ローカル PC のメトリクスとログを Datadog に送る Node.js サンプルです。

Datadog 公式 SDK の `@datadog/datadog-api-client` を使い、次の API に送信します。

- `v2.MetricsApi.submitMetrics`
- `v2.LogsApi.submitLog`

収集は Node.js 標準の `os` と `process` で行います。

## セットアップ

このディレクトリで `.env` を作ります。

```bash
cp .env.example .env
```

`.env` に Datadog の API key と site を設定します。

```dotenv
DD_API_KEY=your-datadog-api-key
DD_SITE=ap1.datadoghq.com
DD_ENV=dev
DD_SERVICE=datadog-pc-telemetry-sample
```

Japan site の場合は `DD_SITE=ap1.datadoghq.com` です。US1 の場合は `datadoghq.com` です。

API key はサーバー/ローカル実行用の secret です。ブラウザコードには置かないでください。

## 実行

送信せずに payload を確認:

```bash
npm run dry-run
```

Datadog に1回だけ送信:

```bash
npm run dev
```

デフォルトでは `samples=1` なので、1回送信するとプロセスは正常終了します。

10秒ごとに60回送信:

```bash
npm run dev -- --samples=60 --interval=10
```

ほぼ常駐のように動かす例:

```bash
npm run dev -- --samples=999999 --interval=10
```

ビルド済み JavaScript を実行:

```bash
npm run build
npm start
```

`.env` の値を変えただけなら `npm run build` のやり直しは不要です。コードを変更したときだけ build してください。

## Datadog での確認

メトリクス:

- Metrics Explorer で `sample.pc.cpu.usage_percent`
- Metrics Explorer で `sample.pc.memory.used_percent`

ログ:

- Logs Explorer で `service:datadog-pc-telemetry-sample env:dev`

ログの `status` は使用率から決まります（閾値は環境変数で変更可能）。

| status | 条件（デフォルト） |
|---|---|
| `error` | CPU >= `CPU_ERROR_PERCENT` (90%) または memory >= `MEMORY_ERROR_PERCENT` (95%) |
| `warn` | CPU >= `CPU_WARN_PERCENT` (70%) または memory >= `MEMORY_WARN_PERCENT` (85%) |
| `info` | 上記以外 |

`warn` / `error` のときは message 末尾に理由（例: `(high cpu usage (92.5%))`）が付きます。

送信成功時の出力例:

```text
[sample 1] metrics accepted: {"errors":[]}
[sample 1] log accepted: {}
```

Datadog 側の表示には少し遅延が出ることがあります。

## 環境変数

| 変数 | 必須 | デフォルト | 説明 |
|---|---:|---|---|
| `DD_API_KEY` | yes | - | Datadog API key。`--dry-run` では不要 |
| `DD_SITE` | no | `datadoghq.com` | Datadog site。例: `ap1.datadoghq.com`, `datadoghq.eu` |
| `DD_ENV` | no | `dev` | `env:<value>` tag に使う値 |
| `DD_SERVICE` | no | `datadog-pc-telemetry-sample` | log service 名と `service:<value>` tag に使う値 |
| `DD_HOSTNAME` | no | `os.hostname()` | metrics/logs に紐づける host 名 |
| `DD_TAGS` | no | - | 追加 tag。例: `team:platform,owner:local-dev` |
| `METRIC_PREFIX` | no | `sample.pc` | custom metric 名の prefix |
| `CPU_WARN_PERCENT` | no | `70` | ログ `status` を `warn` にする CPU 使用率の閾値 (%) |
| `CPU_ERROR_PERCENT` | no | `90` | ログ `status` を `error` にする CPU 使用率の閾値 (%) |
| `MEMORY_WARN_PERCENT` | no | `85` | ログ `status` を `warn` にするメモリ使用率の閾値 (%) |
| `MEMORY_ERROR_PERCENT` | no | `95` | ログ `status` を `error` にするメモリ使用率の閾値 (%) |

## CLI オプション

| オプション | デフォルト | 説明 |
|---|---:|---|
| `--dry-run` | false | Datadog に送信せず、payload を表示 |
| `--samples=<n>` | 1 | 送信回数 |
| `--interval=<seconds>` | 0 | 複数回送信するときの間隔。`samples > 1` で未指定なら 10 秒 |
| `--cpu-sample-ms=<ms>` | 1000 | CPU 使用率計算のサンプリング時間 |
| `--metrics-only` | false | metrics だけ送信 |
| `--log-only` | false | log だけ送信 |

例:

```bash
npm run dev -- --metrics-only
npm run dev -- --log-only
npm run dev -- --samples=5 --interval=10
```

## 送信するメトリクス

デフォルトでは `sample.pc` 配下に gauge metric を送ります。

- `sample.pc.cpu.usage_percent`
- `sample.pc.cpu.cores`
- `sample.pc.memory.total_bytes`
- `sample.pc.memory.used_bytes`
- `sample.pc.memory.free_bytes`
- `sample.pc.memory.used_percent`
- `sample.pc.load.1`
- `sample.pc.load.5`
- `sample.pc.load.15`
- `sample.pc.uptime_seconds`
- `sample.pc.process.rss_bytes`
- `sample.pc.process.heap_used_bytes`
- `sample.pc.network.interface_count`

すべての metric には `host` resource と、次の tags が付きます。

- `env:<DD_ENV>`
- `service:<DD_SERVICE>`
- `source:node`
- `sample:datadog-pc-telemetry`
- `DD_TAGS` で指定した追加 tag

## Agent 方式との違い

Datadog Agent を Docker で起動する方式は、ホストメトリクスや Docker コンテナログを継続収集する本格的な方法です。

このサンプルは、Node.js アプリから Datadog API/SDK に直接送る最小例です。アプリ独自の custom metrics や log payload の形を確認する用途に向いています。

継続的な PC/コンテナ監視が目的なら Datadog Agent、アプリから任意の telemetry を送る確認が目的ならこのサンプル、という使い分けです。

## 注意

- `DD_API_KEY` は secret です。Git に commit しないでください。
- `.env` は `.gitignore` の対象にしてください。
- Datadog site は独立しています。API key を作った org と同じ `DD_SITE` を指定してください。
- Metric timestamp は現在時刻に近い必要があります。このサンプルは収集時の `Date.now()` を使います。
