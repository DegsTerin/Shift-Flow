import "dotenv/config";

import { createServer } from "./shared/http/app.js";
import { logger } from "./shared/observability/logger.js";

const app = createServer();
const port = Number(process.env.API_PORT ?? 3001);

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    logger.info("api_listening", { port });
  });
}

export { app };
