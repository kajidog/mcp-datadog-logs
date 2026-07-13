import os from 'node:os'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { client, v2 } from '@datadog/datadog-api-client'

type CliOptions = {
  cpuSampleMs: number
  dryRun: boolean
  intervalSeconds: number
  metricsOnly: boolean
  logOnly: boolean
  samples: number
}

type StatusThresholds = {
  cpuWarnPercent: number
  cpuErrorPercent: number
  memoryWarnPercent: number
  memoryErrorPercent: number
}

type Config = {
  apiKey?: string
  env: string
  hostname: string
  metricPrefix: string
  service: string
  site: string
  tags: string[]
  thresholds: StatusThresholds
}

type CpuSnapshot = {
  idle: number
  total: number
}

type MetricValue = {
  name: string
  unit?: string
  value: number
}

type PcTelemetry = {
  arch: string
  hostname: string
  metrics: MetricValue[]
  platform: NodeJS.Platform
  release: string
  timestamp: number
}

type DatadogMetricSeries = {
  metric: string
  points: Array<{
    timestamp: number
    value: number
  }>
  resources: Array<{
    name: string
    type: string
  }>
  tags: string[]
  type: 3
  unit?: string
}

const SITE_ALIASES: Record<string, string> = {
  ap1: 'ap1.datadoghq.com',
  ap2: 'ap2.datadoghq.com',
  eu: 'datadoghq.eu',
  eu1: 'datadoghq.eu',
  gov: 'ddog-gov.com',
  us1: 'datadoghq.com',
  'us1-fed': 'ddog-gov.com',
  us3: 'us3.datadoghq.com',
  us5: 'us5.datadoghq.com',
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    cpuSampleMs: 1000,
    dryRun: false,
    intervalSeconds: 0,
    logOnly: false,
    metricsOnly: false,
    samples: 1,
  }

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (arg === '--metrics-only') {
      options.metricsOnly = true
      continue
    }

    if (arg === '--log-only') {
      options.logOnly = true
      continue
    }

    const [name, value] = arg.split('=', 2)
    if (!value) {
      throw new Error(`Unknown argument: ${arg}`)
    }

    if (name === '--cpu-sample-ms') {
      options.cpuSampleMs = parseNonNegativeInteger(value, name)
      continue
    }

    if (name === '--interval') {
      options.intervalSeconds = parseNonNegativeInteger(value, name)
      continue
    }

    if (name === '--samples') {
      options.samples = parsePositiveInteger(value, name)
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (options.logOnly && options.metricsOnly) {
    throw new Error('Use only one of --log-only or --metrics-only')
  }

  if (options.samples > 1 && options.intervalSeconds === 0) {
    options.intervalSeconds = 10
  }

  return options
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`)
  }
  return parsed
}

function parseNonNegativeInteger(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }
  return parsed
}

function getConfig(): Config {
  const site = normalizeSite(process.env.DD_SITE ?? 'datadoghq.com')
  const env = process.env.DD_ENV ?? 'dev'
  const service = process.env.DD_SERVICE ?? 'datadog-pc-telemetry-sample'
  const hostname = process.env.DD_HOSTNAME ?? os.hostname()
  const userTags = splitTags(process.env.DD_TAGS)
  const tags = uniqueTags([
    `env:${env}`,
    `service:${service}`,
    'source:node',
    'sample:datadog-pc-telemetry',
    ...userTags,
  ])

  return {
    apiKey: process.env.DD_API_KEY,
    env,
    hostname,
    metricPrefix: process.env.METRIC_PREFIX ?? 'sample.pc',
    service,
    site,
    tags,
    thresholds: {
      cpuWarnPercent: parsePercentEnv('CPU_WARN_PERCENT', 70),
      cpuErrorPercent: parsePercentEnv('CPU_ERROR_PERCENT', 90),
      memoryWarnPercent: parsePercentEnv('MEMORY_WARN_PERCENT', 85),
      memoryErrorPercent: parsePercentEnv('MEMORY_ERROR_PERCENT', 95),
    },
  }
}

function parsePercentEnv(name: string, defaultValue: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') {
    return defaultValue
  }

  const parsed = Number.parseFloat(raw)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number, got: ${raw}`)
  }
  return parsed
}

