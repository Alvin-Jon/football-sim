import fastifyRateLimit from '@fastify/rate-limit'
import type { FastifyInstance } from 'fastify'

export const autoConfig = (fastify: FastifyInstance) => {
  return {
    max: Number(process.env.RATE_LIMIT_MAX) || 100,
    timeWindow: '1 minute'
  }
}


export default fastifyRateLimit
