import fp from "fastify-plugin";
import fastifyEnv from "@fastify/env";

export default fp(async (fastify) => {
  await fastify.register(fastifyEnv, {
    confKey: "config",
    dotenv: true,
    schema: {
      type: "object",
      required: ["PORT"],
      properties: {
        PORT: {
          type: "number",
          default: 5050,
        },
        MONGO_URI: {
            type: "string"
        },
        BETTER_AUTH_SECRET: {
            type: "string"
        },
        BETTER_AUTH_URL: {
            type: "string",
            default: "http://localhost:5050"
        },
        NODE_ENV: {
            type: "string",
            default: "development"
        }
      },
    },
  });
});