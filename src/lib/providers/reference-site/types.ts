import * as cheerio from "cheerio";
import type { DesignDocument, DesignFrame, DesignNode } from "@/lib/providers/figma/types";

/**
 * Turns a company's existing website into the same `DesignDocument` shape the
 * Figma providers produce, so `analyzeDesign`/`planToBlueprint` need no idea a
 * reference URL was ever involved.
 *
 * Two passes, in order:
 *
 * 1. Parse the fetched HTML directly — pull colours from inline styles and
 *    `<style>` blocks, fonts from the same, and header/nav/footer structure
 *    from the markup's own tags. Cheap, fast, no extra request.
 * 2. Only if that yields too little to be useful (few/no colours found, or a
 *    page that is almost entirely a JS mount point with no real markup), fall
 *    back to a screenshot handed to Claude's vision, which reads the rendered
 *    page the way a person would. This costs a model call, so it only runs
 *    when parsing genuinely could not do the job.
 */

export interface ReferenceSiteResult {
  design: DesignDocument;
  /** Which pass actually produced the result, for the status UI. */
  method: "parsed" | "vision";
}

const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 4_000_000;

function normalizeUrl(input: string): URL {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return new URL(withScheme);
}

async function fetchHtml(url: URL): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; CareerSiteStudio/1.0; +reference-site-import)" },
  });
  if (!response.ok) throw new Error(`The site responded with HTTP ${response.status}.`);
  const reader = response.body?.getReader();
  if (!reader) return await response.text();

  // Bounded read rather than `response.text()` — a runaway page should cost a
  // truncated parse, not an unbounded download.
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  reader.cancel().catch(() => {});
  return new TextDecoder().decode(
    chunks.reduce((acc, chunk) => {
      const merged = new Uint8Array(acc.length + chunk.length);
      merged.set(acc);
      merged.set(chunk, acc.length);
      return merged;
    }, new Uint8Array()),
  );
}

/** Every hex colour mentioned in inline styles or embedded `<style>` blocks. */
function extractColors($: cheerio.CheerioAPI): { name: string; hex: string }[] {
  const counts = new Map<string, number>();
  const hexPattern = /#(?:[0-9a-fA-F]{3}){1,2}\b/g;

  const scan = (text: string) => {
    for (const match of text.matchAll(hexPattern)) {
      const hex = match[0].length === 4 ? expandShortHex(match[0]) : match[0].toLowerCase();
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
  };

  $("style").each((_, el) => scan($(el).text()));
  $("[style]").each((_, el) => scan($(el).attr("style") ?? ""));

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([hex], index) => ({ name: `color-${index + 1}`, hex }));
}

function expandShortHex(hex: string): string {
  const [, r, g, b] = hex;
  return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
}

/** Font families named in inline styles or `<style>` blocks, most-used first. */
function extractFonts($: cheerio.CheerioAPI): { name: string; fontFamily: string; fontSize: number; fontWeight: number }[] {
  const counts = new Map<string, number>();
  const familyPattern = /font-family\s*:\s*([^;"']+)/gi;

  const scan = (text: string) => {
    for (const match of text.matchAll(familyPattern)) {
      const family = match[1].split(",")[0].trim().replace(/^["']|["']$/g, "");
      if (family) counts.set(family, (counts.get(family) ?? 0) + 1);
    }
  };

  $("style").each((_, el) => scan($(el).text()));
  $("[style]").each((_, el) => scan($(el).attr("style") ?? ""));

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([fontFamily], index) => ({ name: `text-${index + 1}`, fontFamily, fontSize: 16, fontWeight: 400 }));
}

/**
 * Reads header/nav/footer structure straight from the tags a real site uses
 * for them — semantic HTML is a much stronger signal here than anything in a
 * Figma file, where "header" is only ever a designer's guess at a layer name.
 */
function extractStructuralNode(
  $: cheerio.CheerioAPI,
  selector: string,
  fallbackName: string,
): DesignNode | null {
  const el = $(selector).first();
  if (el.length === 0) return null;

  const text: string[] = [];
  el.find("a, button, h1, h2, h3, p, span").each((_, node) => {
    const t = $(node).text().trim();
    if (t && t.length < 160) text.push(t);
  });

  return {
    id: `${fallbackName}-1`,
    name: fallbackName,
    type: "FRAME",
    bounds: { x: 0, y: 0, width: 1440, height: 120 },
    children: text.slice(0, 20).map((t, i) => ({
      id: `${fallbackName}-text-${i}`,
      name: "text",
      type: "TEXT",
      text: t,
      bounds: { x: 0, y: 0, width: 200, height: 20 },
    })),
  };
}

/**
 * Parses fetched HTML directly. Returns `null` rather than an empty result
 * when there is too little to work with, so the caller knows to fall back to
 * vision instead of quietly shipping an all-default theme.
 */
export function parseHtml(html: string, pageTitle: string): DesignDocument | null {
  const $ = cheerio.load(html);
  const colors = extractColors($);
  const text = extractFonts($);

  // Under 2 real colours usually means the page is a near-empty JS mount
  // point (a client-rendered app) rather than a site with too plain a theme —
  // real marketing/careers pages almost always style at least a couple of
  // things inline or in a `<style>` block, even a minimal one.
  if (colors.length < 2) return null;

  const header = extractStructuralNode($, "header, [role='banner'], nav", "header");
  const footer = extractStructuralNode($, "footer, [role='contentinfo']", "footer");
  const main = extractStructuralNode($, "main, [role='main'], body", "main");

  const children = [header, main, footer].filter((n): n is DesignNode => n !== null);
  const frame: DesignFrame = {
    id: "reference-page-1",
    name: pageTitle || "Reference site",
    bounds: { x: 0, y: 0, width: 1440, height: 2000 },
    children,
  };

  return {
    fileKey: "",
    fileName: pageTitle || "Reference site",
    lastModified: new Date().toISOString(),
    backend: "url-parsed",
    frames: [frame],
    styles: { colors, text },
    images: {},
    warnings: [],
  };
}

export { normalizeUrl, fetchHtml };
