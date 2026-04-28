import { SummarizedArticle } from "./summarizer.js";

// --- Types -------------------------------------------------------------------

// Un groupe = plusieurs articles qui parlent du meme evenement, fusionnes en 1
export interface ArticleGroup {
  title: string;                      // titre synthetise du groupe
  summary: string;                    // resume unique fusionne
  linkedinPost: string;               // post LinkedIn qui cite toutes les sources
  category: string;
  importance: "haute" | "moyenne" | "faible";
  domain: SummarizedArticle["domain"];
  sources: Array<{                    // toutes les sources qui couvrent cet evenement
    name: string;
    link: string;
    pubDate: string;
  }>;
}

// --- Configuration Groq ------------------------------------------------------

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL   = "llama-3.3-70b-versatile";

async function callGroq(prompt: string, systemPrompt: string, maxTokens = 800): Promise<string> {
  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: maxTokens,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: prompt },
      ],
    }),
  });

  if (response.status === 429) {
    const body = await response.json() as { error?: { message?: string } };
    const match = body.error?.message?.match(/try again in ([0-9.]+)s/);
    const waitMs = match ? Math.ceil(parseFloat(match[1]) * 1000) + 1_000 : 15_000;
    console.log(`[DEDUP] Rate limit - attente ${(waitMs / 1000).toFixed(1)}s...`);
    await new Promise((r) => setTimeout(r, waitMs));
    return callGroq(prompt, systemPrompt, maxTokens);
  }

  if (!response.ok) throw new Error(`Groq ${response.status}: ${await response.text()}`);

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? "{}";
}

// --- Etape 1 : Detecter quels articles parlent du meme evenement -------------

async function detectDuplicates(
  articles: SummarizedArticle[]
): Promise<number[][]> {
  if (articles.length <= 1) return articles.map((_, i) => [i]);

  const SYSTEM = `Tu es un expert en analyse de contenu. Ta mission : identifier les articles qui couvrent EXACTEMENT le meme evenement ou annonce.

Deux articles sont "identiques" si et seulement si :
- Ils parlent du meme produit, modele, ou annonce specifique (ex: deux articles sur "GPT-5 est sorti")
- Ils couvrent la meme actualite le meme jour

Deux articles sont "differents" meme s'ils sont proches si :
- L'un est une analyse et l'autre une annonce
- Ils parlent d'aspects differents d'une meme entreprise
- Ils datent de jours differents

Retourne UNIQUEMENT un JSON avec cette structure :
{
  "groups": [[0, 2, 5], [1], [3, 4]]
}
Chaque sous-tableau contient les indices des articles qui parlent du meme evenement.
Chaque indice doit apparaitre exactement une fois. Ne retourne RIEN d'autre.`;

  const articlesDesc = articles
    .map((a, i) => `[${i}] "${a.title}" (${a.source}) - ${a.summary.slice(0, 120)}`)
    .join("\n");

  const prompt = `Voici ${articles.length} articles. Groupe ceux qui parlent du MEME evenement :\n\n${articlesDesc}`;

  try {
    const raw  = await callGroq(prompt, SYSTEM, 400);
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as { groups: number[][] };

    // Validation : chaque index doit apparaitre exactement une fois
    const allIndices = parsed.groups.flat();
    const expected   = articles.map((_, i) => i);
    const isValid    =
      allIndices.length === articles.length &&
      expected.every((i) => allIndices.includes(i));

    if (!isValid) {
      console.warn("[DEDUP] Groupage invalide, fallback : 1 article = 1 groupe");
      return articles.map((_, i) => [i]);
    }

    return parsed.groups;
  } catch {
    // En cas d'erreur, chaque article reste seul dans son groupe
    return articles.map((_, i) => [i]);
  }
}

// --- Etape 2 : Fusionner un groupe d'articles en une seule fiche -------------

