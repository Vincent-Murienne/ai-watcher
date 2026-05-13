import { ArticleGroup } from "./deduplicator.js";

// --- Generation d images via Pollinations.ai (100% gratuit, sans API key) ---
// Utilise le modele FLUX (qualite comparable a Stable Diffusion XL).
// Aucune configuration requise. Delai : 10-30s par image selon la charge.

const POLLINATIONS_BASE = "https://image.pollinations.ai/prompt";

function buildImagePrompt(group: ArticleGroup): string {
  const titleSlug = group.title.slice(0, 100);

  if (group.domain === "Cybersecurite") {
    return `Professional digital illustration for a cybersecurity LinkedIn article: "${titleSlug}". Dark background, blue and red neon accents, abstract shield, padlock, network nodes. Clean flat corporate design, no text, no faces, no logos, photorealistic lighting.`;
  }

  const isClaudeCode = group.sources.some((s) =>
    s.name.toLowerCase().includes("anthropic")
  ) || group.title.toLowerCase().includes("claude");

  if (isClaudeCode) {
    return `Professional digital illustration for an AI developer tools LinkedIn article: "${titleSlug}". Purple and orange gradient, glowing code terminal, abstract neural pathways, circuit patterns. Clean minimalist corporate style, no text, no faces, no logos, photorealistic.`;
  }

  return `Professional digital illustration for an artificial intelligence LinkedIn article: "${titleSlug}". Blue and violet gradient, glowing neural network, abstract data streams, futuristic technology. Clean minimalist corporate flat design, no text, no faces, no logos, photorealistic.`;
}

// Seed deterministe base sur le titre pour des resultats coherents
function titleSeed(title: string): number {
  let h = 0;
  for (let i = 0; i < title.length; i++) {
    h = (Math.imul(31, h) + title.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 999_999;
}

async function fetchPollinationsImage(group: ArticleGroup): Promise<string | null> {
  const prompt  = buildImagePrompt(group);
  const seed    = titleSeed(group.title);
  const params  = new URLSearchParams({
    width:   "1024",
    height:  "1024",
    model:   "flux",
    nologo:  "true",
    seed:    String(seed),
  });

  const url = `${POLLINATIONS_BASE}/${encodeURIComponent(prompt)}?${params}`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      console.warn(`[IMAGE] Pollinations erreur HTTP ${response.status}`);
      return null;
    }

    const buffer = await response.arrayBuffer();
    const b64    = Buffer.from(buffer).toString("base64");
    return `data:image/png;base64,${b64}`;
  } catch (err) {
    console.warn(`[IMAGE] Pollinations indisponible : ${(err as Error).message}`);
    return null;
  }
}

// --- Generation sequentielle pour tous les groupes --------------------------

export async function generateImagesForGroups(
  groups: ArticleGroup[]
): Promise<void> {
  console.log(`[IMAGE] Generation Pollinations.ai pour ${groups.length} article(s)...`);

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    console.log(`[IMAGE] ${i + 1}/${groups.length} : ${group.title.slice(0, 55)}...`);

    group.imageUrl = await fetchPollinationsImage(group) ?? undefined;

    if (group.imageUrl) {
      console.log(`[IMAGE] OK`);
    } else {
      console.log(`[IMAGE] Echec - article publie sans image.`);
    }

    // Pause pour ne pas saturer le service gratuit
    if (i < groups.length - 1) {
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }
}
