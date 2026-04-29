import Parser from "rss-parser";
import * as fs from "fs";
import * as crypto from "crypto";
import { SummarizedArticle } from "./summarizer";

// --- Types -------------------------------------------------------------------

export interface RawArticle {
  title: string;
  link: string;
  pubDate: string;
  summary: string;
  source: string;
  domain: SummarizedArticle["domain"];
}

// --- Sources RSS --------------------------------------------------------------
// On garde uniquement les deux domaines pertinents pour LinkedIn :
// - IA : labs officiels + presse specialisee
// - Cybersecurite : sources narratives (pas les advisories techniques bruts)

const RSS_SOURCES: Array<{ name: string; url: string; domain: RawArticle["domain"] }> = [

  // ── IA : Labs officiels ────────────────────────────────────────────────────
  // Flux communautaires (Anthropic, Meta, Mistral n'ont pas de RSS officiel)
  { domain: "IA", name: "Anthropic News",     url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml" },
  { domain: "IA", name: "Anthropic Research", url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_research.xml" },
  { domain: "IA", name: "Meta AI Blog",       url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_meta_ai.xml" },
  { domain: "IA", name: "Mistral AI",         url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_mistral.xml" },
  { domain: "IA", name: "Cursor Blog",        url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_cursor.xml" },
  { domain: "IA", name: "Groq Blog",          url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_groq.xml" },
  // Flux RSS officiels
  { domain: "IA", name: "OpenAI Blog",        url: "https://openai.com/news/rss.xml" },
  { domain: "IA", name: "Google DeepMind",    url: "https://deepmind.google/blog/rss.xml" },
  { domain: "IA", name: "Google AI Blog",     url: "https://blog.google/technology/ai/rss/" },
  { domain: "IA", name: "Hugging Face",       url: "https://huggingface.co/blog/feed.xml" },

  // ── IA : Presse specialisee ────────────────────────────────────────────────
  { domain: "IA", name: "VentureBeat AI",     url: "https://venturebeat.com/category/ai/feed/" },
  { domain: "IA", name: "The Verge AI",       url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
  { domain: "IA", name: "MIT Tech Review AI", url: "https://www.technologyreview.com/feed/" },
  { domain: "IA", name: "TechCrunch AI",      url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { domain: "IA", name: "The Decoder",        url: "https://the-decoder.com/feed/" },
  { domain: "IA", name: "Ars Technica AI",    url: "https://feeds.arstechnica.com/arstechnica/technology-lab" },

  // ── Cybersecurite : sources narratives uniquement ──────────────────────────
  // On evite les flux d'advisories bruts (CISA, NVD) qui listent des CVE
  // sans contexte — pas engageants sur LinkedIn. On garde les sources qui
  // racontent une histoire : incident reel, technique d'attaque, analyse.
  { domain: "Cybersecurite", name: "Krebs on Security",  url: "https://krebsonsecurity.com/feed/" },
  { domain: "Cybersecurite", name: "Schneier on Security",url: "https://www.schneier.com/feed/atom/" },
  { domain: "Cybersecurite", name: "The Hacker News",    url: "https://feeds.feedburner.com/TheHackersNews" },
  { domain: "Cybersecurite", name: "Recorded Future",    url: "https://www.recordedfuture.com/feed" },
  { domain: "Cybersecurite", name: "Snyk Security",      url: "https://snyk.io/blog/feed/" },
  { domain: "Cybersecurite", name: "Dark Reading",       url: "https://www.darkreading.com/rss.xml" },
  { domain: "Cybersecurite", name: "Wired Security",     url: "https://www.wired.com/feed/category/security/latest/rss" },
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
    "copilot", "cursor", "chatgpt", "o1", "o3", "claude code", "groq",
    "benchmark", "reasoning", "inference", "training", "gpu", "tpu",
  ],
  "Cybersecurite": [
    // Incidents et attaques (angle narratif = LinkedIn-friendly)
    "hack", "breach", "data leak", "ransomware", "attack", "malware", "phishing",
    "exploit", "zero-day", "vulnerability", "cve", "backdoor", "botnet",
    "supply chain", "social engineering", "identity theft", "fraud",
    // IA et cybersecurite (intersection tres engageante)
    "ai security", "llm security", "prompt injection", "jailbreak", "adversarial",
    "deepfake", "synthetic media", "ai threat", "ai attack", "model poisoning",
    // Tendances et analyses
    "cybersecurity", "threat intelligence", "incident response", "nation state",
    "apt", "espionage", "surveillance", "privacy", "data protection",
    "encryption", "authentication", "mfa", "password", "credential",
  ],
};

// --- Filtre narratif cybersecurite -------------------------------------------
// On exclut les articles purement techniques ou generiques qui ne raconteraient
// pas une histoire engageante sur LinkedIn (patch notes, advisories, etc.)

const CYBER_BORING_PATTERNS = [
  /^(patch|advisory|update|release|cve-\d{4})/i,
  /multiple vulnerabilities/i,
  /security update for/i,
  /^(aa\d{2}|ta\d{2})/i,   // format des advisories CISA
];

function isCyberEngaging(title: string): boolean {
  return !CYBER_BORING_PATTERNS.some((pattern) => pattern.test(title.trim()));
}

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
  const text = `${title} ${summary}`.toLowerCase();

  // Pour les sources dediees : on verifie juste que le contenu correspond
  // au domaine attendu (evite les articles hors-sujet sur des blogs generiques)
  const keywords = KEYWORDS[source.domain];
  const isRelevant = keywords.some((kw) => text.includes(kw)) || summary.length < 50;

  if (!isRelevant) return null;

  // Filtre narratif supplementaire pour la cybersecurite
  if (source.domain === "Cybersecurite" && !isCyberEngaging(title)) return null;

  return source.domain;
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
      console.log(`[FETCH] ${source.domain.padEnd(14)} ${source.name}...`);
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
