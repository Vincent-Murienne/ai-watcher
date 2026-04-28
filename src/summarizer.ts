import { RawArticle } from "./watcher.js";

// --- Types -------------------------------------------------------------------

export interface SummarizedArticle {
  domain: "IA" | "Web Dev" | "DevOps" | "DevSecOps";
  title: string;
  link: string;
  source: string;
  pubDate: string;
  summary: string;        // resume factuel court (3-5 phrases)
  linkedinPost: string;   // post LinkedIn pret a copier-coller
  category: string;
  importance: "haute" | "moyenne" | "faible";
}

// --- Configuration Groq ------------------------------------------------------

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL   = "llama-3.3-70b-versatile";

// Free tier Groq : 6 000 TPM sur llama-3.3-70b-versatile
// Chaque appel consomme environ 500-700 tokens (prompt + reponse)
// Pause de 12s => ~5 articles/min => ~3 000 tokens/min => bien sous la limite
const DELAY_BETWEEN_ARTICLES_MS = 12_000;

// --- Prompt systeme ----------------------------------------------------------

const SYSTEM_PROMPT = `Tu es a la fois un expert en veille technologique IA et un redacteur LinkedIn reconnu pour ses posts engageants.
Ta mission : analyser un article tech et produire deux contenus distincts.

Retourne UNIQUEMENT un JSON valide avec cette structure exacte :
{
  "summary": "Resume factuel en 3-5 phrases. Explique QUOI (la nouveaute), POURQUOI c'est important, et QUEL IMPACT sur l'ecosysteme IA.",
  "linkedinPost": "Post LinkedIn complet, pret a publier. Structure : accroche percutante (1-2 lignes), saut de ligne, contexte et enjeux, saut de ligne, 3-4 points cles en liste avec tirets, saut de ligne, conviction personnelle ou question ouverte pour susciter les commentaires, saut de ligne, 4-5 hashtags pertinents. Ton : expert mais accessible, direct, pas de jargon inutile. Longueur : 150-250 mots.",
  "category": "Une seule valeur parmi : Nouveau modele | Mise a jour | Nouvelle technique | Outil | Recherche | Industrie | Reglementation",
  "importance": "Une seule valeur parmi : haute | moyenne | faible"
}

Criteres d'importance :
- haute : rupture technologique, nouveau modele majeur, annonce d'un acteur cle (OpenAI, Anthropic, Google, Meta)
- moyenne : mise a jour significative, nouvelle technique prometteuse, nouveau produit IA
- faible : mise a jour mineure, article d'opinion, news secondaire

Reponds TOUJOURS en francais. Ne retourne RIEN d'autre que le JSON. Aucun texte avant ou apres.`;

// --- Appel API Groq avec retry automatique -----------------------------------

async function callGroq(userPrompt: string, attempt = 1): Promise<string> {
  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: 600,        // augmente legerement pour le post LinkedIn
      temperature: 0.4,       // un peu plus de creativite pour le post LinkedIn
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: userPrompt },
      ],
    }),
  });

  // Rate limit -> on attend le delai indique par l'API puis on reessaie
  if (response.status === 429) {
    if (attempt > 5) throw new Error("Rate limit depasse apres 5 tentatives");

    const body = await response.json() as { error?: { message?: string } };
    const match = body.error?.message?.match(/try again in ([0-9.]+)s/);
    // On prend le delai suggere par l'API + 1s de marge.
    // Si l'API ne precise pas de delai, on attend 15s (assez pour recharger le quota TPM).
    const waitMs = match ? Math.ceil(parseFloat(match[1]) * 1000) + 1_000 : 15_000;

    console.log(`[GROQ] Rate limit - attente ${(waitMs / 1000).toFixed(1)}s (tentative ${attempt}/5)...`);
    await new Promise((r) => setTimeout(r, waitMs));
    return callGroq(userPrompt, attempt + 1);
  }

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API ${response.status}: ${err}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  return data.choices[0]?.message?.content ?? "";
}

// --- Resume d'un article -----------------------------------------------------

async function summarizeArticle(article: RawArticle): Promise<SummarizedArticle> {
  // 400 caracteres suffisent pour que le LLM comprenne le sujet de l'article.
  // Reduire l'extrait est le levier le plus efficace contre le rate limit TPM :
  // chaque caractere en moins = moins de tokens input = plus de marge par minute.
  const excerpt = article.summary.slice(0, 400) || "(aucun extrait, base-toi sur le titre)";

  const userPrompt = `Source : ${article.source}
Titre : ${article.title}
URL : ${article.link}
Extrait : ${excerpt}

Genere le JSON avec le resume factuel et le post LinkedIn.`;

  const rawText = await callGroq(userPrompt);

  let parsed: { summary: string; linkedinPost: string; category: string; importance: string };
  try {
    const clean = rawText.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(clean);
  } catch {
    parsed = {
      summary:      article.summary.slice(0, 300) || article.title,
      linkedinPost: article.title,
      category:     "Industrie",
      importance:   "faible",
    };
  }

  return {
    title:        article.title,
    link:         article.link,
    source:       article.source,
    pubDate:      article.pubDate,
    summary:      parsed.summary,
    linkedinPost: parsed.linkedinPost,
    category:     parsed.category,
    importance:   (parsed.importance as "haute" | "moyenne" | "faible") ?? "faible",
    domain:       article.domain,
  };
}

// --- Resume de tous les articles (sequentiel avec pause) ---------------------

export async function summarizeAll(
  articles: RawArticle[]
): Promise<SummarizedArticle[]> {
  if (articles.length === 0) return [];

  const results: SummarizedArticle[] = [];

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    console.log(`[GROQ] Article ${i + 1}/${articles.length} : ${article.title.slice(0, 60)}...`);

    try {
      const summarized = await summarizeArticle(article);
      results.push(summarized);
    } catch (err) {
      console.warn(`[WARN] Resume echoue pour "${article.title.slice(0, 40)}" : ${(err as Error).message}`);
    }

    if (i < articles.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_ARTICLES_MS));
    }
  }

  return results.sort((a, b) => {
    const order = { haute: 0, moyenne: 1, faible: 2 };
    const diff  = order[a.importance] - order[b.importance];
    if (diff !== 0) return diff;
    return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
  });
}
