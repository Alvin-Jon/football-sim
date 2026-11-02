// import fp from "fastify-plugin";
// import { Server } from "socket.io";
// import { House } from "../../db/models/House.model.js";

// declare module "fastify" {
//   interface FastifyInstance {
//     io: Server;
//   }
// }

// export default fp(async (fastify) => {
//   // const {appServices} = fastify;
//   const io = new Server(fastify.server, {
//     cors: {
//       origin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
//       credentials: true,
//     },
//   });
 
//   io.use(async (socket, next) => {
//     try { 
//       const cookie = socket.handshake.headers.cookie;

//       if (!cookie) {
//         return next(
//           new Error("socket: Authentication Failed: Cookie cannot be undefined"),
//         );
//       }
//       const result = await fastify.auth.api.getSession({
//         headers: { cookie },
//       });

//       if (!result || !result.user) {
//         fastify.log.error("socket: Authentication Failed: Invalid session");
//         return next(new Error("socket: Authentication Failed: Invalid session"));
//       }

//       socket.user = result.user;
//       socket.session = result.session;

//       socket.join(result.user.id);

//       //join user to all their houses
//       const userHouse = await House.findOne({ userId: result.user.id });
//       if (userHouse) {
//         socket.join(userHouse._id.toString());
//         fastify.log.info(`socket: User ${result.user.id} joined house ${userHouse._id.toString()}`);
//       } else {
//         fastify.log.info(`socket: User ${result.user.id} has no house`);
//       }

//       return next();
//     } catch (error) {
//       fastify.log.error(error);
//       return next(new Error("socket: Connection Failed: Internal server error"));
//     }
//   });

//   io.on("connection", (socket) => {
//     fastify.log.info(`socket: Client connected: ${socket.id}`);
//     socket.on("disconnect", () => {
//       fastify.log.info(`socket: Client disconnected: ${socket.id}`);
//     });
//   });

//   fastify.decorate("io", io);

//   fastify.addHook("preClose", (done) => {
//     io.disconnectSockets(true);
//     done();
//   });

//   fastify.addHook("onClose", (_, done) => {
//     io.close();
//     done();
//   });
// });

