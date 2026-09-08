import { applyOperations, BlueprintOperation } from "@/lib/blueprint/operations";
import { isBuildable, validateBlueprint } from "@/lib/blueprint/validate";
import { store } from "@/lib/store/store";
import { clients } from "@/lib/store/clients";
import { DesignTokens } from "@/lib/blueprint/schema";

export const runtime = "nodejs";

/**
 * Applies a theme change from the guided editor, without going through the
 * assistant — same reasoning as `sections/route.ts`: a colour picker or font
 * dropdown has an unambiguous outcome, so there is nothing for a model to
 * interpret. Routes through the same `update_theme` operation and validation
 * an agent edit would, and counts as one user-initiated edit against the
 * client's plan, exactly like a chat turn.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;

  const project = await store.getProject(projectId);
  if (!project) return Response.json({ error: "No such project" }, { status: 404 });

  const blueprint = await store.getCurrentBlueprint(projectId);
  if (!blueprint) return Response.json({ error: "This project has no site yet" }, { status: 400 });

  const { allowed, usage, limit } = await clients.canEdit(project.clientId);
  if (!allowed) {
    return Response.json(
      {
        error: `You've used all ${limit} edits included in your current plan this period. Upgrading your plan or waiting for the next billing period will let you keep making changes — nothing you've built so far is affected.`,
        code: "edit_limit_reached",
        editCount: usage.editCount,
        limit,
      },
      { status: 403 },
    );
  }

  const body = (await request.json()) as { tokens?: unknown };
  const parsedTokens = DesignTokens.partial().safeParse(body.tokens ?? {});
  if (!parsedTokens.success) {
    return Response.json({ error: "That theme setting was not valid." }, { status: 400 });
  }

  const operation = BlueprintOperation.parse({ op: "update_theme", tokens: parsedTokens.data });
  const result = applyOperations(blueprint, [operation]);
  if (result.rejected.length > 0) {
    return Response.json({ error: result.rejected[0].reason }, { status: 400 });
  }

  const issues = validateBlueprint(result.blueprint);
  if (!isBuildable(issues)) {
    return Response.json(
      { error: "That would make the site invalid", issues: issues.filter((i) => i.level === "error") },
      { status: 422 },
    );
  }

  const version = await store.saveVersion(projectId, {
    blueprint: result.blueprint,
    summary: result.changes[0] ?? "Updated theme",
    operations: [operation as unknown as Record<string, unknown>],
  });
  await clients.recordEdit(project.clientId);

  return Response.json({ version: version.version, blueprint: result.blueprint });
}
