import { createServer } from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { setupSocketIO } from "./socket/rooms";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer();
setupSocketIO(httpServer);

// Register Socket.IO before Express so polling requests to /api/socket.io
// are handled by the realtime server instead of falling through to Express.
httpServer.on("request", app);
httpServer.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});
httpServer.listen(port, () => {
  logger.info({ port }, "Server listening");
});
