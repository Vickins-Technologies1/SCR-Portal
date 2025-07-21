import { MongoClient, Db } from "mongodb";

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Database configuration error: MONGODB_URI is missing");
  }

  try {
    const client = new MongoClient(uri, {
      // Connection Pool Settings for Sharded Cluster
      maxPoolSize: 50, // Reduced from default 100 to prevent connection storms
      minPoolSize: 5, // Maintain a small pool for low-traffic scenarios
      maxConnecting: 2, // Control concurrent connection establishment
      connectTimeoutMS: 10000, // 10 seconds to establish connection
      socketTimeoutMS: 30000, // 30 seconds for socket operations
      serverSelectionTimeoutMS: 5000, // 5 seconds to select server
      maxIdleTimeMS: 300000, // Close idle connections after 5 minutes
      waitQueueTimeoutMS: 10000, // 10 seconds max wait for a connection
      // Enable compression for better performance
      compressors: ["zlib"],
      // Optimize for sharded cluster
      retryWrites: true,
      retryReads: true,
    });

    await client.connect();
    console.log("Successfully connected to MongoDB");

    const db = client.db("rentaldb");
    cachedClient = client;
    cachedDb = db;

    // Handle client close on process termination
    process.on("SIGINT", async () => {
      await cachedClient?.close();
      console.log("MongoDB connection closed");
      process.exit(0);
    });

    return { client, db };
  } catch (error) {
    console.error("Database connection error:", error);
    throw new Error(
      error instanceof Error
        ? `Failed to connect to the database: ${error.message}`
        : "Failed to connect to the database: Unknown error"
    );
  }
}