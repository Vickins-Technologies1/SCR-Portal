// src/lib/mongodb.ts
import { MongoClient, Db } from 'mongodb';
import { ensureProductionIndexes } from './db-indexes';

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/rentaldb';
const performanceProfilingEnabled = process.env.SORANA_PERFORMANCE_PROFILING === 'true';
const slowQueryThresholdMs = Number(process.env.SORANA_PERFORMANCE_SLOW_QUERY_MS ?? 100);

let client: MongoClient | undefined;

function attachPerformanceProfiling(nextClient: MongoClient) {
  if (!performanceProfilingEnabled) return;

  nextClient.on('commandSucceeded', (event) => {
    if (event.duration < slowQueryThresholdMs) return;
    console.info('[sorana-performance][mongodb]', JSON.stringify({
      command: event.commandName,
      durationMs: event.duration,
      requestId: event.requestId,
    }));
  });

  nextClient.on('commandFailed', (event) => {
    console.warn('[sorana-performance][mongodb]', JSON.stringify({
      command: event.commandName,
      durationMs: event.duration,
      requestId: event.requestId,
      failed: true,
    }));
  });
}

function createClient(options: ConstructorParameters<typeof MongoClient>[1]) {
  const nextClient = new MongoClient(uri, {
    ...options,
    monitorCommands: performanceProfilingEnabled,
  });
  attachPerformanceProfiling(nextClient);
  return nextClient;
}

const getClientPromise = (): Promise<MongoClient> => {
  if (process.env.NODE_ENV === 'development') {
    if (!global._mongoClientPromise) {
      client = createClient({
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 10000,
      });
      global._mongoClientPromise = client.connect();
    }
    return global._mongoClientPromise;
  }

  if (!global._mongoClientPromise) {
    client = createClient({
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
    if (process.env.NODE_ENV === 'production') {
      void ensureProductionIndexes(db);
    }

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
