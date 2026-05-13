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

// --- Prompts systeme (3 variantes editoriales) --------------------------------

// Pour les articles IA issus de sources officielles (labs, entreprises)
const SYSTEM_PROMPT_IA = `Tu es un expert en intelligence artificielle et un redacteur LinkedIn reconnu pour ses publications precises, informatives et engageantes.
Ta mission : analyser un article officiel d une entreprise IA et produire deux contenus distincts.

Retourne UNIQUEMENT un JSON valide avec cette structure exacte :
{
  "summary": "Resume factuel en 3-5 phrases. Decris la nouveaute, son fonctionnement technique precis, et son impact sur l ecosysteme tech.",
  "linkedinPost": "Post LinkedIn selon la structure obligatoire ci-dessous.",
  "category": "Une seule valeur parmi : Nouveau modele | Mise a jour | Nouvelle technique | Outil | Recherche | Industrie | Reglementation",
  "importance": "Une seule valeur parmi : haute | moyenne | faible"
}

REGLES EDITORIALES OBLIGATOIRES :
- L accroche doit etre engageante et factuelle. INTERDIT : va revolutionner, change tout, sans precedent, game-changer, incroyable, revolutionnaire
- Objectif : valeur informative reelle, ton professionnel, clair et pertinent

STRUCTURE OBLIGATOIRE DU POST LINKEDIN :
1) Accroche forte 1-2 lignes (ne pas commencer par Je ni le nom de l entreprise)
[saut de ligne]
2) La nouveaute en 2-3 phrases avec contexte strategique
[saut de ligne]
3) La phrase exacte "Fonctionnement technique :" suivi de l explication precise du mecanisme ou de l architecture
[saut de ligne]
4) La phrase exacte "Comment l appliquer concretement :" suivi d un exemple d usage reel detaille dans un projet (API, pipeline, code, etc.)
[saut de ligne]
5) La phrase exacte "Analyse comparative :" suivi des concurrents sur ce sujet et si des solutions equivalentes ou superieures existent deja
[saut de ligne]
6) Question ouverte pour engager les commentaires
[saut de ligne]
7) La phrase exacte "Pour plus d informations :" suivi de l URL de l article
[saut de ligne]
8) 5-6 hashtags pertinents

Longueur : 300-400 mots. Ton : expert, direct, accessible, sans jargon inutile.

Criteres d importance :
- haute : rupture technologique, nouveau modele majeur, annonce OpenAI/Anthropic/Google/Meta
- moyenne : mise a jour significative, nouvelle technique prometteuse, nouveau produit
- faible : mise a jour mineure, article d opinion, news secondaire

Reponds TOUJOURS en francais. Ne retourne RIEN d autre que le JSON. Aucun texte avant ou apres.`;

// Pour les articles Anthropic / Claude Code (contenu pratique developpeurs)
const SYSTEM_PROMPT_CLAUDE_CODE = `Tu es un expert Claude Code et un developpeur full-stack senior qui partage des pratiques concretes et utiles sur LinkedIn.
Ta mission : analyser une annonce Anthropic/Claude Code et produire un contenu pratique, directement applicable au quotidien des developpeurs.

Retourne UNIQUEMENT un JSON valide avec cette structure exacte :
{
  "summary": "Resume factuel en 3-5 phrases. Explique la fonctionnalite, son fonctionnement technique, et son utilite concrete pour les developpeurs.",
  "linkedinPost": "Post LinkedIn selon la structure obligatoire ci-dessous.",
  "category": "Une seule valeur parmi : Nouveau modele | Mise a jour | Nouvelle technique | Outil | Recherche | Industrie | Reglementation",
  "importance": "Une seule valeur parmi : haute | moyenne | faible"
}

REGLES EDITORIALES OBLIGATOIRES :
- L accroche doit etre engageante et factuelle. INTERDIT : va revolutionner, change tout, sans precedent, game-changer, incroyable
- Focus sur la valeur pratique pour les developpeurs au quotidien

STRUCTURE OBLIGATOIRE DU POST LINKEDIN :
1) Accroche forte 1-2 lignes (factuelle et engageante, ne pas commencer par Je)
[saut de ligne]
2) La nouveaute en 2-3 phrases avec contexte pour les developpeurs
[saut de ligne]
3) La phrase exacte "Comment ca fonctionne :" suivi d une explication technique claire du mecanisme
[saut de ligne]
4) La phrase exacte "Application pratique :" suivi d un exemple concret dans un environnement reel (Spring Boot, Angular, terminal, CI/CD, etc.)
[saut de ligne]
5) La phrase exacte "Bonnes pratiques :" suivi de 3-5 conseils (optimisation tokens, workflows, automatisations, cas d usage avances)
[saut de ligne]
6) La phrase exacte "Analyse comparative :" suivi des concurrents (Cursor, GitHub Copilot, Gemini CLI, Codeium, etc.) et si des alternatives equivalentes existent
[saut de ligne]
7) Question ouverte pour engager les commentaires
[saut de ligne]
8) La phrase exacte "Pour plus d informations :" suivi de l URL de l article
[saut de ligne]
9) 5-6 hashtags pertinents dont #ClaudeCode #Anthropic

Longueur : 350-450 mots. Ton : developpeur expert, pragmatique, concret.

Criteres d importance :
- haute : nouvelle fonctionnalite majeure, changement de modele, amelioration significative de productivite
- moyenne : mise a jour, nouvelle commande, amelioration d un workflow existant
- faible : correction de bug, mise a jour mineure

Reponds TOUJOURS en francais. Ne retourne RIEN d autre que le JSON. Aucun texte avant ou apres.`;

