import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Per-client subscription tier and edit usage.
 *
 * File-backed, same convention as `store.ts`. Kept as its own module because a
 * client is not a project — one client can own many projects, and this data
 * outlives any single one of them.
 */

export const TIERS = ["starter", "growth", "enterprise"] as const;
export type Tier = (typeof TIERS)[number];

/** Edits allowed per billing period, by tier. `null` means unlimited. */
export const TIER_LIMITS: Record<Tier, number | null> = {
  starter: 20,
  growth: 100,
  enterprise: null,
};

export interface ClientUsage {
  clientId: string;
  tier: Tier;
  /** User-initiated edits made this period: one chat turn or one form submit,
   * however many blueprint operations it produced. */
  editCount: number;
}

const ROOT = process.env.STUDIO_DATA_DIR
  ? path.join(process.env.STUDIO_DATA_DIR, "..", "clients")
  : path.join(process.cwd(), ".data", "clients");

function fileFor(clientId: string): string {
  return path.join(ROOT, `${clientId}.json`);
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2), "utf8");
}

function defaultUsage(clientId: string): ClientUsage {
  return { clientId, tier: "starter", editCount: 0 };
}

export const clients = {
  async getUsage(clientId: string): Promise<ClientUsage> {
    return (await readJson<ClientUsage>(fileFor(clientId))) ?? defaultUsage(clientId);
  },

  async setTier(clientId: string, tier: Tier): Promise<ClientUsage> {
    const usage = await this.getUsage(clientId);
    usage.tier = tier;
    await writeJson(fileFor(clientId), usage);
    return usage;
  },

  /** Resets the counter — e.g. at the start of a new billing period. */
  async resetUsage(clientId: string): Promise<ClientUsage> {
    const usage = await this.getUsage(clientId);
    usage.editCount = 0;
    await writeJson(fileFor(clientId), usage);
    return usage;
  },

  /**
   * Whether this client may make one more user-initiated edit right now, and
   * the usage that decision was based on — callers show `limit`/`editCount` in
   * the friendly block message without a second read.
   *
   * ENFORCE_EDIT_LIMITS=false lifts the block entirely while developing, so a
   * local session never has to wait out or reset a counter to keep testing.
   * The counter still increments normally underneath (`recordEdit` does not
   * check this), so switching enforcement back on picks up real usage rather
   * than starting from zero.
   */
  async canEdit(clientId: string): Promise<{ allowed: boolean; usage: ClientUsage; limit: number | null }> {
    const usage = await this.getUsage(clientId);
    const limit = TIER_LIMITS[usage.tier];
    if (process.env.ENFORCE_EDIT_LIMITS === "false") return { allowed: true, usage, limit };
    return { allowed: limit === null || usage.editCount < limit, usage, limit };
  },

  /** Call once per user-initiated action that successfully changes a blueprint. */
  async recordEdit(clientId: string): Promise<ClientUsage> {
    const usage = await this.getUsage(clientId);
    usage.editCount += 1;
    await writeJson(fileFor(clientId), usage);
    return usage;
  },
};
