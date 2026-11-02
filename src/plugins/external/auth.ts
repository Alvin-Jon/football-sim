// import { betterAuth } from "better-auth";
// import { MongoClient } from "mongodb";
// import { mongodbAdapter } from "better-auth/adapters/mongodb";
// import type { FastifyRequest } from "fastify";
// import fp from "fastify-plugin";
// import { fromNodeHeaders } from "better-auth/node";

//  const createAuth =({ database, client } : { database: any, client: MongoClient }) => {
//     return betterAuth({
//         database: mongodbAdapter(database, {
//             client,
//         }),

//   emailAndPassword: {
//     enabled: true,
//   },

//   user: {
//     additionalFields: {
      
//     },
//   },

//   socialProviders: {
//     google: {
//       enabled: true,
//       clientId: process.env.GOOGLE_CLIENT_ID || "" as string,
//       clientSecret: process.env.GOOGLE_CLIENT_SECRET || "" as string,
//     },
//   },

//   secret:process.env.BETTER_AUTH_SECRET || "supersecret",

//   baseURL: process.env.BETTER_AUTH_URL || "http://localhost:5050",

//   trustedOrigins: [
//     "http://localhost:3000",
//     "https://power-master-eight.vercel.app",
//   ],
//   advanced:{
//     defaultCookieAttributes: {
//       sameSite:"none",
//       secure: true
//     }
//   }
// })};

// export const auth = createAuth({
//   database: {} as any,
//   client: {} as MongoClient,
// });

// export type AuthType = typeof auth;

// export const getSession = async (
//   auth: ReturnType<typeof createAuth>,
//   request: FastifyRequest,
// ) => {
//   const session = await auth.api.getSession({
//     headers: fromNodeHeaders(request.headers),
//   });

//   return session;
// };

// export type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;
  
// export default fp(
//   async (fastify) => {
//     const auth = createAuth({ database: fastify.db, client: fastify.client });

//     fastify.decorate("auth", auth);
//     fastify.decorateRequest("user", null as unknown as Session["user"]);
//     fastify.decorateRequest("session", null as unknown as Session["session"]);
//   },
//   {
//     name: "auth",
//     dependencies: ["database"],
//   },
// );

// declare module "fastify" {
//   interface FastifyInstance {
//     auth: ReturnType<typeof createAuth>;
//   }

//   interface FastifyRequest {
//     user: Session["user"];
//     session: Session["session"];
//   }
// }


