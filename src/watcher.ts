import Parser from "rss-parser";
import * as fs from "fs";
import * as crypto from "crypto";

// --- Types -------------------------------------------------------------------

export interface RawArticle {
  title: string;
  link: string;
  pubDate: string;
  summary: string;
  source: string;
  domain: "IA" | "Web Dev" | "DevOps" | "DevSecOps";
}

// --- Sources RSS --------------------------------------------------------------
// Toutes les URLs ont ete verifiees. Certains labs IA (Anthropic, Mistral, Meta)
// ne publient pas de flux RSS officiel : on utilise des aggregateurs tiers
// maintenus par la communaute (github.com/Olshansk/rss-feeds, mise a jour horaire).

const RSS_SOURCES: Array<{ name: string; url: string; domain: RawArticle["domain"] }> = [

  // ── IA : Labs officiels ────────────────────────────────────────────────────
  // Flux communautaires scraped toutes les heures (pas de flux RSS officiel)
  { domain: "IA", name: "Anthropic News",     url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml" },
  { domain: "IA", name: "Anthropic Research", url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_research.xml" },
  { domain: "IA", name: "Meta AI Blog",        url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_meta_ai.xml" },
  { domain: "IA", name: "Mistral AI News",     url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_mistral.xml" },
  { domain: "IA", name: "Cursor Blog",         url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_cursor.xml" },
  // Flux RSS officiels directs
  { domain: "IA", name: "OpenAI Blog",         url: "https://openai.com/news/rss.xml" },
  { domain: "IA", name: "Google DeepMind",     url: "https://deepmind.google/blog/rss.xml" },
  { domain: "IA", name: "Google AI Blog",      url: "https://blog.google/technology/ai/rss/" },
  { domain: "IA", name: "Hugging Face",        url: "https://huggingface.co/blog/feed.xml" },
  { domain: "IA", name: "Groq Blog",           url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_groq.xml" },

  // ── IA : Presse specialisee ────────────────────────────────────────────────
  { domain: "IA", name: "VentureBeat AI",      url: "https://venturebeat.com/category/ai/feed/" },
  { domain: "IA", name: "The Verge AI",        url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
  { domain: "IA", name: "Ars Technica AI",     url: "https://feeds.arstechnica.com/arstechnica/technology-lab" },
  { domain: "IA", name: "MIT Tech Review AI",  url: "https://www.technologyreview.com/feed/" },
  { domain: "IA", name: "TechCrunch AI",       url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { domain: "IA", name: "The Decoder",         url: "https://the-decoder.com/feed/" },

  // ── Web Dev ────────────────────────────────────────────────────────────────
  { domain: "Web Dev", name: "CSS Tricks",         url: "https://css-tricks.com/feed/" },
  { domain: "Web Dev", name: "Smashing Magazine",  url: "https://www.smashingmagazine.com/feed/" },
  { domain: "Web Dev", name: "web.dev (Google)",   url: "https://web.dev/feed.xml" },
  { domain: "Web Dev", name: "React Blog",         url: "https://react.dev/rss.xml" },
  { domain: "Web Dev", name: "TypeScript Blog",    url: "https://devblogs.microsoft.com/typescript/feed/" },
  { domain: "Web Dev", name: "Node.js Blog",       url: "https://nodejs.org/en/feed/blog.xml" },
  { domain: "Web Dev", name: "Hacker News (Top)",  url: "https://hnrss.org/frontpage" },

  // ── DevOps ─────────────────────────────────────────────────────────────────
  { domain: "DevOps", name: "Kubernetes Blog",     url: "https://kubernetes.io/feed.xml" },
  { domain: "DevOps", name: "Docker Blog",         url: "https://www.docker.com/blog/feed/" },
  { domain: "DevOps", name: "GitHub Blog",         url: "https://github.blog/feed/" },
  { domain: "DevOps", name: "AWS DevOps Blog",     url: "https://aws.amazon.com/blogs/devops/feed/" },
  { domain: "DevOps", name: "Martin Fowler",       url: "https://martinfowler.com/feed.atom" },
  { domain: "DevOps", name: "The New Stack",       url: "https://thenewstack.io/feed/" },

  // ── DevSecOps / Securite ───────────────────────────────────────────────────
  { domain: "DevSecOps", name: "Schneier on Security", url: "https://www.schneier.com/feed/atom/" },
  { domain: "DevSecOps", name: "CISA Advisories",      url: "https://www.cisa.gov/cybersecurity-advisories/feed" },
  { domain: "DevSecOps", name: "Krebs on Security",    url: "https://krebsonsecurity.com/feed/" },
  { domain: "DevSecOps", name: "Recorded Future",      url: "https://www.recordedfuture.com/feed" },
  { domain: "DevSecOps", name: "The Hacker News",      url: "https://feeds.feedburner.com/TheHackersNews" },
  { domain: "DevSecOps", name: "Snyk Security",        url: "https://snyk.io/blog/feed/" },
];

// --- Mots-cles par domaine ---------------------------------------------------

const KEYWORDS: Record<RawArticle["domain"], string[]> = {
  "IA": [
    "llm", "large language model", "gpt", "claude", "gemini", "llama", "mistral",
    "transformer", "diffusion model", "neural network", "foundation model",
    "fine-tuning", "rag", "retrieval augmented", "prompt engineering", "chain of thought",
    "quantization", "distillation", "reinforcement learning", "rlhf", "dpo",
    "mixture of experts", "moe", "attention mechanism", "multimodal",
    "artificial intelligence", "machine learning", "deep learning", "generative ai",
    "computer vision", "natural language processing", "nlp", "ai agent", "agentic",
    "openai", "anthropic", "deepmind", "hugging face", "stability ai", "midjourney",
    "copilot", "cursor", "chatgpt", "o1", "o3", "claude code",
    "benchmark", "reasoning", "inference", "training", "gpu", "tpu",
  ],
  "Web Dev": [
    "react", "typescript", "javascript", "angular", "vue", "next.js", "nuxt",
    "css", "html", "web component", "browser api", "web assembly", "wasm",
    "node.js", "bun", "deno", "rest api", "graphql", "websocket",
    "performance", "accessibility", "a11y", "seo", "core web vitals",
    "frontend", "backend", "fullstack", "framework", "library", "bundler",
    "vite", "webpack", "turbopack", "tailwind", "shadcn",
  ],
  "DevOps": [
    "kubernetes", "docker", "container", "ci/cd", "pipeline", "github actions",
    "terraform", "ansible", "helm", "gitops", "argocd", "flux",
    "microservices", "service mesh", "istio", "prometheus", "grafana",
    "cloud native", "aws", "azure", "gcp", "infrastructure as code",
    "deployment", "scalability", "observability", "monitoring", "logging",
    "platform engineering", "devex", "developer experience",
  ],
  "DevSecOps": [
    "vulnerability", "cve", "security advisory", "patch", "exploit", "zero-day",
    "owasp", "penetration testing", "pen test", "sast", "dast", "sca",
    "supply chain attack", "dependency", "secret scanning", "sbom",
    "authentication", "authorization", "oauth", "jwt", "csrf", "xss", "sql injection",
    "encryption", "tls", "ssl", "certificate", "pki",
    "compliance", "soc2", "gdpr", "iso 27001", "nist",
    "devsecops", "shift left", "security by design", "threat modeling",
  ],
};

// --- Deduplication via fichier JSON ------------------------------------------

interface SeenStore { ids: string[]; }

function loadSeen(storePath: string): Set<string> {
  try {
    const raw = fs.readFileSync(storePath, "utf8");
    return new Set((JSON.parse(raw) as SeenStore).ids);
  } catch {
    return new Set();
  }
}

function saveSeen(storePath: string, seen: Set<string>): void {
  const ids = [...seen].slice(-5000);
  fs.writeFileSync(storePath, JSON.stringify({ ids }, null, 2), "utf8");
}

function generateId(url: string): string {
  return crypto.createHash("sha256").update(url).digest("hex").slice(0, 16);
}

// --- Verification de pertinence ----------------------------------------------

function getDomain(
  source: (typeof RSS_SOURCES)[number],
  title: string,
  summary: string
): RawArticle["domain"] | null {
  // Pour les sources dediees (hors Hacker News et Ars Technica qui sont generiques),
  // on accepte directement l'article si son domaine correspond.
  const genericSources = ["Hacker News (Top)", "Ars Technica AI", "MIT Tech Review AI"];
  if (!genericSources.includes(source.name)) {
    const text = `${title} ${summary}`.toLowerCase();
    const keywords = KEYWORDS[source.domain];
    if (keywords.some((kw) => text.includes(kw))) return source.domain;
    // Pour les sources dediees, on garde quand meme si le titre seul est pertinent
    // (certains articles n'ont pas d'extrait dans le flux RSS)
    if (summary.length < 50) return source.domain;
    return null;
  }
  // Pour les sources generiques, on cherche le bon domaine par mots-cles
  const text = `${title} ${summary}`.toLowerCase();
  for (const domain of ["IA", "Web Dev", "DevOps", "DevSecOps"] as const) {
    if (KEYWORDS[domain].some((kw) => text.includes(kw))) return domain;
  }
  return null;
}

// --- Fetch de tous les flux RSS ----------------------------------------------

export async function fetchAllFeeds(): Promise<RawArticle[]> {
  const parser = new Parser({
    timeout: 10_000,
    headers: { "User-Agent": "AI-Watcher-Bot/1.0 (personal tech watch)" },
  });

  const articles: RawArticle[] = [];
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 24);

  for (const source of RSS_SOURCES) {
    try {
      console.log(`[FETCH] ${source.domain.padEnd(10)} ${source.name}...`);
      const feed = await parser.parseURL(source.url);

      for (const item of feed.items ?? []) {
        const pubDate = item.pubDate ? new Date(item.pubDate) : null;
        if (pubDate && pubDate < cutoff) continue;

        const title   = item.title?.trim() ?? "";
        const link    = item.link?.trim() ?? "";
        const summary = (item.contentSnippet ?? item.content ?? "").trim();

        if (!title || !link) continue;

        const domain = getDomain(source, title, summary);
        if (!domain) continue;

        articles.push({ title, link, pubDate: pubDate?.toISOString() ?? "", summary, source: source.name, domain });
      }
    } catch (err) {
      console.warn(`[WARN] Impossible de lire ${source.name}: ${(err as Error).message}`);
    }
  }

  return articles;
}

// --- Deduplication et persistance --------------------------------------------

export function deduplicateAndSave(
  storePath: string,
  articles: RawArticle[]
): RawArticle[] {
  const seen = loadSeen(storePath);
  const newArticles: RawArticle[] = [];

  for (const article of articles) {
    const id = generateId(article.link);
    if (seen.has(id)) continue;
    seen.add(id);
    newArticles.push(article);
  }

  saveSeen(storePath, seen);

  const counts = newArticles.reduce((acc, a) => {
    acc[a.domain] = (acc[a.domain] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log(`[STORE] ${newArticles.length} nouveaux articles sur ${articles.length} recuperes`);
  for (const [domain, count] of Object.entries(counts)) {
    console.log(`        - ${domain}: ${count}`);
  }

  return newArticles;
}
