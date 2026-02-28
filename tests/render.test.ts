import { describe, expect, test } from "bun:test";
import { renderMarkdown } from "../src/lib/render";

describe("renderMarkdown", () => {
  test("renders a paragraph", () => {
    const html = renderMarkdown("Hello world");
    expect(html).toContain("<p>Hello world</p>");
  });

  test("renders headings", () => {
    const html = renderMarkdown("# Title\n\nBody text");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<p>Body text</p>");
  });

  test("renders inline code", () => {
    const html = renderMarkdown("Use `bun test` to run tests");
    expect(html).toContain("<code>bun test</code>");
  });

  test("renders links", () => {
    const html = renderMarkdown("[GitHub](https://github.com)");
    expect(html).toContain('<a href="https://github.com">GitHub</a>');
  });

  test("renders code blocks", () => {
    const html = renderMarkdown("```ts\nconst x = 1;\n```");
    expect(html).toContain("<code");
    expect(html).toContain("const x = 1;");
  });

  test("handles empty input", () => {
    const html = renderMarkdown("");
    expect(html).toBe("");
  });
});
