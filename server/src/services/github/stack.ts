import type { DetectedTech } from "../../../../shared/contract.js";

type Category = DetectedTech["category"];

/** npm package → human name + category. Only well-known packages are mapped. */
const NPM_TECH: Record<string, [string, Category]> = {
  react: ["React", "framework"],
  next: ["Next.js", "framework"],
  vue: ["Vue", "framework"],
  nuxt: ["Nuxt", "framework"],
  svelte: ["Svelte", "framework"],
  "@sveltejs/kit": ["SvelteKit", "framework"],
  "@angular/core": ["Angular", "framework"],
  "solid-js": ["SolidJS", "framework"],
  astro: ["Astro", "framework"],
  "@remix-run/react": ["Remix", "framework"],
  "react-native": ["React Native", "framework"],
  expo: ["Expo", "framework"],
  electron: ["Electron", "framework"],
  express: ["Express", "framework"],
  fastify: ["Fastify", "framework"],
  koa: ["Koa", "framework"],
  hono: ["Hono", "framework"],
  "@nestjs/core": ["NestJS", "framework"],
  "@hapi/hapi": ["hapi", "framework"],
  "socket.io": ["Socket.IO", "library"],
  graphql: ["GraphQL", "library"],
  "@apollo/server": ["Apollo Server", "library"],
  "@trpc/server": ["tRPC", "library"],
  prisma: ["Prisma", "database"],
  "@prisma/client": ["Prisma", "database"],
  mongoose: ["Mongoose (MongoDB)", "database"],
  mongodb: ["MongoDB driver", "database"],
  pg: ["node-postgres", "database"],
  mysql2: ["MySQL", "database"],
  sequelize: ["Sequelize", "database"],
  typeorm: ["TypeORM", "database"],
  "drizzle-orm": ["Drizzle ORM", "database"],
  knex: ["Knex", "database"],
  redis: ["Redis client", "database"],
  ioredis: ["ioredis", "database"],
  "@supabase/supabase-js": ["Supabase", "database"],
  firebase: ["Firebase", "library"],
  "firebase-admin": ["Firebase Admin", "library"],
  tailwindcss: ["Tailwind CSS", "tooling"],
  vite: ["Vite", "tooling"],
  webpack: ["webpack", "tooling"],
  typescript: ["TypeScript", "language"],
  zod: ["Zod", "library"],
  axios: ["Axios", "library"],
  redux: ["Redux", "library"],
  "@reduxjs/toolkit": ["Redux Toolkit", "library"],
  zustand: ["Zustand", "library"],
  "@tanstack/react-query": ["TanStack Query", "library"],
  "react-router": ["React Router", "library"],
  "react-router-dom": ["React Router", "library"],
  "next-auth": ["NextAuth.js", "library"],
  passport: ["Passport", "library"],
  jsonwebtoken: ["jsonwebtoken (JWT)", "library"],
  stripe: ["Stripe SDK", "library"],
  razorpay: ["Razorpay SDK", "library"],
  openai: ["OpenAI SDK", "library"],
  "@google/genai": ["Google Gen AI SDK", "library"],
  jest: ["Jest", "testing"],
  vitest: ["Vitest", "testing"],
  mocha: ["Mocha", "testing"],
  "@playwright/test": ["Playwright", "testing"],
  cypress: ["Cypress", "testing"],
  supertest: ["Supertest", "testing"],
};

const PY_TECH: Record<string, [string, Category]> = {
  django: ["Django", "framework"],
  flask: ["Flask", "framework"],
  fastapi: ["FastAPI", "framework"],
  starlette: ["Starlette", "framework"],
  sqlalchemy: ["SQLAlchemy", "database"],
  pydantic: ["Pydantic", "library"],
  celery: ["Celery", "library"],
  pytest: ["pytest", "testing"],
  requests: ["Requests", "library"],
  httpx: ["HTTPX", "library"],
  numpy: ["NumPy", "library"],
  pandas: ["pandas", "library"],
  torch: ["PyTorch", "library"],
  tensorflow: ["TensorFlow", "library"],
  streamlit: ["Streamlit", "framework"],
  stripe: ["Stripe SDK", "library"],
  razorpay: ["Razorpay SDK", "library"],
};

const GO_TECH: Record<string, [string, Category]> = {
  "github.com/gin-gonic/gin": ["Gin", "framework"],
  "github.com/labstack/echo": ["Echo", "framework"],
  "github.com/gofiber/fiber": ["Fiber", "framework"],
  "github.com/go-chi/chi": ["chi", "framework"],
  "gorm.io/gorm": ["GORM", "database"],
};

