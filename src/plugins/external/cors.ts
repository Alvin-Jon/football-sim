import cors from '@fastify/cors'
import type{FastifyCorsOptions } from '@fastify/cors'

export const autoConfig: FastifyCorsOptions = {
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    origin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
    maxAge: 86400,
}

export default cors