async function mergeGroup(group: SummarizedArticle[]): Promise<ArticleGroup> {
  // Groupe de 1 seul article : pas besoin de fusion
  if (group.length === 1) {
    const a = group[0];
    return {
      title:        a.title,
      summary:      a.summary,
      linkedinPost: a.linkedinPost,
      category:     a.category,
      importance:   a.importance,
      domain:       a.domain,
      sources: [{ name: a.source, link: a.link, pubDate: a.pubDate }],
    };
  }

  // Groupe de plusieurs articles : on demande a Groq de fusionner
  const SYSTEM = `Tu es un expert en veille technologique. On t'envoie plusieurs articles qui parlent du MEME evenement, couverts par des sources differentes.
Ta mission : produire une fiche de veille unifiee et un post LinkedIn qui cite TOUTES les sources.

Retourne UNIQUEMENT un JSON valide :
{
  "title": "Titre synthetique qui capture l'essentiel de l'evenement",
  "summary": "Resume unifie en 4-6 phrases. Integre les angles complementaires de chaque source. Cite les sources les plus importantes.",
  "linkedinPost": "Post LinkedIn complet citant explicitement les differentes sources (ex: 'selon VentureBeat et The Verge...'). Meme structure : accroche, contexte, points cles en tirets, question ou opinion, hashtags.",
  "category": "La categorie la plus appropriee parmi : Nouveau modele | Mise a jour | Nouvelle technique | Outil | Recherche | Industrie | Reglementation",
  "importance": "haute si au moins une source la juge haute, sinon la plus haute des importances du groupe"
}
Reponds en francais. Ne retourne RIEN d'autre que le JSON.`;

  const sourcesDesc = group
    .map((a, i) => `Source ${i + 1} - ${a.source}:\nTitre: ${a.title}\nResume: ${a.summary}`)
    .join("\n\n---\n\n");

  const prompt = `Fusionne ces ${group.length} articles qui parlent du meme evenement :\n\n${sourcesDesc}`;

  try {
    await new Promise((r) => setTimeout(r, 2_000)); // pause rate limit
    const raw    = await callGroq(prompt, SYSTEM, 800);
    const clean  = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as {
      title: string; summary: string; linkedinPost: string;
      category: string; importance: string;
    };

    // Importance : prend la plus haute du groupe
    const importanceOrder = { haute: 0, moyenne: 1, faible: 2 };
    const bestImportance = group.reduce((best, a) =>
      importanceOrder[a.importance] < importanceOrder[best] ? a.importance : best,
      "faible" as "haute" | "moyenne" | "faible"
    );

    return {
      title:        parsed.title,
      summary:      parsed.summary,
      linkedinPost: parsed.linkedinPost,
      category:     parsed.category,
      importance:   (parsed.importance as "haute" | "moyenne" | "faible") ?? bestImportance,
      domain:       group[0].domain,
      sources:      group.map((a) => ({ name: a.source, link: a.link, pubDate: a.pubDate })),
    };
  } catch {
    // Fallback : on prend le premier article du groupe
    const a = group[0];
    return {
      title:        a.title,
      summary:      a.summary + ` (egalement couvert par : ${group.slice(1).map((x) => x.source).join(", ")})`,
      linkedinPost: a.linkedinPost,
      category:     a.category,
      importance:   a.importance,
      domain:       a.domain,
      sources:      group.map((x) => ({ name: x.source, link: x.link, pubDate: x.pubDate })),
    };
  }
}

// --- Point d'entree : regroupement semantique complet -----------------------

export async function groupAndMerge(
  articles: SummarizedArticle[]
): Promise<ArticleGroup[]> {
  if (articles.length === 0) return [];

  // On traite le groupage domaine par domaine pour ne pas melanger
  // des articles IA avec des articles DevOps par exemple
  const domains = [...new Set(articles.map((a) => a.domain))];
  const result: ArticleGroup[] = [];

  for (const domain of domains) {
    const domainArticles = articles.filter((a) => a.domain === domain);
    if (domainArticles.length === 0) continue;

    console.log(`[DEDUP] Analyse des doublons pour ${domain} (${domainArticles.length} articles)...`);

    // Etape 1 : detection des groupes
    const groups = await detectDuplicates(domainArticles);

    const merged = groups.filter((g) => g.length > 1).length;
    if (merged > 0) {
      console.log(`[DEDUP] ${merged} groupe${merged > 1 ? "s" : ""} fusionne${merged > 1 ? "s" : ""} dans ${domain}`);
    }

    // Etape 2 : fusion de chaque groupe
    for (const groupIndices of groups) {
      const groupArticles = groupIndices.map((i) => domainArticles[i]);
      const merged = await mergeGroup(groupArticles);
      result.push(merged);
    }

    // Pause entre les domaines pour le rate limit
    await new Promise((r) => setTimeout(r, 3_000));
  }

  // Tri final : haute importance en premier, puis par date de la premiere source
  return result.sort((a, b) => {
    const order = { haute: 0, moyenne: 1, faible: 2 };
    const diff  = order[a.importance] - order[b.importance];
    if (diff !== 0) return diff;
    const dateA = new Date(a.sources[0]?.pubDate ?? 0).getTime();
    const dateB = new Date(b.sources[0]?.pubDate ?? 0).getTime();
    return dateB - dateA;
  });
}
