import { RawArticle } from "./watcher.js";

// --- Types -------------------------------------------------------------------

export interface SummarizedArticle {
  domain: "IA" | "Cybersecurite";
  title: string;
  link: string;
  source: string;
  pubDate: string;
  summary: string;        // resume factuel court
  linkedinPost: string;   // post LinkedIn long, pret a copier-coller
  category: string;
  importance: "haute" | "moyenne" | "faible";
}

// --- Configuration Groq ------------------------------------------------------

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL   = "llama-3.3-70b-versatile";

// Free tier : 6 000 TPM sur llama-3.3-70b-versatile
// Pause de 12s => ~5 articles/min => ~3 000 tokens/min => sous la limite
const DELAY_BETWEEN_ARTICLES_MS = 12_000;

// --- Prompt systeme ----------------------------------------------------------

const SYSTEM_PROMPT = `Tu es a la fois un expert en veille technologique et un redacteur LinkedIn reconnu pour ses posts longs, engageants et tres partages.
Ta mission : analyser un article tech et produire deux contenus distincts.

Retourne UNIQUEMENT un JSON valide avec cette structure exacte :
{
  "summary": "Resume factuel en 3-5 phrases. Explique QUOI (la nouveaute), POURQUOI c'est important, et QUEL IMPACT sur l'ecosysteme tech.",
  "linkedinPost": "Post LinkedIn long et developpe. STRUCTURE OBLIGATOIRE : 1) Accroche forte en 1-2 lignes (phrase choc ou stat surprenante, ne pas commencer par Je ou le nom de l'entreprise) 2) saut de ligne 3) La vraie news en 2-3 phrases avec le contexte strategique 4) saut de ligne 5) La phrase exacte Voici ce que ca signifie concretement : suivie de 4-6 points detailles avec tirets (chaque point = 1-2 phrases concretes) 6) saut de ligne 7) 1-2 paragraphes de prise de position ou analyse prospective sur l'impact metier 8) saut de ligne 9) Question ouverte pour engager les commentaires 10) saut de ligne 11) La phrase exacte Pour plus d informations : suivi de l URL de l article 12) saut de ligne 13) 5-6 hashtags. Longueur totale : 250-350 mots. Ton : expert mais accessible, direct, concret, sans jargon inutile.",
  "category": "Une seule valeur parmi : Nouveau modele | Mise a jour | Nouvelle technique | Outil | Recherche | Industrie | Reglementation",
  "importance": "Une seule valeur parmi : haute | moyenne | faible"
}

Criteres d importance :
- haute : rupture technologique, nouveau modele majeur, annonce d un acteur cle (OpenAI, Anthropic, Google, Meta)
- moyenne : mise a jour significative, nouvelle technique prometteuse, nouveau produit
- faible : mise a jour mineure, article d opinion, news secondaire

Reponds TOUJOURS en francais. Ne retourne RIEN d autre que le JSON. Aucun texte avant ou apres.`;

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
      max_tokens: 800,        // augmente pour les posts plus longs
      temperature: 0.5,       // un peu de creativite pour varier le style
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: userPrompt },
      ],
    }),
  });

  if (response.status === 429) {
    if (attempt > 5) throw new Error("Rate limit depasse apres 5 tentatives");

    const body = await response.json() as { error?: { message?: string } };
    const match = body.error?.message?.match(/try again in ([0-9.]+)s/);
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
  const excerpt = article.summary.slice(0, 400) || "(aucun extrait, base-toi sur le titre)";

  // On passe l'URL dans le prompt pour que le LLM puisse l'inclure
  // directement dans la phrase "Pour plus d'informations : [URL]"
  const userPrompt = `Source : ${article.source}
Titre : ${article.title}
URL : ${article.link}
Extrait : ${excerpt}

Genere le JSON. L URL a utiliser dans le post LinkedIn est : ${article.link}`;

  const rawText = await callGroq(userPrompt);

  let parsed: { summary: string; linkedinPost: string; category: string; importance: string };
  try {
    const clean = rawText.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(clean);
  } catch {
    parsed = {
      summary:      article.summary.slice(0, 300) || article.title,
      linkedinPost: `${article.title}\n\nPour plus d'informations : ${article.link}`,
      category:     "Industrie",
      importance:   "faible",
    };
  }

  // Securite : si le LLM a oublie d'inclure l'URL, on l'ajoute avant les hashtags
  let post = parsed.linkedinPost;
  if (!post.includes(article.link)) {
    // On insere "Pour plus d'informations" avant les hashtags s'il y en a
    const hashtagIndex = post.lastIndexOf("#");
    const insertBefore = hashtagIndex > 0 ? hashtagIndex : post.length;
    post =
      post.slice(0, insertBefore).trimEnd() +
      `\n\nPour plus d'informations : ${article.link}\n\n` +
      post.slice(insertBefore);
  }

  return {
    title:        article.title,
    link:         article.link,
    source:       article.source,
    pubDate:      article.pubDate,
    summary:      parsed.summary,
    linkedinPost: post,
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
