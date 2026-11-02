import fp from 'fastify-plugin'
import fastifySwaggerUi from '@fastify/swagger-ui'
import fastifySwagger from '@fastify/swagger'


export default fp(async function (app) {
await app.register(fastifySwagger, {
  openapi: {
    openapi: '3.0.0',
    info: {
      title: 'Test Api',
      description: 'PowerMaster Backend API documentation',
      version: '0.1.0'
    },
    servers: [
      {
        url: `${process.env.SERVER_URL || 'http://localhost:5050'}`,
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          name: 'apiKey',
          in: 'header'
        }
      }
    },
    externalDocs: {
      url: 'https://swagger.io',
      description: 'Find more info here'
    }
  }
})

// swagger-ui setup
.register(fastifySwaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'full',
    deepLinking: false
  },
  uiHooks: {
    onRequest: async () => {},
    preHandler: async () => {}
  },
  staticCSP: true,
  transformSpecification: (swaggerObject : any) => swaggerObject,
  transformSpecificationClone: true
})
})
