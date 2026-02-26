/** Simple markdown to HTML renderer — covers the basics for vault notes. */
export function renderMarkdown(md: string): string {
  let html = md
    // headings
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // bold / italic
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // wikilinks → internal links
    .replace(/\[\[([^\]]+)\]\]/g, '<a href="/note/$1">$1</a>')
    // unordered lists
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    // horizontal rules
    .replace(/^---$/gm, "<hr>")
    // paragraphs (double newline)
    .replace(/\n\n/g, "</p><p>");

  // wrap list items
  html = html.replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>");
  // clean up nested ul
  html = html.replace(/<\/ul>\s*<ul>/g, "");

  return `<p>${html}</p>`;
}
