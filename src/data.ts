export interface Project {
  slug: string;
  title: string;
  description: string;
  technologies: string[];
  url?: string;
  github?: string;
  featured: boolean;
}

export interface Technology {
  slug: string;
  name: string;
  category: "language" | "framework" | "platform" | "database" | "tool";
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

export const TECHNOLOGIES: Technology[] = [
  // Featured
  {
    slug: "typescript",
    name: "TypeScript",
    category: "language",
    featured: true,
    description: "Primary language for everything — frontend, backend, tooling.",
  },
  {
    slug: "react",
    name: "React",
    category: "framework",
    featured: true,
    description: "UI library for web interfaces and component architecture.",
  },
  {
    slug: "react-native",
    name: "React Native",
    category: "framework",
    featured: true,
    description: "Cross-platform mobile development for iOS and Android.",
  },
  {
    slug: "expo",
    name: "Expo",
    category: "framework",
    featured: true,
    description: "React Native toolchain — builds, OTA updates, native modules.",
  },
  {
    slug: "nextjs",
    name: "Next.js",
    category: "framework",
    featured: true,
    description: "Full-stack React framework for web apps and APIs.",
  },
  {
    slug: "cloudflare",
    name: "Cloudflare",
    category: "platform",
    featured: true,
    description: "Edge compute, Workers, KV, Vectorize, R2 — the deployment target.",
  },
  {
    slug: "docker",
    name: "Docker",
    category: "tool",
    featured: true,
    description: "Containerized deployments and reproducible environments.",
  },
  {
    slug: "python",
    name: "Python",
    category: "language",
    featured: true,
    description: "ML pipelines, data processing, and scripting.",
  },
  {
    slug: "hono",
    name: "Hono",
    category: "framework",
    featured: true,
    description: "Ultralight web framework for Cloudflare Workers and Bun.",
  },
  {
    slug: "bun",
    name: "Bun",
    category: "tool",
    featured: true,
    description: "Fast JS runtime — package manager, bundler, test runner.",
  },
  // Non-featured
  {
    slug: "javascript",
    name: "JavaScript",
    category: "language",
    featured: false,
    description: "The foundation under TypeScript.",
  },
  {
    slug: "java",
    name: "Java",
    category: "language",
    featured: false,
    description: "Enterprise and Android development.",
  },
  {
    slug: "html",
    name: "HTML",
    category: "language",
    featured: false,
    description: "Semantic markup and document structure.",
  },
  {
    slug: "css",
    name: "CSS",
    category: "language",
    featured: false,
    description: "Styling, layout, animations.",
  },
  {
    slug: "nodejs",
    name: "Node.js",
    category: "platform",
    featured: false,
    description: "Server-side JavaScript runtime.",
  },
  {
    slug: "postgresql",
    name: "PostgreSQL",
    category: "database",
    featured: true,
    description: "Relational database for structured data.",
  },
  {
    slug: "mongodb",
    name: "MongoDB",
    category: "database",
    featured: false,
    description: "Document database for flexible schemas.",
  },
  {
    slug: "planetscale",
    name: "PlanetScale",
    category: "database",
    featured: false,
    description: "Serverless MySQL with branching.",
  },
];
