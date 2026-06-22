import "dotenv/config";

import { createServer } from "./shared/http/app.js";

const app = createServer();
const port = Number(process.env.API_PORT ?? 3001);

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`ShiftFlow API listening on port ${port}`);
  });
}

export { app };
