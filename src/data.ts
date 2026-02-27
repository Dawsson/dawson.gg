export interface Project {
  slug: string;
  title: string;
  description: string;
  technologies: string[];
  url?: string;
  github?: string;
  featured: boolean;
}

export type TechCategory =
  | "language"
  | "framework"
  | "platform"
  | "database"
  | "tool"
  | "infra"
  | "ml"
  | "mobile";

export interface Technology {
  slug: string;
  name: string;
  category: TechCategory;
  featured: boolean;
  description: string;
}

export interface Profile {
  name: string;
  title: string;
  intro: string;
  links: { label: string; url: string }[];
}

export const PROFILE: Profile = {
  name: "Dawson",
  title: "Software Engineer",
  intro:
    "Building products across the stack — from mobile apps to cloud infrastructure. I care about shipping fast, clean architecture, and tools that get out of the way.",
  links: [
    { label: "GitHub", url: "https://github.com/Dawsson" },
    { label: "X", url: "https://x.com/DawssonMonroe" },
  ],
};

export const PROJECTS: Project[] = [
  {
    slug: "peptide-ai",
    title: "Peptide AI",
    description:
      "Health-tech platform for GLP-1 peptide therapy. ML pipeline for synthetic patient data, HIPAA-compliant architecture, and provider-facing dashboards.",
    technologies: ["React Native", "TypeScript", "Python", "PostgreSQL", "Expo"],
    featured: true,
  },
  {
    slug: "vault",
    title: "Vault",
    description:
      "Personal knowledge base and second brain. Obsidian vault with AI-powered semantic search, agent automation, and a public-facing site — the one you're reading now.",
    technologies: ["TypeScript", "Cloudflare", "Hono", "Bun"],
    url: "https://dawson.gg",
    github: "https://github.com/Dawsson/vault",
    featured: true,
  },
  {
    slug: "hotline",
    title: "Hotline",
    description:
      "Dev bridge for AI agents to communicate with running React Native apps in real time. Send commands, wait for events, inspect state — all from the terminal.",
    technologies: ["TypeScript", "Bun", "React Native", "WebSocket"],
    featured: true,
  },
  {
    slug: "zestarr",
    title: "Zestarr",
    description:
      "Restaurant discovery app with AI-powered recommendations. Full-stack mobile app with real-time search, reviews, and social features.",
    technologies: ["React Native", "Expo", "TypeScript", "Next.js", "PostgreSQL"],
    featured: true,
  },
];

// ─── Technologies ───
// featured = shown on page load
// non-featured = only visible when filtering/searching

