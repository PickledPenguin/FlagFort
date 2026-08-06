import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

function safePart(value) {
  return String(value || "run").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "run";
}

export function playtestLogPlugin() {
  return {
    name: "flagfort-playtest-logs",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__flagfort_dev_log", (request, response, next) => {
        if (request.method !== "POST") {
          next();
          return;
        }
        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk) => {
          body += chunk;
          if (Buffer.byteLength(body) > MAX_BODY_BYTES) request.destroy();
        });
        request.on("end", async () => {
          try {
            const payload = JSON.parse(body);
            if (typeof payload.content !== "string" || payload.content.length === 0) {
              throw new Error("Missing log content");
            }
            const directory = path.resolve(process.cwd(), "playtest-logs");
            await mkdir(directory, { recursive: true });
            const timestamp = safePart(payload.endedAt || new Date().toISOString());
            const filename = `flagfort-${timestamp}-${safePart(payload.seed)}.jsonl`;
            await writeFile(path.join(directory, filename), payload.content, "utf8");
            response.statusCode = 201;
            response.setHeader("content-type", "application/json");
            response.end(JSON.stringify({ path: `playtest-logs/${filename}` }));
          } catch (error) {
            response.statusCode = 400;
            response.setHeader("content-type", "application/json");
            response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Invalid request" }));
          }
        });
      });
    },
  };
}