function normalizeSite(input: string): string {
  const cleaned = input
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^app\./, '')
    .replace(/\/.*$/, '')
    .toLowerCase()

  return SITE_ALIASES[cleaned] ?? cleaned
}

function splitTags(value: string | undefined): string[] {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function uniqueTags(tags: string[]): string[] {
  return [...new Set(tags)]
}

async function collectTelemetry(cpuSampleMs: number, hostname: string): Promise<PcTelemetry> {
  const cpuStart = readCpuSnapshot()
  await delay(cpuSampleMs)
  const cpuEnd = readCpuSnapshot()
  const cpuUsagePercent = calculateCpuUsagePercent(cpuStart, cpuEnd)

  const totalMemoryBytes = os.totalmem()
  const freeMemoryBytes = os.freemem()
  const usedMemoryBytes = totalMemoryBytes - freeMemoryBytes
  const load = os.loadavg()
  const processMemory = process.memoryUsage()

  return {
    arch: os.arch(),
    hostname,
    metrics: [
      { name: 'cpu.usage_percent', unit: 'percent', value: round(cpuUsagePercent, 2) },
      { name: 'cpu.cores', value: os.cpus().length },
      { name: 'memory.total_bytes', unit: 'byte', value: totalMemoryBytes },
      { name: 'memory.used_bytes', unit: 'byte', value: usedMemoryBytes },
      { name: 'memory.free_bytes', unit: 'byte', value: freeMemoryBytes },
      { name: 'memory.used_percent', unit: 'percent', value: round((usedMemoryBytes / totalMemoryBytes) * 100, 2) },
      { name: 'load.1', value: round(load[0] ?? 0, 3) },
      { name: 'load.5', value: round(load[1] ?? 0, 3) },
      { name: 'load.15', value: round(load[2] ?? 0, 3) },
      { name: 'uptime_seconds', unit: 'second', value: round(os.uptime(), 0) },
      { name: 'process.rss_bytes', unit: 'byte', value: processMemory.rss },
      { name: 'process.heap_used_bytes', unit: 'byte', value: processMemory.heapUsed },
      { name: 'network.interface_count', value: getNetworkInterfaceCount() },
    ],
    platform: os.platform(),
    release: os.release(),
    timestamp: Math.floor(Date.now() / 1000),
  }
}

function getNetworkInterfaceCount(): number {
  try {
    return Object.keys(os.networkInterfaces()).length
  } catch {
    return 0
  }
}

function readCpuSnapshot(): CpuSnapshot {
  return os.cpus().reduce<CpuSnapshot>(
    (snapshot, cpu) => {
      snapshot.idle += cpu.times.idle
      snapshot.total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq
      return snapshot
    },
    { idle: 0, total: 0 }
  )
}

function calculateCpuUsagePercent(start: CpuSnapshot, end: CpuSnapshot): number {
  const idleDelta = end.idle - start.idle
  const totalDelta = end.total - start.total
  if (totalDelta <= 0) {
    return 0
  }

  return Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100))
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function buildMetricPayload(telemetry: PcTelemetry, config: Config): v2.MetricPayload {
  const metricPrefix = config.metricPrefix.replace(/\.+$/, '')

  return {
    series: telemetry.metrics.map((metric) => ({
      metric: `${metricPrefix}.${metric.name}`,
      points: [
        {
          timestamp: telemetry.timestamp,
          value: metric.value,
        },
      ],
      resources: [
        {
          name: telemetry.hostname,
          type: 'host',
        },
      ],
      tags: config.tags,
      type: 3,
      ...(metric.unit ? { unit: metric.unit } : {}),
    })) satisfies DatadogMetricSeries[],
  }
}

type LogStatus = 'info' | 'warn' | 'error'

function deriveLogStatus(cpuPercent: number, memoryPercent: number, thresholds: StatusThresholds): LogStatus {
  if (cpuPercent >= thresholds.cpuErrorPercent || memoryPercent >= thresholds.memoryErrorPercent) {
    return 'error'
  }
  if (cpuPercent >= thresholds.cpuWarnPercent || memoryPercent >= thresholds.memoryWarnPercent) {
    return 'warn'
  }
  return 'info'
}

