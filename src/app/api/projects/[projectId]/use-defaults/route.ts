import { store } from "@/lib/store/store";
import { defaultBlueprint } from "@/lib/blueprint/defaults";

export const runtime = "nodejs";

/**
 * Seeds the "start from scratch" project with a presentable default blueprint.
 *
 * Unlike the Figma and reference-site imports, there is nothing to fetch or
 * analyze here — the whole point of this path is that it needs neither a
 * design nor a model call — so this runs synchronously and the studio can
 * open straight into the guided theme editor.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const project = await store.getProject(projectId);
  if (!project) return Response.json({ error: "No such project" }, { status: 404 });

  const existing = await store.getCurrentBlueprint(projectId);
  if (existing) return Response.json({ blueprint: existing });

  const blueprint = defaultBlueprint(projectId, project.name === "Untitled site" ? "Your company" : project.name);
  await store.saveVersion(projectId, { blueprint, summary: "Started from the default look" });
  await store.updateProject(projectId, { entryPoint: "defaults", status: "ready" });

  return Response.json({ blueprint });
}
