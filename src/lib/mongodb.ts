// src/lib/mongodb.ts
import { MongoClient, Db } from 'mongodb';

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rentaldb';

if (!uri) {
  throw new Error('Please define MONGODB_URI in .env.local');
}

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === 'development') {
  // In development: reuse connection across hot reloads
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, {
      // Optional: improve connection resilience
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 10000,
    });
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  // In production: fresh connection
  client = new MongoClient(uri, {
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 5000,
  });
  clientPromise = client.connect();
}

// Export type for use in API routes
export interface DBConnection {
  db: Db;
  client: MongoClient;
}

export async function connectToDatabase(): Promise<DBConnection> {
  try {
    const connectedClient = await clientPromise;

    // Optional: log only in dev
    if (process.env.NODE_ENV === 'development') {
      console.log('Connected to MongoDB: rentaldb');
    }

    const db = connectedClient.db('rentaldb');
    return { db, client: connectedClient };
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    throw new Error('Database connection failed');
  }
}

// Optional: Graceful shutdown (for Next.js custom server or scripts)
export async function closeConnection() {
  if (client) {
    await client.close();
    console.log('MongoDB connection closed');
  }
}