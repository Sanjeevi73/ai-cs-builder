"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CapabilityState } from "@/lib/agent/capabilities";

interface Props {
  figmaState: CapabilityState;
  figmaDetail: string;
  baseState: CapabilityState;
  baseDetail: string;
  referenceSiteDetail: string;
}

type EntryPoint = "figma" | "base" | "reference-url" | "defaults";

/** The entry points from 08-admin-ui.md, each creating a project then routing on. */
export function StartPoints({ figmaState, figmaDetail, baseState, baseDetail, referenceSiteDetail }: Props) {
  const router = useRouter();
  const [figmaUrl, setFigmaUrl] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [busy, setBusy] = useState<EntryPoint | null>(null);
  const [error, setError] = useState("");

  async function createProject(entryPoint: EntryPoint, sourceRef: string) {
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Untitled site", entryPoint, sourceRef }),
    });
    if (!response.ok) throw new Error((await response.json()).error ?? "Could not create the project");
    return (await response.json()).project as { id: string };
  }

  async function startFigma() {
    setBusy("figma");
    setError("");
    try {
      const project = await createProject("figma", figmaUrl);

      // The import is the slow part — analysis of a real file takes a while —
      // so it runs on the plan screen where there is somewhere to show progress.
      const params = figmaUrl ? `?figma=${encodeURIComponent(figmaUrl)}` : "?figma=demo";
      router.push(`/plan/${project.id}${params}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(null);
    }
  }

  async function startReferenceSite() {
    if (!siteUrl.trim()) {
      setError("Enter the address of your existing website first.");
      return;
    }
    setBusy("reference-url");
    setError("");
    try {
      const project = await createProject("reference-url", siteUrl);
      // Reading a real site takes a moment too, so this goes through the same
      // plan screen the Figma import uses to show progress.
      router.push(`/plan/${project.id}?siteUrl=${encodeURIComponent(siteUrl)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(null);
    }
  }

  async function startBase() {
    setBusy("base");
    setError("");
    try {
      const project = await createProject("base", "");
      router.push(`/studio/${project.id}?start=base`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(null);
    }
  }

  async function startDefaults() {
    setBusy("defaults");
    setError("");
    try {
      const project = await createProject("defaults", "");
      // No extraction to wait on, so this goes straight to a guided theme
      // editor rather than a blank chat — there is nothing to describe yet.
      router.push(`/studio/${project.id}?start=defaults`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(null);
    }
  }

  return (
    <>
      <div className="cards">
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2>Import an existing Figma design</h2>
            {figmaState === "demo" && <span className="tag tag-warn">demo</span>}
          </div>
          <p>
            Paste a Figma file link. The agent reads the design section by section, maps anything
            functional onto an approved component, and shows you a plan before it builds anything.
          </p>
          <input
            className="field"
            placeholder="https://www.figma.com/design/…"
            value={figmaUrl}
            onChange={(event) => setFigmaUrl(event.target.value)}
            spellCheck={false}
          />
          <div className="faint" style={{ fontSize: 12.5 }}>{figmaDetail}</div>
          <button className="btn btn-primary" onClick={startFigma} disabled={busy !== null}>
            {busy === "figma" ? "Starting…" : figmaState === "demo" && !figmaUrl ? "Import the demo design" : "Import design"}
          </button>
        </div>

        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2>Match my existing website</h2>
          </div>
          <p>
            Paste the address of your company&rsquo;s current site. We&rsquo;ll read its colours, fonts,
            and header/footer layout and use them to start your new career site — no design file needed.
          </p>
          <input
            className="field"
            placeholder="https://www.yourcompany.com"
            value={siteUrl}
            onChange={(event) => setSiteUrl(event.target.value)}
            spellCheck={false}
          />
          <div className="faint" style={{ fontSize: 12.5 }}>{referenceSiteDetail}</div>
          <button className="btn btn-primary" onClick={startReferenceSite} disabled={busy !== null}>
            {busy === "reference-url" ? "Starting…" : "Match this website"}
          </button>
        </div>

        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2>Start from scratch</h2>
          </div>
          <p>
            Skip design import entirely. You&rsquo;ll get a clean, good-looking default site, then can
            adjust colours, fonts and layout yourself with simple controls — no design file or
            website needed.
          </p>
          <button className="btn" onClick={startDefaults} disabled={busy !== null}>
            {busy === "defaults" ? "Starting…" : "Use the default look"}
          </button>
        </div>

        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2>Start from the base site</h2>
            {baseState === "demo" && <span className="tag tag-warn">demo</span>}
            {baseState === "needs-config" && <span className="tag tag-bad">setup</span>}
          </div>
          <p>
            Begin from the approved career-site foundation and customise it — brand, pages, copy and
            the functionality you need — by describing what you want.
          </p>
          <div className="faint" style={{ fontSize: 12.5 }}>{baseDetail}</div>
          <button className="btn" onClick={startBase} disabled={busy !== null || baseState === "needs-config"}>
            {busy === "base" ? "Starting…" : "Start from base"}
          </button>
        </div>
      </div>

      {error && (
        <div className="notice" style={{ borderLeftColor: "var(--bad)" }}>
          {error}
        </div>
      )}
    </>
  );
}
