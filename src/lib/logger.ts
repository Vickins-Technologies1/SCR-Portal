// Logger interface for TypeScript type safety
interface Logger {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

// Edge-compatible logger using console methods
const edgeLogger: Logger = {
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== "production") {
      console.debug(`[${new Date().toISOString()}] DEBUG: ${message}`, meta || {});
    }
  },
  info: (message: string, meta?: Record<string, unknown>) => {
    console.info(`[${new Date().toISOString()}] INFO: ${message}`, meta || {});
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(`[${new Date().toISOString()}] WARN: ${message}`, meta || {});
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    console.error(`[${new Date().toISOString()}] ERROR: ${message}`, meta || {});
  },
};

// Default to edgeLogger
let logger: Logger = edgeLogger;

// Load winston only in Node.js runtime
if (process.env.NEXT_RUNTIME !== "edge") {
  (async () => {
    try {
      const { createLogger, format, transports } = await import("winston");
      logger = createLogger({
        level: process.env.NODE_ENV === "production" ? "error" : "debug",
        format: format.combine(format.timestamp(), format.json()),
        transports: [new transports.Console(), new transports.File({ filename: "error.log", level: "error" })],
      });
    } catch (error) {
      console.error("Failed to initialize winston logger:", error);
      // Fallback to edgeLogger if winston fails
      logger = edgeLogger;
    }
  })();
}

export default logger;