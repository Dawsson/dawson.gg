export interface ProjectStat {
  value: string;
  label: string;
}

export interface Project {
  slug: string;
  title: string;
  description: string;
  technologies: string[];
  url?: string;
  github?: string;
  featured: boolean;
  role?: string;
  period?: string;
  stats?: ProjectStat[];
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
  categories: TechCategory[];
  featured: boolean;
  description: string;
  keywords?: string;
}

export interface Profile {
  name: string;
  title: string;
  intro: string;
  links: { label: string; url: string }[];
}

export const PROFILE: Profile = {
  name: "Dawson Cesarek",
  title: "Full Stack Developer",
  intro:
    "<strong>Full stack</strong> developer. I build products <strong>end to end</strong> and stay with them after launch, from a pharmacy platform for clinics and telehealth to open-source tools people run on their own servers.",
  links: [
    { label: "GitHub", url: "https://github.com/Dawsson" },
    { label: "X", url: "https://x.com/DawssonMonroe" },
  ],
};

export const PROJECTS: Project[] = [
  {
    slug: "affinityrx",
    title: "AffinityRx",
    role: "CTO",
    period: "2026 —",
    description:
      "Built the clinic portal and API end to end. Clinics, medspas, and telehealth brands order compounded medications from vetted pharmacies through one portal and one API.",
    stats: [
      { value: "15+", label: "vetted pharmacies" },
      { value: "July 2026", label: "public launch" },
    ],
    technologies: ["TypeScript"],
    url: "https://joinaffinityai.com",
    featured: true,
  },
  {
    slug: "plugin-portal",
    title: "Plugin Portal",
    role: "Core maintainer",
    period: "2023 —",
    description:
      "Open-source Minecraft plugin manager in Kotlin. Server owners search, install, and update plugins from Spigot, Modrinth, Hangar, and Polymart in game chat. Rated 4.3 out of 5 from 28 ratings on Spigot.",
    stats: [
      { value: "50,000+", label: "downloads" },
      { value: "91", label: "GitHub stars" },
      { value: "~800", label: "active servers" },
    ],
    technologies: ["Kotlin"],
    url: "https://pluginportal.link",
    github: "https://github.com/flytegg/plugin-portal",
    featured: true,
  },
  {
    slug: "discordservers",
    title: "discordservers.gg",
    role: "WIP Group",
    description:
      "Discord server directory that tracked over a million members across listed communities. The original site is no longer online.",
    stats: [{ value: "1 million+", label: "members tracked" }],
    technologies: ["TypeScript"],
    featured: true,
  },
  {
    slug: "christmas-charity",
    title: "Christmas charity",
    role: "Flyte",
    period: "2023–2024",
    description:
      "Helped build the Minecraft minigames for two separate Flyte Christmas charity streams: the LearnSpigot-sponsored 2023 event with PebbleHost and BuiltByBit for No Kid Hungry, and the 2024 stream sponsored by JetBrains and Carbon Host for Best Friends Animal Society. Across both events, including company donation matches not shown on the public campaign pages, they raised over $10,000.",
    stats: [
      { value: "$10,000+", label: "raised with company matches" },
      { value: "2", label: "charity streams" },
    ],
    technologies: ["Kotlin"],
    featured: true,
  },
  {
    slug: "mc-utils",
    title: "MC Utils",
    description:
      "Free Minecraft tools for developers, builders, and players, including server jars, item IDs, and inventory slots.",
    technologies: ["Svelte"],
    url: "https://mcutils.com",
    github: "https://github.com/flytegg/mc-utils",
    featured: false,
  },
  {
    slug: "carbon-host",
    title: "Carbon Host",
    description:
      "Developer-focused Minecraft host. Built the TypeScript SDK, CLI, and server plugin. It never launched.",
    technologies: ["TypeScript", "Kotlin"],
    github: "https://github.com/carbon-host",
    featured: false,
  },
];

