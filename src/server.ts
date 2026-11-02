import "./config/env.js";
import Fastify from 'fastify'
import fp from 'fastify-plugin'
import closeWithGrace from 'close-with-grace'
import serviceApp from './app.js'


function getLoggerOptions () {
  // Only if the program is running in an interactive terminal
  if (process.stdout.isTTY) {
    return {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname'
        }
      }
    }
  }

  return { level: process.env.LOG_LEVEL ?? 'silent' }
}

const app = Fastify({
  logger: getLoggerOptions(),
  trustProxy: true,
  connectionTimeout: 120_000,
  requestTimeout: 60_000,
  pluginTimeout: 40_000,
  keepAliveTimeout: 10_000,
  http: {
    headersTimeout: 15_000
  },
  ajv: {
    customOptions: {
      coerceTypes: 'array', // change type of data to match type keyword
      removeAdditional: 'all' // Remove additional body properties
    }
  }
})


async function init () {
  // Register your application as a normal plugin.
  app.register(fp(serviceApp))
  closeWithGrace(
    { delay: Number(process.env.FASTIFY_CLOSE_GRACE_DELAY ?? '500') },
    async ({ err }) => {
      if (err != null) {
        app.log.error(err)
      }

      await app.close()
    }
  )

  await app.ready()

  try {
    // Start listening.
    await app.listen({ 
        port: Number(process.env.PORT ?? '5050'),
        host: String(process.env.HOST ?? '0.0.0.0')
    })
    //console.log(app.getEnvs())
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

init()
