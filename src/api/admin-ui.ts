import { readFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";

const asset = (name: string) => readFile(new URL(`../../admin/${name}`, import.meta.url), "utf8");

export function registerAdminUi(app: FastifyInstance): void {
  app.get("/admin", async (_request, reply) => reply.type("text/html; charset=utf-8").send(await asset("index.html")));
  app.get("/admin/styles.css", async (_request, reply) => reply.type("text/css; charset=utf-8").send(await asset("styles.css")));
  app.get("/admin/app.js", async (_request, reply) => reply.type("text/javascript; charset=utf-8").send(await asset("app.js")));
}
