import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { DaoConfig } from "@builder-dao/cli";
import { SCHEMA } from "./schema.js";

function defaultDataDir(): string {
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg) return join(xdg, "builder-dao");
  return join(homedir(), ".local", "share", "builder-dao");
}

export function resolveDbPath(cfg: DaoConfig, override?: string): string {
  if (override) return override;
  if (process.env.DB_PATH) return process.env.DB_PATH;
  const shortAddr = cfg.daoAddress.slice(0, 10); // "0x" + 8 hex chars
  return join(defaultDataDir(), `${shortAddr}.db`);
}

const dbCache = new Map<string, Database.Database>();

export function openDatabase(cfg: DaoConfig, override?: string): Database.Database {
  const path = resolveDbPath(cfg, override);
  const cached = dbCache.get(path);
  if (cached) return cached;

  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);

  dbCache.set(path, db);
  return db;
}

export function closeDatabase(path?: string): void {
  if (path) {
    const db = dbCache.get(path);
    if (db) { db.close(); dbCache.delete(path); }
    return;
  }
  for (const [, db] of dbCache) db.close();
  dbCache.clear();
}

export function createTestDatabase(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}
