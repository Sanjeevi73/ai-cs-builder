import { store } from "@/lib/store/store";
import { importReferenceSite } from "@/lib/providers/reference-site";
import { summarizeDesign } from "@/lib/providers/figma/summarize";
import { analyzeDesign } from "@/lib/agent/analyze";
import { describeApiError } from "@/lib/agent/client";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Runs the reference-website-URL import, mirroring `import-figma/route.ts`
 * exactly: fetch/read the source, analyze it into a site plan, and hold it on
 * the project for the AI Site Plan screen. Nothing is built until that plan is
 * approved there — this route never touches the blueprint.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const project = await store.getProject(projectId);
  if (!project) return Response.json({ error: "No such project" }, { status: 404 });

  const body = (await request.json()) as { siteUrl?: string };
  const siteUrl = (body.siteUrl ?? "").trim();
  if (!siteUrl) {
    return Response.json(
      { error: "Enter the address of your existing website, e.g. https://www.example.com" },
      { status: 400 },
    );
  }

  try {
    const { design, method } = await importReferenceSite(siteUrl, projectId);
    const { plan, dropped } = await analyzeDesign(design);

    await store.savePlan(projectId, plan, {
      backend: design.backend,
      fileName: design.fileName,
      frameCount: design.frames.length,
      dropped,
      warnings: design.warnings,
      designSummary: summarizeDesign(design),
      designStyles: design.styles,
      designImages: design.images,
      extractionMethod: method,
    });
    await store.saveDesign(projectId, design);
    await store.updateProject(projectId, {
      entryPoint: "reference-url",
      sourceRef: siteUrl,
      name: project.name === "Untitled site" ? design.fileName : project.name,
    });

    return Response.json({
      plan,
      dropped,
      backend: design.backend,
      fileName: design.fileName,
      warnings: design.warnings,
      method,
    });
  } catch (error) {
    return Response.json({ error: describeApiError(error) }, { status: 502 });
  }
}
