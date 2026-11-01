import { loadConfig, loadDotEnv } from "./config/env.js";
import { createApp } from "./app.js";

// Load .env from current working directory
loadDotEnv();

const config = loadConfig();
const app = createApp(config);

const server = app.listen(config.port, (err?: Error) => {
  if (err) {
    console.error(`[Engiens Build] Failed to start server on port ${config.port}:`, err.message);
    process.exit(1);
  }
  console.log(`[Engiens Build] Server running on http://localhost:${config.port}`);
  console.log(`[Engiens Build] TinyFish configured: ${Boolean(config.tinyfishApiKey)} | Gemini model: ${config.geminiModel}`);
});

server.on("error", (err: any) => {
  console.error(`[Engiens Build] Server listener error:`, err.message || err);
  process.exit(1);
});

const gracefulShutdown = (signal: string) => {
  console.log(`[Engiens Build] Received ${signal}, closing HTTP server...`);
  server.close((closeErr) => {
    if (closeErr) {
      console.error("[Engiens Build] Error during server close:", closeErr.message);
      process.exit(1);
    }
    process.exit(0);
  });
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  console.error("[Engiens Build] Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[Engiens Build] Uncaught Exception:", err);
  process.exit(1);
});
