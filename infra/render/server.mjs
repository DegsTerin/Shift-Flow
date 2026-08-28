// en-GB: Serves the incumbent Express API and Next.js Web from one Render HTTPS origin.
/* global console, process */
import { createServer as createHttpServer } from "node:http";
import { URL } from "node:url";

import next from "next";

import { createServer as createApiApplication } from "../../dist/api/shared/http/app.js";
import { isApiRequestPath } from "./request-routing.mjs";

const hostname = "0.0.0.0";
const port = Number.parseInt(process.env.PORT ?? "10000", 10);

if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be a valid TCP port");
}

const webApplication = next({ dev: false, dir: "apps/web" });
await webApplication.prepare();

const apiApplication = createApiApplication();
const webRequestHandler = webApplication.getRequestHandler();

const server = createHttpServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (isApiRequestPath(requestUrl.pathname)) {
    apiApplication(request, response);
    return;
  }

  void webRequestHandler(request, response).catch((error) => {
    console.error("render_web_request_failed", error);
    if (!response.headersSent) response.statusCode = 500;
    response.end("Unexpected error");
  });
});

let shutdownStarted = false;

async function shutdown(signal) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  console.log(JSON.stringify({ event: "render_shutdown_started", signal }));

  server.close(async (error) => {
    await webApplication.close();
    if (error) {
      console.error("render_shutdown_failed", error);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

server.listen(port, hostname, () => {
  console.log(JSON.stringify({ event: "render_platform_listening", hostname, port }));
});
