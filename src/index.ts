import * as path from "path";
import * as fs from "fs";
import "dotenv/config";
import { fetchAllFeeds, deduplicateAndSave } from "./watcher.js";
import { summarizeAll } from "./summarizer.js";
import { groupAndMerge } from "./deduplicator.js";
import { sendEmail } from "./mailer.js";

async function main(): Promise<void> {
  console.log("===========================================");
  console.log("Tech Watch - Demarrage de la veille");
  console.log(`${new Date().toLocaleString("fr-FR")}`);
  console.log("===========================================");

  const required = ["GROQ_API_KEY", "GMAIL_USER", "GMAIL_APP_PASS"];
  const missing  = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`[ERROR] Variables manquantes : ${missing.join(", ")}`);
    process.exit(1);
  }

  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const storePath = path.join(dataDir, "seen.json");

  // -- 1. Fetch RSS ------------------------------------------------------------
  console.log("\n[1/5] Recuperation des flux RSS...");
  const rawArticles = await fetchAllFeeds();
  console.log(`      ${rawArticles.length} articles recuperes au total`);

  // -- 2. Deduplication URL (evite de retraiter les articles deja vus) ---------
  console.log("\n[2/5] Deduplication par URL...");
  const newArticles = deduplicateAndSave(storePath, rawArticles);
  if (newArticles.length === 0) {
    console.log("      Aucune nouveaute. Fin du script.");
    return;
  }
  console.log(`      ${newArticles.length} nouveaux articles a traiter`);

  // -- 3. Resumes via Groq -----------------------------------------------------
  console.log("\n[3/5] Generation des resumes (Groq API)...");
  const summarized = await summarizeAll(newArticles);
  console.log(`      ${summarized.length} resumes generes`);

  // -- 4. Regroupement semantique (meme evenement = 1 seule fiche) -------------
  console.log("\n[4/5] Regroupement semantique des doublons...");
  const grouped = await groupAndMerge(summarized);
  const fused   = summarized.length - grouped.length;
  if (fused > 0) {
    console.log(`      ${fused} article${fused > 1 ? "s" : ""} fusionne${fused > 1 ? "s" : ""} (${grouped.length} fiches finales)`);
  } else {
    console.log(`      Aucun doublon semantique detecte (${grouped.length} fiches)`);
  }

  // -- 5. Envoi email ----------------------------------------------------------
  console.log("\n[5/5] Envoi de l'email de veille...");
  await sendEmail(grouped);

  console.log("\nVeille terminee avec succes !");
  console.log("===========================================\n");
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
