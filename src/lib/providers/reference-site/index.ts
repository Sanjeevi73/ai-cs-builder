import * as cheerio from "cheerio";
import type { DesignDocument } from "@/lib/providers/figma/types";
import { fetchHtml, normalizeUrl, parseHtml } from "./types";
import { readWithVision, visionFallbackStatus } from "./vision";
import { hasApiKey } from "@/lib/agent/client";

export type { ReferenceSiteResult } from "./types";

/**
 * Imports a company's existing website as a `DesignDocument` — parse first,
 * screenshot-and-vision only when parsing found too little to work with.
 *
 * Converges on exactly the shape the Figma providers produce, so everything
 * downstream (`analyzeDesign`, `planToBlueprint`, the fidelity review) needs
 * no idea this design came from a URL rather than a Figma file.
 */
export async function importReferenceSite(
  rawUrl: string,
  projectId: string,
): Promise<{ design: DesignDocument; method: "parsed" | "vision" }> {
  const url = normalizeUrl(rawUrl);
  const html = await fetchHtml(url);
  const pageTitle = cheerio.load(html)("title").first().text().trim();

  const parsed = parseHtml(html, pageTitle);
  if (parsed) return { design: parsed, method: "parsed" };

  if (!hasApiKey()) {
    throw new Error(
      "This page's markup did not have enough styling to read directly, and reading it visually needs ANTHROPIC_API_KEY to be set.",
    );
  }
  const design = await readWithVision(url, pageTitle, projectId);
  return { design, method: "vision" };
}

export interface ReferenceSiteStatus {
  ready: boolean;
  detail: string;
}

/** Reported to the studio alongside the other capabilities. */
export function referenceSiteStatus(): ReferenceSiteStatus {
  const vision = visionFallbackStatus();
  return {
    ready: true,
    detail: vision.ready
      ? "Reads a company's real site directly from its markup, with a visual fallback for pages that are mostly JavaScript."
      : `Reads a company's real site directly from its markup. ${vision.detail}`,
  };
}
