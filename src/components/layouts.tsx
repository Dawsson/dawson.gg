import type { FC, PropsWithChildren } from "hono/jsx";
import { raw } from "hono/html";
import { SHARED_CSS, PORTFOLIO_CSS, BLOG_CSS } from "../styles.ts";

const FONT_URL =
  "https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap";

const FAVICON_SVG = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>`;

const Head: FC<{
  title: string;
  description: string;
  css: string;
}> = ({ title, description, css }) => (
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content={description} />
    <link rel="icon" href={FAVICON_SVG} />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link
      rel="preconnect"
      href="https://fonts.gstatic.com"
      crossorigin="anonymous"
    />
    {raw(
      `<link rel="preload" href="${FONT_URL}" as="style" onload="this.onload=null;this.rel='stylesheet'" /><noscript><link rel="stylesheet" href="${FONT_URL}" /></noscript>`,
    )}
    <title>{title} — dawson.gg</title>
    <style>{SHARED_CSS + css}</style>
  </head>
);

const DEFAULT_DESC =
  "Dawson — Software engineer building products across the stack, from mobile apps to cloud infrastructure.";

export const PortfolioLayout: FC<
  PropsWithChildren<{ title: string; description?: string }>
> = ({ title, description, children }) => (
  <html lang="en">
    <Head
      title={title}
      description={description ?? DEFAULT_DESC}
      css={PORTFOLIO_CSS}
    />
    <body>
      <main>{children}</main>
    </body>
  </html>
);

export const BlogLayout: FC<
  PropsWithChildren<{ title: string; description?: string }>
> = ({ title, description, children }) => (
  <html lang="en">
    <Head
      title={title}
      description={description ?? DEFAULT_DESC}
      css={BLOG_CSS}
    />
    <body>
      <main>{children}</main>
    </body>
  </html>
);

export const Nav: FC = () => (
  <nav class="nav">
    <a href="/" class="nav-home">
      dawson.gg
    </a>
    <a href="/posts" class="nav-link">
      Posts
    </a>
  </nav>
);

export const ErrorPage: FC<{ code: string; message: string }> = ({
  code,
  message,
}) => (
  <BlogLayout title="Not Found">
    <Nav />
    <div class="error-page">
      <h1>{code}</h1>
      <p>{message}</p>
      <a href="/">Go home</a>
    </div>
  </BlogLayout>
);
