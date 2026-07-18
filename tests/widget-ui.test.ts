import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerWidgetUi } from "../src/api/widget-ui.js";

describe("shopping widget UI", () => {
  it("serves a production iframe shell and isolated assets", async () => {
    const app = Fastify(); registerWidgetUi(app);
    const [page, styles, script] = await Promise.all([
      app.inject({ method: "GET", url: "/widget?storeId=shop" }),
      app.inject({ method: "GET", url: "/widget/styles.css" }),
      app.inject({ method: "GET", url: "/widget/app.js" }),
    ]);
    expect(page.statusCode).toBe(200);
    expect(page.headers["content-security-policy"]).toContain("frame-ancestors *");
    expect(page.body).toContain("Asystent zakupowy");
    expect(page.body).toContain("comparison-bar");
    expect(styles.body).toContain("prefers-reduced-motion");
    expect(styles.body).toContain(".product-card");
    expect(script.body).toContain("/v1/chat");
    expect(script.body).toContain("safeUrl");
    await app.close();
  });
});