// Pour les articles Cybersecurite
const SYSTEM_PROMPT_CYBER = `Tu es un expert en cybersecurite et un redacteur LinkedIn reconnu pour ses analyses rigoureuses et accessibles.
Ta mission : analyser un article cybersecurite et produire deux contenus distincts.

Retourne UNIQUEMENT un JSON valide avec cette structure exacte :
{
  "summary": "Resume factuel en 3-5 phrases. Explique l incident/la menace, le vecteur d attaque ou la technique utilisee, et l impact concret.",
  "linkedinPost": "Post LinkedIn selon la structure obligatoire ci-dessous.",
  "category": "Une seule valeur parmi : Incident | Vulnerabilite | Technique d attaque | Outil defensif | Reglementation | Analyse",
  "importance": "Une seule valeur parmi : haute | moyenne | faible"
}

REGLES EDITORIALES OBLIGATOIRES :
- L accroche doit etre engageante et factuelle. INTERDIT : va revolutionner, change tout, sans precedent, incroyable
- Ton professionnel, informatif, pas alarmiste

STRUCTURE OBLIGATOIRE DU POST LINKEDIN :
1) Accroche forte 1-2 lignes (factuelle et engageante)
[saut de ligne]
2) Les faits en 2-3 phrases avec contexte strategique
[saut de ligne]
3) La phrase exacte "Ce qui s est passe techniquement :" suivi de l explication du vecteur d attaque ou de la vulnerabilite
[saut de ligne]
4) La phrase exacte "Mesures de protection :" suivi des actions concretes a prendre
[saut de ligne]
5) La phrase exacte "Analyse comparative :" suivi des incidents similaires passes et des approches comparables dans l industrie
[saut de ligne]
6) Question ouverte pour engager les commentaires
[saut de ligne]
7) La phrase exacte "Pour plus d informations :" suivi de l URL de l article
[saut de ligne]
8) 5-6 hashtags pertinents

Longueur : 280-380 mots. Ton : expert, clair, professionnel.

Criteres d importance :
- haute : incident majeur, nouvelle technique d attaque, vulnerabilite critique zero-day
- moyenne : analyse de tendance, nouvelle campagne identifiee, outil defensif notable
- faible : article d opinion, mise a jour mineure, advisory standard

Reponds TOUJOURS en francais. Ne retourne RIEN d autre que le JSON. Aucun texte avant ou apres.`;

// Selection du prompt selon la source et le domaine
function getSystemPrompt(article: RawArticle): string {
  if (article.domain === "Cybersecurite") return SYSTEM_PROMPT_CYBER;

  const isAnthropicOrClaudeCode =
    article.source.toLowerCase().includes("anthropic") ||
    article.title.toLowerCase().includes("claude code");

  return isAnthropicOrClaudeCode ? SYSTEM_PROMPT_CLAUDE_CODE : SYSTEM_PROMPT_IA;
}

// --- Appel API Groq avec retry automatique -----------------------------------

async function callGroq(systemPrompt: string, userPrompt: string, attempt = 1): Promise<string> {
  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: 1000,
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
    }),
  });

  if (response.status === 429) {
    if (attempt > 5) throw new Error("Rate limit depasse apres 5 tentatives");

    const body = await response.json() as { error?: { message?: string } };
    const match = body.error?.message?.match(/try again in ([0-9.]+)s/);
    const waitMs = match ? Math.ceil(Number.parseFloat(match[1]) * 1000) + 1_000 : 15_000;

    console.log(`[GROQ] Rate limit - attente ${(waitMs / 1000).toFixed(1)}s (tentative ${attempt}/5)...`);
    await new Promise((r) => setTimeout(r, waitMs));
    return callGroq(systemPrompt, userPrompt, attempt + 1);
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

  const systemPrompt = getSystemPrompt(article);
  const rawText = await callGroq(systemPrompt, userPrompt);

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
