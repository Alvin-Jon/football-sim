// import fp from "fastify-plugin";
// import { MongoClient, ServerApiVersion } from "mongodb";
// import mongoose from "mongoose";
// import dns from "node:dns";

// dns.setDefaultResultOrder("ipv4first")

// declare module "fastify" {
//   interface FastifyInstance {
//     db: ReturnType<typeof client.db>;
//     client: MongoClient;
//     mongoose: typeof mongoose;
//   }
// }
 
// const client = new MongoClient(
//   process.env.MONGO_URI || "mongodb://localhost:27017/power-master", {
//     serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
//     serverSelectionTimeoutMS: 5000,
//     connectTimeoutMS: 5000,
//     socketTimeoutMS: 5000,
//   }
// );

// export default fp(
//   async (fastify) => {
//     console.log("DATABASE: starting MongoClient.connect()");

//     await client.connect();

//     console.log("DATABASE: MongoClient connected");

//     console.log("DATABASE: starting mongoose.connect()");

//     await mongoose.connect(
//       process.env.MONGO_URI || "mongodb://localhost:27017/power-master",
//       {
//         dbName: "powerMaster",
//         serverSelectionTimeoutMS: 5000,
//         connectTimeoutMS: 5000
//       }
//     );

//     console.log("DATABASE: Mongoose connected");

//     const db = client.db("powerMaster");

//     fastify.decorate("db", db);
//     fastify.decorate("client", client);
//     fastify.decorate("mongoose", mongoose);

//     fastify.addHook("onClose", async () => {
//       await mongoose.disconnect();
//       await client.close();
//     });

//     console.log("DATABASE: plugin finished");
//   },
//   {
//     name: "database",
//   }
// );