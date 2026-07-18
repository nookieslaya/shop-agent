import { readFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";

const asset = (name: string) => readFile(new URL(`../../widget/${name}`, import.meta.url), "utf8");

export function registerWidgetUi(app: FastifyInstance): void {
  app.get("/widget", async (_request, reply) => reply.type("text/html; charset=utf-8").header("Content-Security-Policy", "default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors *").send(await asset("index.html")));
  app.get("/widget/styles.css", async (_request, reply) => reply.type("text/css; charset=utf-8").send(await asset("styles.css")));
  app.get("/widget/app.js", async (_request, reply) => reply.type("text/javascript; charset=utf-8").send(await asset("app.js")));
}