// ─── Technologies ───
// featured = shown on page load
// non-featured = only visible when filtering/searching

export const TECHNOLOGIES: Technology[] = [
  // ── Languages (featured) ──
  {
    slug: "typescript",
    name: "TypeScript",
    categories: ["language"],
    featured: true,
    description: "Primary language — frontend, backend, tooling.",
  },
  {
    slug: "python",
    name: "Python",
    categories: ["language"],
    featured: true,
    description: "ML pipelines, data processing, scripting.",
  },
  {
    slug: "kotlin",
    name: "Kotlin",
    categories: ["language"],
    featured: true,
    description: "JVM language — Minecraft plugins, Android, server-side.",
  },
  {
    slug: "go",
    name: "Go",
    categories: ["language"],
    featured: true,
    description: "Systems programming, CLIs, microservices.",
  },
  {
    slug: "java",
    name: "Java",
    categories: ["language"],
    featured: true,
    description: "Minecraft plugins, enterprise backends, Android.",
  },
  // ── Languages (non-featured) ──
  {
    slug: "javascript",
    name: "JavaScript",
    categories: ["language"],
    featured: false,
    description: "The foundation under TypeScript.",
  },
  {
    slug: "rust",
    name: "Rust",
    categories: ["language"],
    featured: false,
    description: "Systems programming with memory safety.",
  },
  {
    slug: "html",
    name: "HTML",
    categories: ["language"],
    featured: false,
    description: "Semantic markup and document structure.",
  },
  {
    slug: "css",
    name: "CSS",
    categories: ["language"],
    featured: false,
    description: "Styling, layout, animations.",
  },
  {
    slug: "swift",
    name: "Swift",
    categories: ["language", "mobile"],
    featured: true,
    description: "iOS and macOS native development.",
  },
  {
    slug: "dart",
    name: "Dart",
    categories: ["language"],
    featured: false,
    description: "Language for Flutter cross-platform apps.",
  },
  {
    slug: "c",
    name: "C",
    categories: ["language"],
    featured: false,
    description: "Low-level systems programming.",
  },
  {
    slug: "cpp",
    name: "C++",
    categories: ["language"],
    featured: false,
    description: "Systems programming, game engines, performance-critical code.",
  },
  {
    slug: "lua",
    name: "Lua",
    categories: ["language"],
    featured: false,
    description: "Lightweight scripting language.",
  },
  {
    slug: "mdx",
    name: "MDX",
    categories: ["language"],
    featured: false,
    description: "Markdown with JSX components for docs.",
  },
  {
    slug: "shell",
    name: "Shell/Bash",
    categories: ["language"],
    featured: false,
    description: "Unix scripting and automation.",
  },

  // ── Frameworks (featured) ──
  {
    slug: "react",
    name: "React",
    categories: ["framework"],
    featured: true,
    description: "UI library for web interfaces.",
  },
  {
    slug: "react-native",
    name: "React Native",
    categories: ["framework", "mobile"],
    featured: true,
    description: "Cross-platform mobile for iOS and Android.",
  },
  {
    slug: "nextjs",
    name: "Next.js",
    categories: ["framework"],
    featured: true,
    description: "Full-stack React framework.",
  },
  {
    slug: "svelte",
    name: "Svelte",
    categories: ["framework"],
    featured: true,
    description: "Compiled UI framework — 31 repos worth.",
  },
  {
    slug: "hono",
    name: "Hono",
    categories: ["framework"],
    featured: true,
    description: "Ultralight web framework for Workers and Bun.",
  },
  {
    slug: "expo",
    name: "Expo",
    categories: ["framework", "mobile"],
    featured: true,
    description: "React Native toolchain — builds, OTA, native modules.",
  },
  // ── Frameworks (non-featured) ──
  {
    slug: "sveltekit",
    name: "SvelteKit",
    categories: ["framework"],
    featured: false,
    description: "Full-stack Svelte framework with SSR.",
  },
  {
    slug: "shadcn",
    name: "shadcn/ui",
    categories: ["framework"],
    featured: false,
    description: "Headless UI components for React and Svelte.",
  },
  {
    slug: "react-router",
    name: "React Router",
    categories: ["framework"],
    featured: false,
    description: "Client-side routing for React apps.",
  },
  {
    slug: "tanstack-query",
    name: "TanStack Query",
    categories: ["framework"],
    featured: false,
    description: "Async state management and data fetching.",
  },
  {
    slug: "tanstack-router",
    name: "TanStack Router",
    categories: ["framework"],
    featured: false,
    description: "Type-safe routing with built-in data loading.",
  },
  {
    slug: "tanstack-table",
    name: "TanStack Table",
    categories: ["framework"],
    featured: false,
    description: "Headless table and datagrid utilities.",
  },
  {
    slug: "tailwindcss",
    name: "Tailwind CSS",
    categories: ["framework"],
    featured: false,
    description: "Utility-first CSS framework.",
  },
  {
    slug: "flutter",
    name: "Flutter",
    categories: ["framework"],
    featured: false,
    description: "Cross-platform UI framework with Dart.",
  },
  {
    slug: "swiftui",
    name: "SwiftUI",
    categories: ["framework", "mobile"],
    featured: true,
    description: "Declarative UI framework for Apple platforms.",
  },
  {
    slug: "trpc",
    name: "tRPC",
    categories: ["framework"],
    featured: false,
    description: "End-to-end typesafe APIs for TypeScript.",
  },
  {
    slug: "orpc",
    name: "oRPC",
    categories: ["framework"],
    featured: false,
    description: "Modern typesafe RPC framework.",
  },
  {
    slug: "graphql",
    name: "GraphQL",
    categories: ["framework"],
    featured: false,
    description: "Query language for APIs with typed schemas.",
  },
  {
    slug: "prisma",
    name: "Prisma",
    categories: ["framework"],
    featured: false,
    description: "Type-safe ORM for Node.js and TypeScript.",
  },
  {
    slug: "drizzle",
    name: "Drizzle",
    categories: ["framework"],
    featured: false,
    description: "Lightweight TypeScript ORM with SQL-like syntax.",
  },
  {
    slug: "mongoose",
    name: "Mongoose",
    categories: ["framework"],
    featured: false,
    description: "MongoDB object modeling for Node.js.",
  },
  {
    slug: "zustand",
    name: "Zustand",
    categories: ["framework"],
    featured: false,
    description: "Lightweight state management for React.",
  },
  {
    slug: "websocket",
    name: "WebSocket",
    categories: ["framework"],
    featured: false,
    description: "Real-time bidirectional communication.",
  },
  {
    slug: "express",
    name: "Express",
    categories: ["framework"],
    featured: false,
    description: "Minimal Node.js web framework.",
  },
  {
    slug: "spring-boot",
    name: "Spring Boot",
    categories: ["framework"],
    featured: false,
    description: "Java framework for production-grade backends.",
  },

  // ── Infrastructure (featured) ──
  {
    slug: "docker",
    name: "Docker",
    categories: ["infra"],
    featured: true,
    description: "Containerized deployments and reproducible environments.",
    keywords: "containers devops deploy hosting self-hosting",
  },
  {
    slug: "kubernetes",
    name: "Kubernetes",
    categories: ["infra"],
    featured: true,
    description: "Container orchestration at scale.",
    keywords: "k8s containers devops cloud deploy hosting self-hosting",
  },
  {
    slug: "nginx",
    name: "Nginx",
    categories: ["infra"],
    featured: false,
    description: "Reverse proxy, load balancer, web server.",
    keywords: "self-hosting hosting deploy load-balancing",
  },
  {
    slug: "traefik",
    name: "Traefik",
    categories: ["infra"],
    featured: false,
    description: "Cloud-native reverse proxy with auto-discovery.",
    keywords: "self-hosting hosting deploy load-balancing",
  },
  {
    slug: "docker-compose",
    name: "Docker Compose",
    categories: ["infra"],
    featured: false,
    description: "Multi-container orchestration for local and prod.",
    keywords: "containers devops deploy self-hosting hosting",
  },
  {
    slug: "github-actions",
    name: "GitHub Actions",
    categories: ["infra"],
    featured: false,
    description: "CI/CD pipelines and automation.",
  },
  {
    slug: "terraform",
    name: "Terraform",
    categories: ["infra"],
    featured: false,
    description: "Infrastructure as code for cloud provisioning.",
  },
  {
    slug: "pulumi",
    name: "Pulumi",
    categories: ["infra"],
    featured: false,
    description: "Infrastructure as code with real programming languages.",
  },
  {
    slug: "alchemy",
    name: "Alchemy",
    categories: ["infra"],
    featured: false,
    description: "TypeScript-native infrastructure as code.",
  },
  {
    slug: "k3s",
    name: "K3s",
    categories: ["infra"],
    featured: false,
    description: "Lightweight Kubernetes for edge and IoT.",
    keywords: "containers devops self-hosting hosting",
  },
  {
    slug: "self-hosted",
    name: "Self-hosted",
    categories: ["infra"],
    featured: false,
    description: "Bare metal and VPS server management.",
    keywords: "self-hosting hosting servers vps dedicated deploy devops",
  },

  // ── Platforms / Cloud (featured) ──
  {
    slug: "cloudflare",
    name: "Cloudflare",
    categories: ["platform"],
    featured: true,
    description: "Workers, KV, Vectorize, R2, D1 — edge everything.",
    keywords: "cloud compute serverless edge hosting deploy cdn",
  },
  {
    slug: "aws",
    name: "AWS",
    categories: ["platform"],
    featured: true,
    description: "EC2, S3, Lambda, RDS, and more.",
    keywords: "amazon cloud compute serverless hosting deploy infrastructure",
  },
  // ── Platforms (non-featured) ──
  {
    slug: "gcp",
    name: "Google Cloud",
    categories: ["platform"],
    featured: false,
    description: "Compute Engine, Cloud Functions, BigQuery.",
    keywords: "cloud compute serverless hosting deploy infrastructure",
  },
  {
    slug: "azure",
    name: "Azure",
    categories: ["platform"],
    featured: false,
    description: "Azure Functions, Static Web Apps, DevOps.",
    keywords: "microsoft cloud compute serverless hosting deploy infrastructure",
  },
  {
    slug: "fly-io",
    name: "Fly.io",
    categories: ["platform"],
    featured: false,
    description: "Edge-deployed containers with global distribution.",
    keywords: "cloud hosting deploy containers",
  },
  {
    slug: "railway",
    name: "Railway",
    categories: ["platform"],
    featured: false,
    description: "Deploy anything with zero config.",
    keywords: "cloud hosting deploy paas",
  },
  {
    slug: "vercel",
    name: "Vercel",
    categories: ["platform"],
    featured: false,
    description: "Frontend deployments and serverless functions.",
    keywords: "cloud hosting deploy serverless",
  },
  {
    slug: "nodejs",
    name: "Node.js",
    categories: ["platform"],
    featured: false,
    description: "Server-side JavaScript runtime.",
  },

  // ── Databases (featured) ──
  {
    slug: "postgresql",
    name: "PostgreSQL",
    categories: ["database"],
    featured: true,
    description: "Relational database for structured data.",
  },
  {
    slug: "redis",
    name: "Redis",
    categories: ["database"],
    featured: false,
    description: "In-memory data store, caching, pub/sub.",
  },
  {
    slug: "valkey",
    name: "Valkey",
    categories: ["database"],
    featured: false,
    description: "Redis fork — open-source in-memory data store.",
  },
  {
    slug: "mysql",
    name: "MySQL",
    categories: ["database"],
    featured: false,
    description: "Relational database, widely used in web apps.",
  },
  // ── Databases (non-featured) ──
  {
    slug: "mongodb",
    name: "MongoDB",
    categories: ["database"],
    featured: false,
    description: "Document database for flexible schemas.",
  },
  {
    slug: "planetscale",
    name: "PlanetScale",
    categories: ["database"],
    featured: false,
    description: "Serverless MySQL with branching.",
  },
  {
    slug: "sqlite",
    name: "SQLite",
    categories: ["database"],
    featured: false,
    description: "Embedded relational database.",
  },
  {
    slug: "cloudflare-d1",
    name: "Cloudflare D1",
    categories: ["database"],
    featured: false,
    description: "Edge SQL database on Cloudflare.",
  },
  {
    slug: "cloudflare-kv",
    name: "Cloudflare KV",
    categories: ["database"],
    featured: false,
    description: "Global key-value store at the edge.",
  },

  // ── ML / Data Science ──
  {
    slug: "pytorch",
    name: "PyTorch",
    categories: ["ml"],
    featured: true,
    description: "Deep learning framework for research and production.",
  },
  {
    slug: "xgboost",
    name: "XGBoost",
    categories: ["ml"],
    featured: false,
    description: "Gradient boosting for tabular data.",
  },
  {
    slug: "pandas",
    name: "pandas",
    categories: ["ml"],
    featured: false,
    description: "Data manipulation and analysis.",
  },
  {
    slug: "numpy",
    name: "NumPy",
    categories: ["ml"],
    featured: false,
    description: "Numerical computing and array operations.",
  },
  {
    slug: "workers-ai",
    name: "Workers AI",
    categories: ["ml"],
    featured: false,
    description: "Cloudflare's inference API — embeddings, LLMs.",
    keywords: "ai artificial intelligence llm compute cloudflare",
  },
  {
    slug: "openai",
    name: "OpenAI API",
    categories: ["ml"],
    featured: false,
    description: "GPT, embeddings, and AI integrations.",
    keywords: "ai artificial intelligence llm compute",
  },
  {
    slug: "claude-api",
    name: "Claude API",
    categories: ["ml"],
    featured: false,
    description: "Anthropic's API for Claude models.",
    keywords: "ai artificial intelligence llm compute anthropic",
  },
  {
    slug: "openrouter",
    name: "OpenRouter",
    categories: ["ml"],
    featured: false,
    description: "Unified API gateway for LLM providers.",
    keywords: "ai artificial intelligence llm compute",
  },

  // ── Mobile / App Tools ──
  {
    slug: "revenuecat",
    name: "RevenueCat",
    categories: ["mobile"],
    featured: false,
    description: "In-app purchases and subscription management.",
  },
  {
    slug: "superwall",
    name: "Superwall",
    categories: ["mobile"],
    featured: false,
    description: "Paywall A/B testing and optimization.",
  },
  {
    slug: "apps-connect",
    name: "App Store Connect",
    categories: ["mobile"],
    featured: false,
    description: "iOS app distribution and TestFlight.",
  },

  // ── Auth ──
  {
    slug: "better-auth",
    name: "Better Auth",
    categories: ["tool"],
    featured: false,
    description: "Modern auth library for TypeScript apps.",
  },
  {
    slug: "clerk",
    name: "Clerk",
    categories: ["tool"],
    featured: false,
    description: "Drop-in authentication and user management.",
  },
  {
    slug: "authjs",
    name: "Auth.js",
    categories: ["tool"],
    featured: false,
    description: "Authentication for Next.js and web frameworks.",
  },
  {
    slug: "oauth",
    name: "OAuth",
    categories: ["tool"],
    featured: false,
    description: "Open standard for token-based authorization.",
  },
  {
    slug: "jwt",
    name: "JWT",
    categories: ["tool"],
    featured: false,
    description: "JSON Web Tokens for stateless auth.",
  },

  // ── Analytics / Observability ──
  {
    slug: "posthog",
    name: "PostHog",
    categories: ["tool"],
    featured: false,
    description: "Product analytics, feature flags, session replay.",
  },
  {
    slug: "mixpanel",
    name: "Mixpanel",
    categories: ["tool"],
    featured: false,
    description: "Event-based product analytics.",
  },
  {
    slug: "plausible",
    name: "Plausible",
    categories: ["tool"],
    featured: false,
    description: "Privacy-first web analytics.",
  },
  {
    slug: "sentry",
    name: "Sentry",
    categories: ["tool"],
    featured: false,
    description: "Error tracking and performance monitoring.",
  },

  // ── Payments ──
  {
    slug: "stripe",
    name: "Stripe",
    categories: ["tool"],
    featured: false,
    description: "Payment processing and subscription billing.",
  },

  // ── Testing ──
  {
    slug: "vitest",
    name: "Vitest",
    categories: ["tool"],
    featured: false,
    description: "Fast unit testing for Vite projects.",
  },
  {
    slug: "playwright",
    name: "Playwright",
    categories: ["tool"],
    featured: false,
    description: "End-to-end browser testing and automation.",
  },

  // ── Design ──
  {
    slug: "figma",
    name: "Figma",
    categories: ["tool"],
    featured: false,
    description: "Collaborative design and prototyping.",
  },

  // ── Dev Tools (featured) ──
  {
    slug: "bun",
    name: "Bun",
    categories: ["tool"],
    featured: true,
    description: "Fast JS runtime — package manager, bundler, test runner.",
  },
  {
    slug: "git",
    name: "Git",
    categories: ["tool"],
    featured: false,
    description: "Version control, branching, collaboration.",
  },
  {
    slug: "turborepo",
    name: "Turborepo",
    categories: ["tool"],
    featured: false,
    description: "Monorepo build orchestration.",
  },
  // ── Build tools / Linters ──
  {
    slug: "vite",
    name: "Vite",
    categories: ["tool"],
    featured: false,
    description: "Fast frontend build tool with HMR.",
  },
  {
    slug: "biome",
    name: "Biome",
    categories: ["tool"],
    featured: false,
    description: "Fast formatter and linter for JS/TS.",
  },
  {
    slug: "eslint",
    name: "ESLint",
    categories: ["tool"],
    featured: false,
    description: "Pluggable JavaScript linting.",
  },
  {
    slug: "prettier",
    name: "Prettier",
    categories: ["tool"],
    featured: false,
    description: "Opinionated code formatter.",
  },
  {
    slug: "oxlint",
    name: "Oxlint",
    categories: ["tool"],
    featured: false,
    description: "Oxidation-compiler based JS linter.",
  },
  {
    slug: "esbuild",
    name: "esbuild",
    categories: ["tool"],
    featured: false,
    description: "Extremely fast JS/TS bundler.",
  },
  {
    slug: "rolldown",
    name: "Rolldown",
    categories: ["tool"],
    featured: false,
    description: "Rust-based JS bundler, Vite's next backend.",
  },
  // ── Operating Systems ──
  {
    slug: "macos",
    name: "macOS",
    categories: ["platform"],
    featured: false,
    description: "Primary development machine.",
  },
  {
    slug: "linux",
    name: "Linux",
    categories: ["platform"],
    featured: false,
    description: "Server OS — Ubuntu, Debian, Arch, Fedora.",
  },
  // ── AI Tools ──
  {
    slug: "claude-code",
    name: "Claude Code",
    categories: ["tool"],
    featured: false,
    description: "AI-powered coding assistant and CLI.",
    keywords: "ai artificial intelligence llm compute anthropic claude copilot",
  },
  {
    slug: "codex",
    name: "Codex",
    categories: ["tool"],
    featured: false,
    description: "OpenAI code generation model.",
    keywords: "ai artificial intelligence llm compute copilot",
  },
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
