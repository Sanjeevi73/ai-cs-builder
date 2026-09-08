import { existsSync } from "node:fs";
import { type Browser, chromium } from "playwright-core";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { anthropic, MODEL } from "@/lib/agent/client";
import { storeDesignImage } from "@/lib/providers/figma/rest";
import type { DesignDocument, DesignFrame, DesignNode } from "@/lib/providers/figma/types";

/**
 * Fallback path: screenshot the reference site and have Claude's vision read
 * colours, fonts and header/footer structure off the rendered page.
 *
 * Only reached when `parseHtml` found too little in the raw markup — a page
 * that is mostly a client-rendered app, or one that inlines almost nothing.
 * Reuses the same driving-the-installed-Chrome approach as the fidelity
 * capture (`src/lib/fidelity/capture.ts`) rather than a second copy of it, and
 * the same asset-store plumbing the Figma providers use to persist a picture.
 */

const DEFAULT_CHROME_PATH = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
const VIEWPORT_WIDTH = 1440;

const VisionRead = z.object({
  colors: z
    .array(z.object({ hex: z.string().describe("hex colour"), role: z.string().describe("e.g. primary, accent, background, text") }))
    .describe("the site's real colours, most prominent first, up to 8"),
  headingFont: z.string().describe("best guess at the heading/display font family"),
  bodyFont: z.string().describe("best guess at the body font family"),
  header: z.object({
    present: z.boolean(),
    summary: z.string().describe("one sentence: what the header/nav contains"),
    navLabels: z.array(z.string()).describe("the visible nav item labels, in order"),
  }),
  footer: z.object({
    present: z.boolean(),
    summary: z.string().describe("one sentence: what the footer contains"),
  }),
});

async function launchChrome(chromePath: string): Promise<Browser> {
  const args = ["--no-sandbox"];
  try {
    return await chromium.launch({ channel: "chrome", args });
  } catch (channelError) {
    if (!existsSync(chromePath)) throw channelError;
    return chromium.launch({ executablePath: chromePath, args });
  }
}

/** Whether the vision fallback can even attempt to run right now. */
export function visionFallbackStatus(): { ready: boolean; detail: string } {
  const chromePath = DEFAULT_CHROME_PATH;
  if (!existsSync(chromePath)) {
    return {
      ready: false,
      detail: `No browser to screenshot the reference site with at ${chromePath} (set CHROME_PATH). Parsing the page's markup still works; only the vision fallback for JS-heavy pages is unavailable.`,
    };
  }
  return { ready: true, detail: `Screenshots the reference site by driving ${chromePath}, then reads it with Claude's vision.` };
}

async function screenshot(url: URL, chromePath: string): Promise<Uint8Array> {
  let browser: Browser | null = null;
  try {
    browser = await launchChrome(chromePath);
    const context = await browser.newContext({ viewport: { width: VIEWPORT_WIDTH, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    return await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: VIEWPORT_WIDTH, height: 2400 } });
  } finally {
    await browser?.close().catch(() => {});
  }
}

function headerNode(read: z.infer<typeof VisionRead>["header"]): DesignNode | null {
  if (!read.present) return null;
  return {
    id: "header-1",
    name: "header",
    type: "FRAME",
    bounds: { x: 0, y: 0, width: VIEWPORT_WIDTH, height: 120 },
    children: read.navLabels.map((label, i) => ({
      id: `header-nav-${i}`,
      name: "text",
      type: "TEXT",
      text: label,
      bounds: { x: 0, y: 0, width: 120, height: 20 },
    })),
  };
}

function footerNode(read: z.infer<typeof VisionRead>["footer"]): DesignNode | null {
  if (!read.present) return null;
  return {
    id: "footer-1",
    name: "footer",
    type: "FRAME",
    bounds: { x: 0, y: 2280, width: VIEWPORT_WIDTH, height: 120 },
    children: read.summary
      ? [{ id: "footer-text-1", name: "text", type: "TEXT", text: read.summary, bounds: { x: 0, y: 0, width: 400, height: 20 } }]
      : [],
  };
}

/**
 * Screenshots `url`, reads it with Claude's vision, and returns the same
 * `DesignDocument` shape `parseHtml` and the Figma providers produce.
 *
 * `projectId` is required (unlike the Figma providers, where it is optional)
 * because the screenshot only exists as a stored asset — there is no signed
 * upstream URL to fall back to if it is omitted.
 */
export async function readWithVision(
  url: URL,
  pageTitle: string,
  projectId: string,
): Promise<DesignDocument> {
  const chromePath = DEFAULT_CHROME_PATH;
  const png = await screenshot(url, chromePath);

  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "medium", format: zodOutputFormat(VisionRead) },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: Buffer.from(png).toString("base64") },
          },
          {
            type: "text",
            text: "This is a screenshot of a company's real website. Read its actual colours, fonts, and header/footer structure so we can match a new site's theme to it. Report only what you can see; do not invent nav labels or colours that aren't present.",
          },
        ],
      },
    ],
  });

  const read = response.parsed_output;
  if (!read) throw new Error("Claude's vision did not return a usable reading of the reference site.");

  const warnings: string[] = [];
  const images: Record<string, string> = {};
  const stored = await storeDesignImage(projectId, png, "image/png", `Screenshot of ${pageTitle || url.hostname}`, warnings);
  if (stored) images["reference-page-1"] = stored;

  const children = [headerNode(read.header), footerNode(read.footer)].filter(
    (n): n is DesignNode => n !== null,
  );
  const frame: DesignFrame = {
    id: "reference-page-1",
    name: pageTitle || url.hostname,
    bounds: { x: 0, y: 0, width: VIEWPORT_WIDTH, height: 2400 },
    children,
  };

  return {
    fileKey: "",
    fileName: pageTitle || url.hostname,
    lastModified: new Date().toISOString(),
    backend: "url-vision",
    frames: [frame],
    styles: {
      colors: read.colors.map((c, i) => ({ name: c.role || `color-${i + 1}`, hex: c.hex })),
      text: [
        { name: "heading", fontFamily: read.headingFont, fontSize: 32, fontWeight: 700 },
        { name: "body", fontFamily: read.bodyFont, fontSize: 16, fontWeight: 400 },
      ],
    },
    images,
    warnings,
  };
}
