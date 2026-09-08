import { Blueprint, type BlueprintInput } from "./schema";

/**
 * The "start from scratch" seed — a clean, presentable site with no design or
 * reference site behind it. Every theme value comes from `DesignTokens`'
 * own schema defaults (parsing `{}` through `Blueprint` fills them in), so this
 * can never drift out of sync with what an empty blueprint already means
 * elsewhere in the app; only content and structure are written out here.
 *
 * Distinct from `start_from_base`'s minimal seed (`src/lib/agent/tools.ts`) —
 * that one is empty on purpose, waiting for the agent to fill it in from the
 * base repo. This one is meant to be presentable immediately, before an admin
 * has touched anything, since "start from scratch" has no import step to fill
 * that gap.
 */
export function defaultBlueprint(projectId: string, companyName: string): Blueprint {
  const seed: BlueprintInput = {
    projectId,
    company: {
      name: companyName,
      tagline: "Join our team",
      brand: { logoAlt: companyName, tokens: { colors: {} } },
    },
    nav: [{ label: "Home", pageId: "home" }],
    pages: [
      {
        id: "home",
        name: "Home",
        path: "/",
        seo: { title: companyName, description: `Careers at ${companyName}` },
        sections: [
          {
            id: "nav-1",
            type: "nav",
            category: "static",
            source: "custom",
            label: "Navigation",
            content: { showLogo: true, sticky: true },
            origin: { kind: "admin", note: "default seed" },
          },
          {
            id: "hero-1",
            type: "hero",
            category: "static",
            source: "custom",
            label: "Hero Banner",
            content: {
              headline: `Build your career at ${companyName}`,
              subhead: "We're hiring people who want to do their best work.",
              ctaLabel: "See open roles",
              alignment: "left",
            },
            origin: { kind: "admin", note: "default seed" },
          },
          {
            id: "footer-1",
            type: "footer",
            category: "static",
            source: "custom",
            label: "Footer",
            content: { legal: `© ${new Date().getFullYear()} ${companyName}` },
            origin: { kind: "admin", note: "default seed" },
          },
        ],
      },
    ],
    layout: { slots: { header: "nav-1", main: "hero-1", footer: "footer-1" } },
  };

  return Blueprint.parse(seed);
}
