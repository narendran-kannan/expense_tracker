// Minimal stand-in for the `html-to-text` package (not installed in this checkout).
// Benchmark bodies are plain text, so htmlToText is effectively identity.
export function convert(html) {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

const htmlToText = { convert };

export default htmlToText;
