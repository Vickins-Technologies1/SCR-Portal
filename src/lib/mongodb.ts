// 
import { MongoClient, Db } from "mongodb";

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not defined in .env.local");
    throw new Error("Database configuration error: MONGODB_URI is missing");
  }

  try {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000, // 5-second timeout
      connectTimeoutMS: 10000,
    });

    await client.connect();
    console.log("Successfully connected to MongoDB");

    const db = client.db("rentaldb");

    cachedClient = client;
    cachedDb = db;

    return { client, db };
  } catch (error) {
    console.error("Database connection error:", error);
    if (error instanceof Error) {
      throw new Error(`Failed to connect to the database: ${error.message}`);
    }
    throw new Error("Failed to connect to the database: Unknown error");
  }
}