const RUST_TECH: Record<string, [string, Category]> = {
  "actix-web": ["Actix Web", "framework"],
  axum: ["Axum", "framework"],
  rocket: ["Rocket", "framework"],
  tokio: ["Tokio", "runtime"],
  serde: ["Serde", "library"],
  diesel: ["Diesel", "database"],
  sqlx: ["SQLx", "database"],
};

export interface StackDetection {
  ecosystems: string[];
  technologies: DetectedTech[];
  dependencies: string[];
}

function push(out: Map<string, DetectedTech>, tech: DetectedTech) {
  if (!out.has(tech.name)) out.set(tech.name, tech);
}

/** Detects the stack from manifest file contents. Every result carries its evidence file. */
export function detectStack(files: ReadonlyArray<{ path: string; content: string }>): StackDetection {
  const techs = new Map<string, DetectedTech>();
  const ecosystems = new Set<string>();
  const deps = new Set<string>();

  for (const file of files) {
    const base = (file.path.split("/").pop() ?? "").toLowerCase();

    if (base === "package.json") {
      ecosystems.add("Node.js");
      try {
        const pkg = JSON.parse(file.content) as Record<string, unknown>;
        const all = {
          ...((pkg.dependencies as Record<string, string>) ?? {}),
          ...((pkg.devDependencies as Record<string, string>) ?? {}),
          ...((pkg.peerDependencies as Record<string, string>) ?? {}),
        };
        for (const [name, version] of Object.entries(all)) {
          deps.add(name);
          const mapped = NPM_TECH[name];
          if (mapped) push(techs, { name: mapped[0], category: mapped[1], evidence: file.path, version: String(version) });
        }
        if (typeof pkg.type === "string" && pkg.type === "module") {
          push(techs, { name: "ES Modules", category: "runtime", evidence: file.path });
        }
      } catch {
        /* malformed package.json — leave it for the model to read raw */
      }
    } else if (base === "tsconfig.json") {
      push(techs, { name: "TypeScript", category: "language", evidence: file.path });
    } else if (base === "requirements.txt" || base === "pyproject.toml" || base === "pipfile" || base === "setup.py") {
      ecosystems.add("Python");
      const lower = file.content.toLowerCase();
      for (const [pkg, [name, category]] of Object.entries(PY_TECH)) {
        const re = new RegExp(`(^|[\\s"'\\[,])${pkg.replace(/[-]/g, "[-_]")}(\\s*[=<>~!\\[;"',]|\\s*$)`, "m");
        if (re.test(lower)) {
          push(techs, { name, category, evidence: file.path });
          deps.add(pkg);
        }
      }
    } else if (base === "pom.xml" || base === "build.gradle" || base === "build.gradle.kts") {
      ecosystems.add("JVM");
      if (/spring-boot/i.test(file.content)) push(techs, { name: "Spring Boot", category: "framework", evidence: file.path });
      if (/quarkus/i.test(file.content)) push(techs, { name: "Quarkus", category: "framework", evidence: file.path });
      if (/kotlin/i.test(file.content)) push(techs, { name: "Kotlin", category: "language", evidence: file.path });
      if (/junit/i.test(file.content)) push(techs, { name: "JUnit", category: "testing", evidence: file.path });
    } else if (base === "go.mod") {
      ecosystems.add("Go");
      for (const [mod, [name, category]] of Object.entries(GO_TECH)) {
        if (file.content.includes(mod)) push(techs, { name, category, evidence: file.path });
      }
    } else if (base === "cargo.toml") {
      ecosystems.add("Rust");
      for (const [crate, [name, category]] of Object.entries(RUST_TECH)) {
        if (new RegExp(`^\\s*${crate}\\s*=`, "m").test(file.content)) push(techs, { name, category, evidence: file.path });
      }
    } else if (base === "gemfile") {
      ecosystems.add("Ruby");
      if (/['"]rails['"]/.test(file.content)) push(techs, { name: "Ruby on Rails", category: "framework", evidence: file.path });
    } else if (base === "composer.json") {
      ecosystems.add("PHP");
      if (/laravel\/framework/.test(file.content)) push(techs, { name: "Laravel", category: "framework", evidence: file.path });
      if (/symfony\//.test(file.content)) push(techs, { name: "Symfony", category: "framework", evidence: file.path });
    } else if (base === "pubspec.yaml") {
      ecosystems.add("Dart");
      if (/flutter:/.test(file.content)) push(techs, { name: "Flutter", category: "framework", evidence: file.path });
    }
  }

  const order: Category[] = ["framework", "language", "runtime", "database", "library", "tooling", "testing"];
  const technologies = [...techs.values()].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
  return { ecosystems: [...ecosystems], technologies, dependencies: [...deps].slice(0, 80) };
}
