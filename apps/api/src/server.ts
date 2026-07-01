import "dotenv/config";

import { env } from "./shared/config/env.js";
import { createServer } from "./shared/http/app.js";
import { logger } from "./shared/observability/logger.js";

const app = createServer();
const port = env.API_PORT;

if (env.NODE_ENV !== "test") {
  app.listen(port, () => {
    logger.info("api_listening", { port });
  });
}

export { app };
