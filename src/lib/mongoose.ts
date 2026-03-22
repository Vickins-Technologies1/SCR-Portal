// src/lib/mongoose.ts
import mongoose, { type Mongoose } from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("Please define MONGODB_URI in your environment");
}

interface MongooseCache {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
}

// eslint-disable-next-line no-var
declare global { var _mongooseCache: MongooseCache | undefined; }

const globalCache = global._mongooseCache ?? { conn: null, promise: null };

export async function connectMongoose(): Promise<Mongoose> {
  if (globalCache.conn) return globalCache.conn;

  const mongoUri = MONGODB_URI;
  if (!mongoUri) {
    throw new Error("Please define MONGODB_URI in your environment");
  }

  if (!globalCache.promise) {
    globalCache.promise = mongoose.connect(mongoUri, {
      dbName: "rentaldb",
      maxPoolSize: 10,
    });
  }

  globalCache.conn = await globalCache.promise;
  global._mongooseCache = globalCache;
  return globalCache.conn;
}
