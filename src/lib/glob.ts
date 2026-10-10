/**
 * Minimal gitignore-style globs for repo file paths:
 * `*` within a folder, `**` across folders, `?` one character, `{a,b}` either.
 * A pattern without `/` matches the file name in any folder; a leading `/`
 * anchors it to the repo root.
 */
export function globToRegExp(pattern: string): RegExp {
  const trimmed = pattern.trim();
  const anchored = /^\.?\//.test(trimmed);
  let glob = trimmed.replace(/^\.?\//, "");
  if (!anchored && !glob.includes("/")) glob = `**/${glob}`;

  let source = "";
  let braceDepth = 0;
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i]!;
    if (char === "*") {
      if (glob[i + 1] === "*") {
        const slashAfter = glob[i + 2] === "/";
        source += slashAfter ? "(?:.*/)?" : ".*";
        i += slashAfter ? 2 : 1;
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else if (char === "{") {
      braceDepth++;
      source += "(?:";
    } else if (char === "}" && braceDepth > 0) {
      braceDepth--;
      source += ")";
    } else if (char === "," && braceDepth > 0) {
      source += "|";
    } else {
      source += char.replace(/[.+^$()|[\]\\]/g, "\\$&");
    }
  }
  source += ")".repeat(braceDepth);
  return new RegExp(`^${source}$`);
}

export function matchesAnyGlob(path: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(path));
}
