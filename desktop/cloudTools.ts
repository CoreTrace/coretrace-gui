import type { Plan, Tool } from "./types";

/**
 * Which tools a cloud run should offer, and which it should start with.
 *
 * The platform picks tools for the languages it finds once the archive is
 * uploaded. The reader chooses before anything is sent, so the application has
 * to find those languages itself, from the files of the open folder.
 */

/**
 * The language each source extension is written in, named as the platform
 * names them in `Tool.languages`.
 *
 * Headers count as C: a `.h` alone cannot say which, and a C++ project almost
 * always has a `.cpp` beside it that settles the question.
 */
const EXTENSIONS: Record<string, string> = {
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  "c++": "cpp",
  hh: "cpp",
  hpp: "cpp",
  hxx: "cpp",
  py: "python",
  pyi: "python",
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
};

/** The languages present among `files` (paths, relative or not), sorted. */
export function languagesOf(files: readonly string[]): string[] {
  const found = new Set<string>();
  for (const file of files) {
    const name = file.slice(file.lastIndexOf("/") + 1);
    const dot = name.lastIndexOf(".");
    // A leading dot names a hidden file, not an extension.
    if (dot <= 0) continue;
    const language = EXTENSIONS[name.slice(dot + 1).toLowerCase()];
    if (language) found.add(language);
  }
  return [...found].sort();
}

/** Tools that do another's job better, on the plans that include them. */
const REPLACES: Record<string, string> = {
  "python-analyzer-pro": "python-analyzer",
};

/**
 * The tools the platform would run on its own for these languages: those the
 * plan includes and that read one of the languages, with a Pro tool in place
 * of the one it replaces. Ids come back in the order the platform lists them.
 */
export function defaultTools(
  tools: readonly Pick<Tool, "id" | "languages" | "entitled">[],
  languages: readonly string[],
): string[] {
  const present = new Set(languages.map((l) => l.toLowerCase()));
  const chosen = tools.filter(
    (tool) =>
      tool.entitled &&
      tool.languages.some((language) => present.has(language.toLowerCase())),
  );
  const replaced = new Set(
    chosen.flatMap((tool) => (REPLACES[tool.id] ? [REPLACES[tool.id]] : [])),
  );
  return chosen.map((tool) => tool.id).filter((id) => !replaced.has(id));
}

/**
 * The plan that unlocks an entitlement: the cheapest one that includes it.
 * The platform lists plans cheapest first, so that is the first match.
 * Undefined when no plan is known to include it.
 */
export function planFor(
  entitlement: string,
  plans: readonly Pick<Plan, "name" | "entitlements">[],
): string | undefined {
  return plans.find((plan) => plan.entitlements.includes(entitlement))?.name;
}