export const TECHNOLOGIES: Technology[] = [
  // ── Languages (featured) ──
  { slug: "typescript", name: "TypeScript", category: "language", featured: true, description: "Primary language — frontend, backend, tooling." },
  { slug: "python", name: "Python", category: "language", featured: true, description: "ML pipelines, data processing, scripting." },
  { slug: "kotlin", name: "Kotlin", category: "language", featured: true, description: "JVM language — Minecraft plugins, Android, server-side." },
  { slug: "go", name: "Go", category: "language", featured: true, description: "Systems programming, CLIs, microservices." },
  { slug: "java", name: "Java", category: "language", featured: true, description: "Minecraft plugins, enterprise backends, Android." },
  // ── Languages (non-featured) ──
  { slug: "javascript", name: "JavaScript", category: "language", featured: false, description: "The foundation under TypeScript." },
  { slug: "rust", name: "Rust", category: "language", featured: false, description: "Systems programming with memory safety." },
  { slug: "html", name: "HTML", category: "language", featured: false, description: "Semantic markup and document structure." },
  { slug: "css", name: "CSS", category: "language", featured: false, description: "Styling, layout, animations." },
  { slug: "swift", name: "Swift", category: "language", featured: false, description: "iOS and macOS native development." },
  { slug: "dart", name: "Dart", category: "language", featured: false, description: "Language for Flutter cross-platform apps." },
  { slug: "c", name: "C", category: "language", featured: false, description: "Low-level systems programming." },
  { slug: "cpp", name: "C++", category: "language", featured: false, description: "Systems programming, game engines, performance-critical code." },
  { slug: "lua", name: "Lua", category: "language", featured: false, description: "Lightweight scripting language." },
  { slug: "mdx", name: "MDX", category: "language", featured: false, description: "Markdown with JSX components for docs." },
  { slug: "shell", name: "Shell/Bash", category: "language", featured: false, description: "Unix scripting and automation." },

  // ── Frameworks (featured) ──
  { slug: "react", name: "React", category: "framework", featured: true, description: "UI library for web interfaces." },
  { slug: "react-native", name: "React Native", category: "framework", featured: true, description: "Cross-platform mobile for iOS and Android." },
  { slug: "nextjs", name: "Next.js", category: "framework", featured: true, description: "Full-stack React framework." },
  { slug: "svelte", name: "Svelte", category: "framework", featured: true, description: "Compiled UI framework — 31 repos worth." },
  { slug: "hono", name: "Hono", category: "framework", featured: true, description: "Ultralight web framework for Workers and Bun." },
  { slug: "expo", name: "Expo", category: "framework", featured: true, description: "React Native toolchain — builds, OTA, native modules." },
  // ── Frameworks (non-featured) ──
  { slug: "sveltekit", name: "SvelteKit", category: "framework", featured: false, description: "Full-stack Svelte framework with SSR." },
  { slug: "shadcn", name: "shadcn/ui", category: "framework", featured: false, description: "Headless UI components for React and Svelte." },
  { slug: "react-router", name: "React Router", category: "framework", featured: false, description: "Client-side routing for React apps." },
  { slug: "tanstack-query", name: "TanStack Query", category: "framework", featured: false, description: "Async state management and data fetching." },
  { slug: "tanstack-router", name: "TanStack Router", category: "framework", featured: false, description: "Type-safe routing with built-in data loading." },
  { slug: "tanstack-table", name: "TanStack Table", category: "framework", featured: false, description: "Headless table and datagrid utilities." },
  { slug: "tailwindcss", name: "Tailwind CSS", category: "framework", featured: false, description: "Utility-first CSS framework." },
  { slug: "flutter", name: "Flutter", category: "framework", featured: false, description: "Cross-platform UI framework with Dart." },
  { slug: "swiftui", name: "SwiftUI", category: "framework", featured: false, description: "Declarative UI framework for Apple platforms." },
  { slug: "trpc", name: "tRPC", category: "framework", featured: false, description: "End-to-end typesafe APIs for TypeScript." },
  { slug: "orpc", name: "oRPC", category: "framework", featured: false, description: "Modern typesafe RPC framework." },
  { slug: "graphql", name: "GraphQL", category: "framework", featured: false, description: "Query language for APIs with typed schemas." },
  { slug: "prisma", name: "Prisma", category: "framework", featured: false, description: "Type-safe ORM for Node.js and TypeScript." },
  { slug: "drizzle", name: "Drizzle", category: "framework", featured: false, description: "Lightweight TypeScript ORM with SQL-like syntax." },
  { slug: "mongoose", name: "Mongoose", category: "framework", featured: false, description: "MongoDB object modeling for Node.js." },
  { slug: "zustand", name: "Zustand", category: "framework", featured: false, description: "Lightweight state management for React." },
  { slug: "websocket", name: "WebSocket", category: "framework", featured: false, description: "Real-time bidirectional communication." },
  { slug: "express", name: "Express", category: "framework", featured: false, description: "Minimal Node.js web framework." },
  { slug: "spring-boot", name: "Spring Boot", category: "framework", featured: false, description: "Java framework for production-grade backends." },

  // ── Infrastructure (featured) ──
  { slug: "docker", name: "Docker", category: "infra", featured: true, description: "Containerized deployments and reproducible environments." },
  { slug: "kubernetes", name: "Kubernetes", category: "infra", featured: true, description: "Container orchestration at scale." },
  { slug: "nginx", name: "Nginx", category: "infra", featured: false, description: "Reverse proxy, load balancer, web server." },
  { slug: "traefik", name: "Traefik", category: "infra", featured: false, description: "Cloud-native reverse proxy with auto-discovery." },
  { slug: "docker-compose", name: "Docker Compose", category: "infra", featured: false, description: "Multi-container orchestration for local and prod." },
  { slug: "github-actions", name: "GitHub Actions", category: "infra", featured: false, description: "CI/CD pipelines and automation." },
  { slug: "terraform", name: "Terraform", category: "infra", featured: false, description: "Infrastructure as code for cloud provisioning." },
  { slug: "pulumi", name: "Pulumi", category: "infra", featured: false, description: "Infrastructure as code with real programming languages." },
  { slug: "alchemy", name: "Alchemy", category: "infra", featured: false, description: "TypeScript-native infrastructure as code." },
  { slug: "k3s", name: "K3s", category: "infra", featured: false, description: "Lightweight Kubernetes for edge and IoT." },
  { slug: "self-hosted", name: "Self-hosted", category: "infra", featured: false, description: "Bare metal and VPS server management." },

  // ── Platforms / Cloud (featured) ──
  { slug: "cloudflare", name: "Cloudflare", category: "platform", featured: true, description: "Workers, KV, Vectorize, R2, D1 — edge everything." },
  { slug: "aws", name: "AWS", category: "platform", featured: true, description: "EC2, S3, Lambda, RDS, and more." },
  // ── Platforms (non-featured) ──
  { slug: "gcp", name: "Google Cloud", category: "platform", featured: false, description: "Compute Engine, Cloud Functions, BigQuery." },
  { slug: "azure", name: "Azure", category: "platform", featured: false, description: "Azure Functions, Static Web Apps, DevOps." },
  { slug: "fly-io", name: "Fly.io", category: "platform", featured: false, description: "Edge-deployed containers with global distribution." },
  { slug: "railway", name: "Railway", category: "platform", featured: false, description: "Deploy anything with zero config." },
  { slug: "vercel", name: "Vercel", category: "platform", featured: false, description: "Frontend deployments and serverless functions." },
  { slug: "nodejs", name: "Node.js", category: "platform", featured: false, description: "Server-side JavaScript runtime." },

  // ── Databases (featured) ──
  { slug: "postgresql", name: "PostgreSQL", category: "database", featured: true, description: "Relational database for structured data." },
  { slug: "redis", name: "Redis", category: "database", featured: false, description: "In-memory data store, caching, pub/sub." },
  { slug: "valkey", name: "Valkey", category: "database", featured: false, description: "Redis fork — open-source in-memory data store." },
  { slug: "mysql", name: "MySQL", category: "database", featured: false, description: "Relational database, widely used in web apps." },
  // ── Databases (non-featured) ──
  { slug: "mongodb", name: "MongoDB", category: "database", featured: false, description: "Document database for flexible schemas." },
  { slug: "planetscale", name: "PlanetScale", category: "database", featured: false, description: "Serverless MySQL with branching." },
  { slug: "sqlite", name: "SQLite", category: "database", featured: false, description: "Embedded relational database." },
  { slug: "cloudflare-d1", name: "Cloudflare D1", category: "database", featured: false, description: "Edge SQL database on Cloudflare." },
  { slug: "cloudflare-kv", name: "Cloudflare KV", category: "database", featured: false, description: "Global key-value store at the edge." },

  // ── ML / Data Science ──
  { slug: "pytorch", name: "PyTorch", category: "ml", featured: true, description: "Deep learning framework for research and production." },
  { slug: "xgboost", name: "XGBoost", category: "ml", featured: false, description: "Gradient boosting for tabular data." },
  { slug: "pandas", name: "pandas", category: "ml", featured: false, description: "Data manipulation and analysis." },
  { slug: "numpy", name: "NumPy", category: "ml", featured: false, description: "Numerical computing and array operations." },
  { slug: "workers-ai", name: "Workers AI", category: "ml", featured: false, description: "Cloudflare's inference API — embeddings, LLMs." },
  { slug: "openai", name: "OpenAI API", category: "ml", featured: false, description: "GPT, embeddings, and AI integrations." },
  { slug: "claude-api", name: "Claude API", category: "ml", featured: false, description: "Anthropic's API for Claude models." },
  { slug: "openrouter", name: "OpenRouter", category: "ml", featured: false, description: "Unified API gateway for LLM providers." },

  // ── Mobile / App Tools ──
  { slug: "revenuecat", name: "RevenueCat", category: "mobile", featured: false, description: "In-app purchases and subscription management." },
  { slug: "superwall", name: "Superwall", category: "mobile", featured: false, description: "Paywall A/B testing and optimization." },
  { slug: "apps-connect", name: "App Store Connect", category: "mobile", featured: false, description: "iOS app distribution and TestFlight." },

  // ── Auth ──
  { slug: "better-auth", name: "Better Auth", category: "tool", featured: false, description: "Modern auth library for TypeScript apps." },
  { slug: "clerk", name: "Clerk", category: "tool", featured: false, description: "Drop-in authentication and user management." },
  { slug: "authjs", name: "Auth.js", category: "tool", featured: false, description: "Authentication for Next.js and web frameworks." },
  { slug: "oauth", name: "OAuth", category: "tool", featured: false, description: "Open standard for token-based authorization." },
  { slug: "jwt", name: "JWT", category: "tool", featured: false, description: "JSON Web Tokens for stateless auth." },

  // ── Analytics / Observability ──
  { slug: "posthog", name: "PostHog", category: "tool", featured: false, description: "Product analytics, feature flags, session replay." },
  { slug: "mixpanel", name: "Mixpanel", category: "tool", featured: false, description: "Event-based product analytics." },
  { slug: "plausible", name: "Plausible", category: "tool", featured: false, description: "Privacy-first web analytics." },
  { slug: "sentry", name: "Sentry", category: "tool", featured: false, description: "Error tracking and performance monitoring." },

  // ── Payments ──
  { slug: "stripe", name: "Stripe", category: "tool", featured: false, description: "Payment processing and subscription billing." },

  // ── Testing ──
  { slug: "vitest", name: "Vitest", category: "tool", featured: false, description: "Fast unit testing for Vite projects." },
  { slug: "playwright", name: "Playwright", category: "tool", featured: false, description: "End-to-end browser testing and automation." },

  // ── Design ──
  { slug: "figma", name: "Figma", category: "tool", featured: false, description: "Collaborative design and prototyping." },

  // ── Dev Tools (featured) ──
  { slug: "bun", name: "Bun", category: "tool", featured: true, description: "Fast JS runtime — package manager, bundler, test runner." },
  { slug: "git", name: "Git", category: "tool", featured: false, description: "Version control, branching, collaboration." },
  { slug: "turborepo", name: "Turborepo", category: "tool", featured: false, description: "Monorepo build orchestration." },
  // ── Build tools / Linters ──
  { slug: "vite", name: "Vite", category: "tool", featured: false, description: "Fast frontend build tool with HMR." },
  { slug: "biome", name: "Biome", category: "tool", featured: false, description: "Fast formatter and linter for JS/TS." },
  { slug: "eslint", name: "ESLint", category: "tool", featured: false, description: "Pluggable JavaScript linting." },
  { slug: "prettier", name: "Prettier", category: "tool", featured: false, description: "Opinionated code formatter." },
  { slug: "oxlint", name: "Oxlint", category: "tool", featured: false, description: "Oxidation-compiler based JS linter." },
  { slug: "esbuild", name: "esbuild", category: "tool", featured: false, description: "Extremely fast JS/TS bundler." },
  { slug: "rolldown", name: "Rolldown", category: "tool", featured: false, description: "Rust-based JS bundler, Vite's next backend." },
  // ── Operating Systems ──
  { slug: "macos", name: "macOS", category: "platform", featured: false, description: "Primary development machine." },
  { slug: "linux", name: "Linux", category: "platform", featured: false, description: "Server OS — Ubuntu, Debian, Arch, Fedora." },
  // ── AI Tools ──
  { slug: "claude-code", name: "Claude Code", category: "tool", featured: false, description: "AI-powered coding assistant and CLI." },
  { slug: "codex", name: "Codex", category: "tool", featured: false, description: "OpenAI code generation model." },
];

// Category display labels
export const CATEGORY_LABELS: Record<TechCategory, string> = {
  language: "Languages",
  framework: "Frameworks",
  platform: "Platforms",
  database: "Databases",
  tool: "Tools",
  infra: "Infrastructure",
  ml: "ML & Data",
  mobile: "Mobile",
};
