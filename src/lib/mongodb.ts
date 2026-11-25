import mongoose from "mongoose";
import { setServers } from "node:dns";

type MongooseCache = {
  connection: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalForMongoose = globalThis as typeof globalThis & {
  mongooseCache?: MongooseCache;
};

const cache = globalForMongoose.mongooseCache ?? {
  connection: null,
  promise: null,
};

globalForMongoose.mongooseCache = cache;

export async function connectToDatabase() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI 환경 변수가 설정되지 않았습니다.");
  }

  if (cache.connection) {
    return cache.connection;
  }

  // Explicit local override for networks whose default resolver rejects SRV/TXT.
  // Leave unset in production to keep the platform's DNS configuration.
  const dnsServers = process.env.MONGODB_DNS_SERVERS?.split(",").map((server) => server.trim()).filter(Boolean);
  if (!cache.promise && dnsServers?.length) setServers(dnsServers);

  cache.promise ??= mongoose.connect(uri, {
    bufferCommands: false,
    serverSelectionTimeoutMS: 5000,
  });

  try {
    cache.connection = await cache.promise;
  } catch (error) {
    cache.promise = null;
    throw error;
  }

  return cache.connection;
}
