"use client";

import { useEffect, useState } from "react";
import type { DesignTokens } from "@/lib/blueprint/schema";

/**
 * The guided theme editor — colour pickers, font dropdowns and toggles for
 * someone who should never have to open raw JSON.
 *
 * Reachable from any project, but it's the only way "start from scratch"
 * customises a site: that path has no design or reference site to read from,
 * so simple controls are the entire interaction rather than a fallback for
 * when the conversation gets it wrong.
 *
 * Every change applies immediately as its own version (via /theme, mirroring
 * how the section catalog applies structural changes without the assistant),
 * so the preview updates live and there is nothing to "save" separately.
 */

const FONT_CHOICES = ["Inter", "Georgia", "Poppins", "Roboto", "Merriweather", "Space Grotesk"];
const BUTTON_STYLES: { value: DesignTokens["buttonStyle"]; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "outline", label: "Outlined" },
  { value: "pill", label: "Pill-shaped" },
  { value: "square", label: "Square corners" },
];

interface Props {
  projectId: string;
  tokens: DesignTokens;
  onClose: () => void;
  onApplied: () => void;
}

const COLOR_FIELDS: { key: keyof DesignTokens["colors"]; label: string; help: string }[] = [
  { key: "primary", label: "Primary", help: "Your main brand colour — buttons, links, highlights." },
  { key: "secondary", label: "Secondary", help: "A supporting colour used alongside the primary one." },
  { key: "accent", label: "Accent", help: "Used sparingly, for things that should stand out." },
  { key: "background", label: "Page background", help: "The colour behind everything else." },
  { key: "text", label: "Text", help: "The colour most of your copy is written in." },
];

export function ThemeEditor({ projectId, tokens, onClose, onApplied }: Props) {
  const [draft, setDraft] = useState<DesignTokens>(tokens);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function apply(next: DesignTokens) {
    setDraft(next);
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/theme`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens: next }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not apply that change");
      onApplied();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="catalog-backdrop" onClick={onClose}>
      <div className="catalog" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Customise your theme">
        <header className="catalog-head">
          <div>
            <strong>Customise your look</strong>
            <div className="faint" style={{ fontSize: 12.5 }}>
              Changes apply to the preview right away — nothing here goes live until you request publication.
            </div>
          </div>
          <button className="btn btn-sm" onClick={onClose}>
            Done
          </button>
        </header>

        <div className="catalog-body">
          <div className="catalog-group">
            <div className="faint" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
              Colours
            </div>
            {COLOR_FIELDS.map(({ key, label, help }) => (
              <div key={key} className="catalog-item" style={{ alignItems: "center" }}>
                <div className="catalog-item-main">
                  <div className="catalog-item-title">{label}</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>{help}</div>
                </div>
                <div className="catalog-item-actions" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="color"
                    value={draft.colors[key] ?? "#000000"}
                    disabled={saving}
                    onChange={(event) =>
                      apply({ ...draft, colors: { ...draft.colors, [key]: event.target.value } })
                    }
                    style={{ width: 36, height: 28, padding: 0, border: "1px solid var(--border)", borderRadius: 4, background: "none" }}
                  />
                  <span className="faint mono" style={{ fontSize: 12 }}>{draft.colors[key] ?? "—"}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="catalog-group">
            <div className="faint" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
              Fonts
            </div>
            <div className="catalog-item" style={{ alignItems: "center" }}>
              <div className="catalog-item-main">
                <div className="catalog-item-title">Headings</div>
                <div className="muted" style={{ fontSize: 12.5 }}>Used for titles and section headlines.</div>
              </div>
              <select
                className="field"
                style={{ width: 180 }}
                value={draft.fonts.heading}
                disabled={saving}
                onChange={(event) => apply({ ...draft, fonts: { ...draft.fonts, heading: event.target.value } })}
              >
                {FONT_CHOICES.map((font) => (
                  <option key={font} value={font}>{font}</option>
                ))}
              </select>
            </div>
            <div className="catalog-item" style={{ alignItems: "center" }}>
              <div className="catalog-item-main">
                <div className="catalog-item-title">Body text</div>
                <div className="muted" style={{ fontSize: 12.5 }}>Used for paragraphs and most other copy.</div>
              </div>
              <select
                className="field"
                style={{ width: 180 }}
                value={draft.fonts.body}
                disabled={saving}
                onChange={(event) => apply({ ...draft, fonts: { ...draft.fonts, body: event.target.value } })}
              >
                {FONT_CHOICES.map((font) => (
                  <option key={font} value={font}>{font}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="catalog-group">
            <div className="faint" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
              Buttons &amp; shape
            </div>
            <div className="catalog-item" style={{ alignItems: "center" }}>
              <div className="catalog-item-main">
                <div className="catalog-item-title">Button style</div>
                <div className="muted" style={{ fontSize: 12.5 }}>How buttons look across your site.</div>
              </div>
              <select
                className="field"
                style={{ width: 180 }}
                value={draft.buttonStyle}
                disabled={saving}
                onChange={(event) =>
                  apply({ ...draft, buttonStyle: event.target.value as DesignTokens["buttonStyle"] })
                }
              >
                {BUTTON_STYLES.map((choice) => (
                  <option key={choice.value} value={choice.value}>{choice.label}</option>
                ))}
              </select>
            </div>
            <div className="catalog-item" style={{ alignItems: "center" }}>
              <div className="catalog-item-main">
                <div className="catalog-item-title">Rounded corners</div>
                <div className="muted" style={{ fontSize: 12.5 }}>Sharper or softer edges on cards and buttons.</div>
              </div>
              <input
                type="range"
                min={0}
                max={32}
                value={draft.radius}
                disabled={saving}
                onChange={(event) => apply({ ...draft, radius: Number(event.target.value) })}
                style={{ width: 180 }}
              />
            </div>
          </div>

          {error && (
            <div className="notice" style={{ borderLeftColor: "var(--bad)" }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
