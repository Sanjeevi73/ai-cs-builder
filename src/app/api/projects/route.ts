import { store } from "@/lib/store/store";
import { Project } from "@/lib/blueprint/schema";

export const runtime = "nodejs";

const ENTRY_POINTS = Project.shape.entryPoint.options;

export async function GET() {
  return Response.json({ projects: await store.listProjects() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    name?: string;
    entryPoint?: string;
    sourceRef?: string;
  };

  if (!body.name?.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  if (!ENTRY_POINTS.includes(body.entryPoint as (typeof ENTRY_POINTS)[number])) {
    return Response.json({ error: `entryPoint must be one of: ${ENTRY_POINTS.join(", ")}` }, { status: 400 });
  }

  const project = await store.createProject({
    name: body.name.trim(),
    entryPoint: body.entryPoint as Project["entryPoint"],
    sourceRef: body.sourceRef,
  });

  return Response.json({ project }, { status: 201 });
}
