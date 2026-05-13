import nodemailer from "nodemailer";
import { ArticleGroup } from "./deduplicator.js";

// --- Configuration Gmail SMTP ------------------------------------------------

function createTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASS,
    },
  });
}

// --- Styles par domaine ------------------------------------------------------

const DOMAIN_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  "IA":            { bg: "#7c3aed", color: "#fff", label: "IA" },
  "Cybersecurite": { bg: "#b91c1c", color: "#fff", label: "CYBER" },
};

const IMPORTANCE_STYLE: Record<string, { border: string; label: string }> = {
  haute:   { border: "#ef4444", label: "HAUTE" },
  moyenne: { border: "#f59e0b", label: "MOYENNE" },
  faible:  { border: "#9ca3af", label: "FAIBLE" },
};

// --- Conversion post LinkedIn en HTML ----------------------------------------

function linkedinToHtml(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (!t) return "<br>";
      if (t.startsWith("#"))
        return `<span style="color:#0a66c2;font-size:13px;">${t}</span>`;
      if (t.startsWith("-"))
        return `<div style="padding-left:12px;margin:4px 0;color:#374151;">&#8226; ${t.slice(1).trim()}</div>`;
      if (t.startsWith("Pour plus d"))
        return `<div style="margin-top:8px;"><span style="color:#0a66c2;">${t}</span></div>`;
      return `<span>${t}</span>`;
    })
    .join("\n");
}

// --- Bloc sources multiples --------------------------------------------------

function sourcesBlock(group: ArticleGroup): string {
  if (group.sources.length === 1) {
    const s = group.sources[0];
    const date = s.pubDate
      ? new Date(s.pubDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
      : "";
    return `<span style="color:#9ca3af;font-size:11px;">${s.name}${date ? " · " + date : ""}</span>`;
  }

  const badge = `<span style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;margin-right:8px;">${group.sources.length} sources</span>`;
  const links = group.sources
    .map((s) => {
      const date = s.pubDate
        ? new Date(s.pubDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })
        : "";
      return `<a href="${s.link}" style="display:inline-block;background:#f8fafc;border:1px solid #e2e8f0;color:#475569;font-size:11px;padding:4px 10px;border-radius:5px;text-decoration:none;margin:3px 3px 0 0;">${s.name}${date ? " · " + date : ""}</a>`;
    })
    .join("");
  return `${badge}<div style="margin-top:6px;">${links}</div>`;
}

// --- Bloc image generee (DALL-E 3) -------------------------------------------

function imageBlock(imageUrl: string | undefined): string {
  if (!imageUrl) return "";
  return `
    <div style="margin-bottom:18px;border-radius:8px;overflow:hidden;">
      <img src="${imageUrl}" alt="Illustration generee" style="width:100%;max-height:300px;object-fit:cover;display:block;" />
    </div>`;
}

// --- Carte d'un groupe -------------------------------------------------------

