import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerWidgetUi } from "../src/api/widget-ui.js";

describe("shopping widget UI", () => {
  it("serves a production iframe shell and isolated assets", async () => {
    const app = Fastify(); registerWidgetUi(app);
    const [page, styles, script, launcher, demo] = await Promise.all([
      app.inject({ method: "GET", url: "/widget?storeId=shop" }),
      app.inject({ method: "GET", url: "/widget/styles.css" }),
      app.inject({ method: "GET", url: "/widget/app.js" }),
      app.inject({ method: "GET", url: "/embed/shop-agent.js" }),
      app.inject({ method: "GET", url: "/widget-demo" }),
    ]);
    expect(page.statusCode).toBe(200);
    expect(page.headers["content-security-policy"]).toContain("frame-ancestors *");
    expect(page.body).toContain("Asystent zakupowy");
    expect(page.body).toContain("comparison-bar");
    expect(styles.body).toContain("prefers-reduced-motion");
    expect(styles.body).toContain(".product-card");
    expect(script.body).toContain("/v1/chat");
    expect(script.body).toContain("safeUrl");
    expect(script.body).toContain("products.length>1||state.selected.size>0");
    expect(script.body).toContain('["similar","similarCheaper"].includes');
    expect(script.body).toContain("conversationId:state.conversationId");
    expect(page.body).toContain('id="privacy-link"');
    expect(script.body).toContain("privacy?.noticeUrl");
    expect(script.body).toContain("consumeSuggestions");
    expect(launcher.statusCode).toBe(200);
    expect(launcher.headers["cache-control"]).toContain("max-age=300");
    expect(launcher.body).toContain("attachShadow");
    expect(launcher.body).toContain("data-store-id");
    expect(demo.statusCode).toBe(200);
    expect(demo.body).toContain("Przykładowy sklep");
    await app.close();
  });
});
