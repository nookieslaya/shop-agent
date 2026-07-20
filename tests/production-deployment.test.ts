import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const compose=readFileSync("docker-compose.production.yml","utf8"),bootstrap=readFileSync("ops/production/bootstrap-env.sh","utf8"),deploy=readFileSync("ops/production/deploy.sh","utf8");
const packageJson=JSON.parse(readFileSync("package.json","utf8"));
describe("production deployment",()=>{
  it("does not publish PostgreSQL",()=>{const postgres=compose.slice(compose.indexOf("  postgres:"),compose.indexOf("\n  api:"));expect(postgres).not.toContain("ports:");expect(postgres).toContain("shop_agent_postgres")});
  it("publishes only the application port and applies small-host limits",()=>{expect(compose).toContain('${APP_PORT:-20137}:3000');expect(compose).toContain("mem_limit: 300m");expect(compose).toContain("no-new-privileges:true")});
  it("keeps tmpfs options in one quoted Compose value",()=>{expect(compose).toContain('tmpfs: ["/tmp:size=32m,mode=1777"]');expect(compose).not.toContain("tmpfs: [/tmp:size=32m,mode=1777]")});
  it("generates secrets without printing them and deploys migrations before writers",()=>{expect(bootstrap).toContain("openssl rand -hex");expect(bootstrap).toContain("chmod 600");expect(deploy.indexOf("dc run --rm migrate")).toBeLessThan(deploy.indexOf("dc up -d api worker backup"))});
  it("keeps production secrets out of the image context",()=>expect(readFileSync(".dockerignore","utf8")).toContain(".env.production"));
  it("ships the TypeScript runtime used by production commands",()=>{expect(packageJson.dependencies.tsx).toBeTruthy();expect(packageJson.devDependencies.tsx).toBeUndefined()});
});
