import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerAdminUi } from "../src/api/admin-ui.js";

describe("admin UI", () => {
  it("serves the owner panel and theme assets", async () => {
    const app = Fastify();
    registerAdminUi(app);
    const page = await app.inject({ method: "GET", url: "/admin" });
    const styles = await app.inject({ method: "GET", url: "/admin/styles.css" });
    const script = await app.inject({ method: "GET", url: "/admin/app.js" });
    expect(page.statusCode).toBe(200);
    expect(page.headers["content-type"]).toContain("text/html");
    expect(page.body).toContain("Panel właściciela");
    expect(page.body).not.toContain("ADMIN_API_KEY=");
    expect(page.body).toContain("Porównania i podobieństwo");
    expect(page.body).toContain("Hasło administratora");
    expect(page.body).toContain("Jak ustawić podobieństwo?");
    expect(page.body).toContain("data-tooltip=");
    expect(page.body).toContain("Sugerowane pola");
    expect(page.body).toContain("Analizuj katalog");
    expect(page.body).toContain("Widget sklepu");
    expect(page.body).toContain("Otwórz podgląd");
    expect(page.body).toContain("Gotowy kod sklepu");
    expect(page.body).toContain("Historia rozmów");
    expect(script.body).toContain("Pokaż wszystkie detale");
    expect(styles.body).toContain("--accent:");
    expect(styles.body).toContain('[data-theme="dark"]');
    expect(styles.body).toContain(".delete-button.confirming");
    expect(styles.body).toContain(".history-card");
    await app.close();
  });
});