function articleCard(group: ArticleGroup): string {
  const imp = IMPORTANCE_STYLE[group.importance];
  const dom = DOMAIN_STYLE[group.domain] ?? DOMAIN_STYLE["IA"];

  return `
    <div style="background:#fff;border:1px solid #e5e7eb;border-left:4px solid ${imp.border};border-radius:10px;padding:22px;margin-bottom:20px;">

      <!-- Badges -->
      <div style="margin-bottom:10px;">
        <span style="background:${dom.bg};color:${dom.color};font-size:10px;font-weight:800;padding:3px 8px;border-radius:4px;letter-spacing:0.08em;margin-right:6px;">${dom.label}</span>
        <span style="background:#f3f4f6;color:#374151;border:1px solid #e5e7eb;font-size:11px;font-weight:700;padding:3px 8px;border-radius:4px;margin-right:6px;">${imp.label}</span>
        <span style="background:#eff6ff;color:#1d4ed8;font-size:11px;padding:3px 8px;border-radius:4px;">${group.category}</span>
      </div>
      <div style="margin-bottom:12px;">${sourcesBlock(group)}</div>

      <!-- Image generee -->
      ${imageBlock(group.imageUrl)}

      <!-- Titre -->
      <h3 style="margin:0 0 10px 0;font-size:16px;font-weight:700;color:#111827;line-height:1.4;">
        ${group.sources.length === 1
          ? `<a href="${group.sources[0].link}" style="color:#111827;text-decoration:none;">${group.title}</a>`
          : group.title}
      </h3>

      <!-- Resume factuel -->
      <p style="margin:0 0 18px 0;color:#4b5563;font-size:14px;line-height:1.7;">${group.summary}</p>

      <!-- Separateur -->
      <div style="border-top:1px dashed #e5e7eb;margin-bottom:18px;"></div>

      <!-- Post LinkedIn -->
      <div style="background:#f0f7ff;border:1px solid #bfdbfe;border-radius:8px;padding:18px;margin-bottom:14px;">
        <div style="margin-bottom:12px;display:flex;align-items:center;gap:6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#0a66c2" style="flex-shrink:0;" xmlns="http://www.w3.org/2000/svg">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
          <span style="font-size:12px;font-weight:700;color:#0a66c2;">Post LinkedIn - pret a copier</span>
          ${group.sources.length > 1 ? `<span style="font-size:11px;color:#64748b;">(sources fusionnees)</span>` : ""}
        </div>
        <div style="font-size:14px;color:#1e293b;line-height:1.8;white-space:pre-line;font-family:Georgia,serif;">
          ${linkedinToHtml(group.linkedinPost)}
        </div>
      </div>

      <!-- Boutons -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${group.sources.length === 1
          ? `<a href="${group.sources[0].link}" style="display:inline-block;background:#111827;color:#fff;font-size:12px;font-weight:600;padding:7px 14px;border-radius:6px;text-decoration:none;">Lire l'article</a>`
          : group.sources.map((s) =>
              `<a href="${s.link}" style="display:inline-block;background:#334155;color:#fff;font-size:12px;font-weight:600;padding:7px 14px;border-radius:6px;text-decoration:none;">${s.name}</a>`
            ).join("")
        }
        <a href="https://www.linkedin.com/feed/" style="display:inline-block;background:#0a66c2;color:#fff;font-size:12px;font-weight:600;padding:7px 14px;border-radius:6px;text-decoration:none;">Publier sur LinkedIn</a>
      </div>

    </div>`;
}

// --- Section par domaine -----------------------------------------------------

function domainSection(domainLabel: string, groups: ArticleGroup[]): string {
  if (groups.length === 0) return "";

  const dom     = DOMAIN_STYLE[domainLabel] ?? DOMAIN_STYLE["IA"];
  const haute   = groups.filter((g) => g.importance === "haute");
  const moyenne = groups.filter((g) => g.importance === "moyenne");
  const faible  = groups.filter((g) => g.importance === "faible");

  const sub = (label: string, items: ArticleGroup[]) =>
    items.length === 0 ? "" : `
      <p style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.07em;margin:18px 0 8px 0;">${label} (${items.length})</p>
      ${items.map(articleCard).join("")}`;

  return `
    <div style="margin-bottom:40px;">
      <div style="background:${dom.bg};border-radius:8px;padding:14px 20px;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;">
        <span style="color:#fff;font-size:17px;font-weight:800;">${domainLabel}</span>
        <span style="background:rgba(255,255,255,0.2);color:#fff;font-size:12px;font-weight:600;padding:3px 12px;border-radius:20px;">${groups.length} fiche${groups.length > 1 ? "s" : ""}</span>
      </div>
      ${sub("Importance haute",   haute)}
      ${sub("Importance moyenne", moyenne)}
      ${sub("Importance faible",  faible)}
    </div>`;
}

// --- Template HTML complet ---------------------------------------------------

function buildEmailHTML(groups: ArticleGroup[], date: string): string {
  const domains = ["IA", "Cybersecurite"] as const;
  const byDomain = Object.fromEntries(
    domains.map((d) => [d, groups.filter((g) => g.domain === d)])
  );

  const totalSources = groups.reduce((sum, g) => sum + g.sources.length, 0);
  const fusedCount   = totalSources - groups.length;

  const iaCount    = byDomain["IA"].length;
  const cyberCount = byDomain["Cybersecurite"].length;

  return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:700px;margin:0 auto;padding:28px 16px;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);border-radius:12px;padding:32px;margin-bottom:24px;text-align:center;">
    <h1 style="margin:0 0 6px 0;color:#fff;font-size:24px;font-weight:800;">Tech Watch</h1>
    <p style="margin:0;color:#94a3b8;font-size:13px;">${date}</p>
    <p style="margin:10px 0 0 0;color:#fff;font-size:14px;font-weight:600;">
      ${groups.length} fiche${groups.length > 1 ? "s" : ""}
      ${fusedCount > 0 ? `<span style="color:#fbbf24;"> · ${fusedCount} doublon${fusedCount > 1 ? "s" : ""} fusionne${fusedCount > 1 ? "s" : ""}</span>` : ""}
    </p>
  </div>

  <!-- Compteurs -->
  <div style="display:flex;gap:12px;margin-bottom:28px;">
    <div style="flex:1;background:#fff;border:1px solid #e5e7eb;border-top:3px solid #7c3aed;border-radius:8px;padding:16px;text-align:center;">
      <div style="font-size:28px;font-weight:800;color:#7c3aed;">${iaCount}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Intelligence Artificielle</div>
    </div>
    <div style="flex:1;background:#fff;border:1px solid #e5e7eb;border-top:3px solid #b91c1c;border-radius:8px;padding:16px;text-align:center;">
      <div style="font-size:28px;font-weight:800;color:#b91c1c;">${cyberCount}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Cybersecurite</div>
    </div>
  </div>

  <!-- Articles -->
  ${domainSection("IA", byDomain["IA"])}
  ${domainSection("Cybersecurite", byDomain["Cybersecurite"])}

  <!-- Footer -->
  <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;line-height:2;">
    <p>Genere par Tech Watch · Groq Llama 3.3 70B</p>
    <p>IA : Anthropic · OpenAI · Google DeepMind · Google AI · Meta AI · Mistral · HuggingFace · Cursor · Groq</p>
    <p>Cyber : Krebs on Security · Schneier · The Hacker News · Recorded Future · Snyk · Dark Reading · Wired Security</p>
  </div>

</div>
</body>
</html>`;
}

// --- Envoi de l'email --------------------------------------------------------

export async function sendEmail(groups: ArticleGroup[]): Promise<void> {
  if (groups.length === 0) {
    console.log("[MAIL] Aucune nouveaute a envoyer.");
    return;
  }

  const transporter = createTransporter();
  const now = new Date().toLocaleDateString("fr-FR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });

  const haute  = groups.filter((g) => g.importance === "haute").length;
  const cyber  = groups.filter((g) => g.domain === "Cybersecurite").length;
  const ia     = groups.filter((g) => g.domain === "IA").length;

  const subject = haute > 0
    ? `[Tech Watch] ${haute} urgente${haute > 1 ? "s" : ""} · ${ia} IA · ${cyber} Cyber · ${now}`
    : `[Tech Watch] ${ia} IA · ${cyber} Cyber · ${now}`;

  await transporter.sendMail({
    from: `"Tech Watch" <${process.env.GMAIL_USER}>`,
    to:   process.env.GMAIL_USER,
    subject,
    html: buildEmailHTML(groups, now),
  });

  console.log(`[MAIL] Email envoye : "${subject}"`);
}
