import { buildApp } from './app.js'
import { loadConfig } from './config.js'

let config
try {
  config = loadConfig(process.env)
} catch (err) {
  console.error(`manager: invalid configuration: ${(err as Error).message}`)
  process.exit(1)
}

const app = buildApp(config)
try {
  await app.listen({ host: config.host, port: config.port })
  app.log.info({ host: config.host, port: config.port }, 'manager started')
} catch (err) {
  app.log.error({ err, host: config.host, port: config.port }, 'failed to listen')
  process.exit(1)
}
