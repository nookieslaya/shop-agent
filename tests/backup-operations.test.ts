import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

describe("PostgreSQL backup operations",()=>{
  it("runs a persistent backup service with a dedicated volume",()=>{const compose=read("docker-compose.yml");expect(compose).toContain("backup:");expect(compose).toContain("dockerfile: Dockerfile.backup");expect(compose).not.toContain("./ops/postgres:/scripts");expect(compose).toContain("shop_agent_backups:/backups");expect(compose).toContain("BACKUP_RETENTION_DAYS");});
  it("normalizes Windows line endings inside the immutable backup image",()=>{const dockerfile=read("Dockerfile.backup");const attributes=read(".gitattributes");expect(dockerfile).toContain("sed -i 's/\\r$//'");expect(dockerfile).toContain("chmod 0555");expect(attributes).toContain("*.sh text eol=lf");});
  it("creates and publishes only validated atomic archives",()=>{const script=read("ops/postgres/backup-once.sh");expect(script).toContain("pg_dump --format=custom");expect(script).toContain("pg_restore --list");expect(script).toContain('mv "$temporary" "$archive"');expect(script).toContain("sha256sum");expect(script).toContain("-mtime");});
  it("trial-restores into a disposable database and always cleans it up",()=>{const script=read("ops/postgres/verify-backup.sh");expect(script).toContain("createdb");expect(script).toContain("pg_restore --exit-on-error");expect(script).toContain("trap cleanup EXIT INT TERM");expect(script).toContain("dropdb --if-exists");});
  it("requires an exact confirmation before replacing the application database",()=>{const script=read("ops/postgres/restore-backup.sh");expect(script).toContain('RESTORE-$PGDATABASE');expect(script).toContain("sha256sum -c");expect(script).toContain("pg_restore --exit-on-error");expect(script.indexOf('test "$confirmation"')).toBeLessThan(script.indexOf('dropdb --if-exists "$PGDATABASE"'));});
});
