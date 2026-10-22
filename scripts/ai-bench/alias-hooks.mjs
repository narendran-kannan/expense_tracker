// Node module-resolve hook that maps the "@/..." alias (tsconfig paths) to <root>/src.
import { pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = process.env.REPO_ROOT ?? process.cwd();

export async function resolve(specifier, context, next) {
  if (specifier === "html-to-text") {
    return next(new URL("./html-to-text-shim.mjs", import.meta.url).href, context);
  }
  if (specifier === "next/cache") {
    // Outside a Next request there is no cache to revalidate.
    return next(new URL("./next-cache-shim.mjs", import.meta.url).href, context);
  }
  if (specifier.startsWith("@/")) {
    const target = path.join(ROOT, "src", specifier.slice(2));
    const url = pathToFileURL(target).href;
    // try .ts / .tsx / index.ts / plain
    for (const cand of [url, `${url}.ts`, `${url}.tsx`, pathToFileURL(path.join(target, "index.ts")).href]) {
      try {
        return await next(cand, context);
      } catch {
        /* keep trying */
      }
    }
  }
  const looksExtensionless = !/^[a-z][a-z0-9+.-]*:/i.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier);
  if (looksExtensionless && (specifier.startsWith(".") || specifier.startsWith("/"))) {
    // The generated Prisma client uses bundler-style extensionless imports.
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      try {
        return await next(specifier + ext, context);
      } catch {
        /* keep trying */
      }
    }
  }
  return next(specifier, context);
}
