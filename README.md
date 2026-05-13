# AI Watcher - Veille Technologique IA Automatisee

Surveille automatiquement 13 sources specialisees IA (Anthropic, OpenAI, DeepMind, VentureBeat, The Verge...),
genere des resumes synthetiques via Groq (Llama 3.3 70B, gratuit), et envoie un email formate tous les jours à 9h
sans aucun doublon. Aucune dependance native, fonctionne sur Windows, Mac et Linux.


## Fonctionnement

    GitHub Actions (toutes les 6h)
        |
        v
    1. Fetch RSS (13 sources specialisees IA)
        |
        v
    2. Filtre mots-cles IA + deduplication (fichier JSON)
        |
        v
    3. Resume synthetique via Groq API (Llama 3.3 70B, gratuit)
        |
        v
    4. Email HTML formate : Haute / Moyenne / Faible importance


## Prerequis

- Node.js 18 ou superieur
- Un compte Groq (gratuit) : https://console.groq.com
- Un compte Gmail avec validation en 2 etapes activee


## Installation

### Etape 1 - Installer les dependances

    npm install


### Etape 2 - Obtenir la cle API Groq (gratuit)

1. Creer un compte sur https://console.groq.com (GitHub ou Google suffisent)
2. Aller dans "API Keys" puis cliquer "Create API Key"
3. Copier la cle qui commence par gsk_


### Etape 3 - Configurer l'App Password Gmail

Le projet utilise Gmail SMTP pour envoyer les emails. Il ne faut PAS utiliser
le mot de passe Gmail habituel, mais un "App Password" dedie.

Comment l'obtenir :

1. Aller sur https://myaccount.google.com
2. Securite > Validation en 2 etapes (doit etre activee)
3. En bas de la page, cliquer "Mots de passe des applications"
   Lien direct : https://myaccount.google.com/apppasswords
4. Choisir "Autre (nom personnalise)" > taper "AI Watcher" > Generer
5. Copier le code de 16 caracteres genere (ex : abcd efgh ijkl mnop)
   Ce code ne sera plus affiche apres fermeture de la fenetre.


### Etape 4 - Creer le fichier .env

Copier le fichier d'exemple :

    cp .env.example .env

Puis editer .env avec les valeurs obtenues aux etapes 2 et 3 :

    GROQ_API_KEY=gsk_...
    GMAIL_USER=ton.adresse@gmail.com
    GMAIL_APP_PASS=abcd efgh ijkl mnop


### Etape 5 - Tester en local

    npm run dev

Le script affiche les logs dans le terminal et envoie un email si de nouveaux
articles IA sont detectes. Verifier le dossier Spam si l'email n'arrive pas.


## Deploiement GitHub Actions (automatisation)

Une fois le test local valide, le projet peut tourner automatiquement via GitHub Actions
sans laisser l'ordinateur allume.

### 1 - Creer un depot GitHub (prive recommande)

    git init
    git remote add origin https://github.com/TON_USERNAME/ai-watcher.git

### 2 - Pousser le code

    git add .
    git commit -m "init: AI watcher setup"
    git push -u origin main

### 3 - Ajouter les secrets GitHub

Dans le depot GitHub : Settings > Secrets and variables > Actions > New repository secret

Ajouter les 3 secrets :

    GROQ_API_KEY      -> la cle Groq
    GMAIL_USER        -> l'adresse Gmail utilisée
    GMAIL_APP_PASS    -> l'App Password (16 caracteres)

### 4 - Verifier le fonctionnement

Aller dans l'onglet "Actions" du depot > selectionner "AI Watcher" > "Run workflow"
pour declencher un premier run manuel et verifier que tout fonctionne.

Ensuite le script tourne automatiquement toutes les jours à 9h.


## Personnalisation

### Changer la frequence d'execution

Dans .github/workflows/ai-watch.yml, modifier la ligne cron :

    "0 */6 * * *"    -> toutes les 6 heures (defaut)
    "0 8 * * *"      -> tous les jours a 8h UTC (9h Paris heure d'hiver)
    "0 8,20 * * *"   -> deux fois par jour, 8h et 20h UTC

### Ajouter des sources RSS

Dans src/watcher.ts, ajouter une entree dans le tableau RSS_SOURCES :

    { name: "Nom de la source", url: "https://example.com/feed.xml" },

### Envoyer vers une autre adresse email

Dans src/mailer.ts, modifier le champ to dans sendEmail :

    to: "destinataire@example.com",


## Structure du projet

    ai-watcher/
    |-- src/
    |   |-- index.ts        Orchestrateur principal (pipeline complet)
    |   |-- watcher.ts      Fetch RSS + filtre IA + deduplication JSON
    |   |-- summarizer.ts   Resumes via Groq API (Llama 3.3 70B)
    |   +-- mailer.ts       Email HTML via Gmail SMTP
    |-- data/
    |   +-- seen.json       Historique de deduplication (genere automatiquement)
    |-- .github/
    |   +-- workflows/
    |       +-- ai-watch.yml
    |-- .env.example
    |-- package.json
    |-- tsconfig.json
    +-- README.md


## Estimation des couts

Groq : entierement gratuit (30 requetes/min, 500 000 tokens/jour sur Llama 3.3 70B)
GitHub Actions : gratuit jusqu'a 2000 min/mois (repos publics) ou 500 min (repos prives)

Le projet consomme environ 10 a 15 minutes de GitHub Actions par jour, soit bien
en dessous des limites gratuites.


## Depannage

"Invalid login" Gmail
  Verifier qu'on utilise bien l'App Password (16 caracteres) et non le mot de passe Gmail.
  La validation en 2 etapes doit etre activee sur le compte.

Aucun email recu
  Lancer npm run dev et observer les logs.
  Verifier le dossier Spam.
  S'assurer que les variables d'environnement sont bien renseignees dans .env.

"GROQ_API_KEY missing"
  Verifier le fichier .env ou les secrets GitHub Actions.

Aucune nouveaute detectee
  Normal si toutes les sources ont deja ete traitees lors d'un run precedent.
  Supprimer data/seen.json pour forcer un nouveau traitement complet.