function buildLogPayload(telemetry: PcTelemetry, config: Config): v2.HTTPLogItem[] {
  const metrics = Object.fromEntries(telemetry.metrics.map((metric) => [metric.name, metric.value]))
  const cpuPercent = metrics['cpu.usage_percent'] ?? 0
  const memoryPercent = metrics['memory.used_percent'] ?? 0
  const status = deriveLogStatus(cpuPercent, memoryPercent, config.thresholds)
  const { cpuWarnPercent, cpuErrorPercent, memoryWarnPercent, memoryErrorPercent } = config.thresholds
  const alerts = [
    ...(cpuPercent >= Math.min(cpuWarnPercent, cpuErrorPercent) ? [`high cpu usage (${cpuPercent}%)`] : []),
    ...(memoryPercent >= Math.min(memoryWarnPercent, memoryErrorPercent)
      ? [`high memory usage (${memoryPercent}%)`]
      : []),
  ]

  return [
    {
      ddsource: 'nodejs',
      ddtags: config.tags.join(','),
      hostname: telemetry.hostname,
      message: [
        'PC telemetry sample',
        `cpu=${metrics['cpu.usage_percent']}%`,
        `memory=${metrics['memory.used_percent']}%`,
        `load1=${metrics['load.1']}`,
        ...(alerts.length > 0 ? [`(${alerts.join(', ')})`] : []),
      ].join(' '),
      service: config.service,
      additionalProperties: {
        arch: telemetry.arch,
        metrics,
        metric_prefix: config.metricPrefix,
        platform: telemetry.platform,
        release: telemetry.release,
        status,
        timestamp: new Date(telemetry.timestamp * 1000).toISOString(),
      },
    },
  ]
}

function createDatadogApis(config: Config): { logsApi: v2.LogsApi; metricsApi: v2.MetricsApi } {
  if (!config.apiKey) {
    throw new Error('DD_API_KEY is required unless --dry-run is used')
  }

  const configuration = client.createConfiguration({
    authMethods: {
      apiKeyAuth: config.apiKey,
    },
  })
  configuration.setServerVariables({ site: config.site })

  return {
    logsApi: new v2.LogsApi(configuration),
    metricsApi: new v2.MetricsApi(configuration),
  }
}

async function sendSample(config: Config, options: CliOptions, sampleNumber: number): Promise<void> {
  const telemetry = await collectTelemetry(options.cpuSampleMs, config.hostname)
  const metricPayload = buildMetricPayload(telemetry, config)
  const logPayload = buildLogPayload(telemetry, config)

  console.log(
    `[sample ${sampleNumber}] ${telemetry.hostname} cpu=${getMetric(telemetry, 'cpu.usage_percent')}% memory=${getMetric(
      telemetry,
      'memory.used_percent'
    )}%`
  )

  if (options.dryRun) {
    console.log(
      JSON.stringify(
        {
          sdk: '@datadog/datadog-api-client',
          site: config.site,
          logs: logPayload,
          metrics: metricPayload,
        },
        null,
        2
      )
    )
    return
  }

  const { logsApi, metricsApi } = createDatadogApis(config)

  if (!options.logOnly) {
    const result = await metricsApi.submitMetrics({ body: metricPayload })
    console.log(`[sample ${sampleNumber}] metrics accepted: ${JSON.stringify(result)}`)
  }

  if (!options.metricsOnly) {
    const result = await logsApi.submitLog({ body: logPayload })
    console.log(`[sample ${sampleNumber}] log accepted: ${JSON.stringify(result)}`)
  }
}

function getMetric(telemetry: PcTelemetry, name: string): number | undefined {
  return telemetry.metrics.find((metric) => metric.name === name)?.value
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const config = getConfig()

  console.log(`Datadog site: ${config.site}`)
  console.log('Datadog SDK: @datadog/datadog-api-client')

  for (let sample = 1; sample <= options.samples; sample += 1) {
    await sendSample(config, options, sample)

    if (sample < options.samples) {
      await delay(options.intervalSeconds * 1000)
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
