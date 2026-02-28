import type { FC, PropsWithChildren } from "hono/jsx";
import { SHARED_CSS, PORTFOLIO_CSS, BLOG_CSS } from "../styles.ts";

const FONT_URL =
  "https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap";

const Head: FC<{ title: string; css: string }> = ({ title, css }) => (
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link
      rel="preconnect"
      href="https://fonts.gstatic.com"
      crossorigin="anonymous"
    />
    <link href={FONT_URL} rel="stylesheet" />
    <title>{title} — dawson.gg</title>
    <style>{SHARED_CSS + css}</style>
  </head>
);

export const PortfolioLayout: FC<PropsWithChildren<{ title: string }>> = ({
  title,
  children,
}) => (
  <html lang="en">
    <Head title={title} css={PORTFOLIO_CSS} />
    <body>{children}</body>
  </html>
);

export const BlogLayout: FC<PropsWithChildren<{ title: string }>> = ({
  title,
  children,
}) => (
  <html lang="en">
    <Head title={title} css={BLOG_CSS} />
    <body>{children}</body>
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
