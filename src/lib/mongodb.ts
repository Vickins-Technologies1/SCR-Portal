// src/lib/mongodb.ts
import { MongoClient, Db } from 'mongodb';

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/rentaldb';

let client: MongoClient | undefined;

const getClientPromise = (): Promise<MongoClient> => {
  if (process.env.NODE_ENV === 'development') {
    if (!global._mongoClientPromise) {
      client = new MongoClient(uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 10000,
      });
      global._mongoClientPromise = client.connect();
    }
    return global._mongoClientPromise;
  }

  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 5000,
    });
    global._mongoClientPromise = client.connect();
  }

  return global._mongoClientPromise;
};

// Export type for use in API routes
export interface DBConnection {
  db: Db;
  client: MongoClient;
}

export async function connectToDatabase(): Promise<DBConnection> {
  try {
    const connectedClient = await getClientPromise();

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
