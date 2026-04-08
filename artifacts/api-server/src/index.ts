import app from "./app";
import { logger } from "./lib/logger";
import { syncAllModels } from "./lib/model-sync.js";

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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  void syncAllModels()
    .then((cache) => {
      const counts = cache.results.map((r) => `${r.provider}:${r.models.length}`).join(", ");
      logger.info({ counts }, "Startup model sync complete");
    })
    .catch((e: unknown) => {
      logger.warn({ err: e }, "Startup model sync failed");
    });
});
