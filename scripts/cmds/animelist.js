const axios = require("axios");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Jimp = require("jimp");
const { send } = require("./lib/messenger");

const ANILIST_ENDPOINT = "https://graphql.anilist.co";
const ANILIST_USER_AGENT = "GoatBot-AnimeList/3.0 (Messenger command)";
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_COVER_BYTES = 7 * 1024 * 1024;
const MAX_SYNOPSIS_LENGTH = 125;
const ROTATION_SIZE = 5;
const ROTATION_LIMIT = 500;
const COVER_QUERY = `
  query RecentAnime($page: Int, $since: FuzzyDateInt, $before: FuzzyDateInt) {
    Page(page: $page, perPage: 50) {
      media(
        type: ANIME
        format_in: [TV, TV_SHORT, ONA, OVA]
        status_in: [RELEASING, FINISHED]
        isAdult: false
        startDate_greater: $since
        startDate_lesser: $before
        sort: [POPULARITY_DESC, START_DATE_DESC]
      ) {
        id
        title { romaji english native }
        description(asHtml: false)
        episodes
        status
        season
        seasonYear
        startDate { year month day }
        coverImage { extraLarge large }
        nextAiringEpisode { episode airingAt }
        siteUrl
      }
    }
  }
`;

let apiCache = null;
const rotationByThread = new Map();

function normalizeAnime(item) {
  if (!item || item.id == null) return null;
  const titles = item.title || {};
  const title = [titles.english, titles.romaji, titles.native]
    .find(value => typeof value === "string" && value.trim()) || "Anime sans titre";
  const coverUrl = item.coverImage && (item.coverImage.extraLarge || item.coverImage.large);
  if (!isValidCoverUrl(coverUrl)) return null;
  return {
    id: String(item.id),
    title: cleanText(title, 110),
    description: stripHtml(item.description || ""),
    episodes: item.episodes,
    status: item.status,
    season: item.season,
    seasonYear: item.seasonYear,
    startDate: item.startDate || null,
    nextAiringEpisode: item.nextAiringEpisode || null,
    coverUrl,
    siteUrl: isAniListPage(item.siteUrl) ? item.siteUrl : `https://anilist.co/anime/${encodeURIComponent(String(item.id))}`
  };
}

function isValidCoverUrl(url) {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return parsed.protocol === "https:" && (host === "anilist.co" || host.endsWith(".anilist.co"));
  } catch (_) {
    return false;
  }
}

function isAniListPage(url) {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && (parsed.hostname === "anilist.co" || parsed.hostname.endsWith(".anilist.co")) && parsed.pathname.startsWith("/anime/");
  } catch (_) {
    return false;
  }
}

function stripHtml(value) {
  const entities = {
    amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ",
    rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", mdash: "—", ndash: "–", hellip: "…"
  };
  return String(value || "")
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6])\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
      if (entity[0] === "#") {
        const hex = entity[1].toLowerCase() === "x";
        const number = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
        try { return Number.isFinite(number) ? String.fromCodePoint(number) : " "; }
        catch (_) { return " "; }
      }
      return entities[entity.toLowerCase()] || " ";
    })
    .replace(/[*_`~>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!maxLength || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

async function fetchRecentAnimePool(year = new Date().getFullYear()) {
  const currentYear = Number(year) || new Date().getFullYear();
  if (apiCache && apiCache.year === currentYear && apiCache.expiresAt > Date.now()) {
    return apiCache.items;
  }

  const response = await axios.post(ANILIST_ENDPOINT, {
    query: COVER_QUERY,
    variables: {
      page: 1,
      since: (currentYear - 1) * 10000,
      before: (currentYear + 1) * 10000 + 100
    }
  }, {
    timeout: 18000,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": ANILIST_USER_AGENT
    },
    maxContentLength: 4 * 1024 * 1024
  });

  const payload = response && response.data;
  if (!payload || Array.isArray(payload.errors) && payload.errors.length) {
    const detail = payload && payload.errors && payload.errors[0] && payload.errors[0].message;
    throw new Error(detail || "Réponse AniList invalide.");
  }
  const rawItems = payload.data && payload.data.Page && payload.data.Page.media;
  const unique = new Map();
  for (const raw of Array.isArray(rawItems) ? rawItems : []) {
    const anime = normalizeAnime(raw);
    if (anime && !unique.has(anime.id)) unique.set(anime.id, anime);
  }
  const items = Array.from(unique.values());
  apiCache = { year: currentYear, expiresAt: Date.now() + CACHE_TTL_MS, items };
  return items;
}

function shuffle(items) {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function selectNextBatch(candidates, threadID, year = new Date().getFullYear(), count = ROTATION_SIZE) {
  const pool = Array.isArray(candidates) ? candidates.filter(item => item && item.id != null) : [];
  if (!pool.length) return [];
  const key = String(threadID || "global");
  let state = rotationByThread.get(key);
  if (!state || state.year !== year) state = { year, usedIds: [], lastBatchIds: [] };

  const byId = new Map(pool.map(item => [String(item.id), item]));
  const used = new Set((state.usedIds || []).filter(id => byId.has(String(id))).map(String));
  const lastBatch = new Set((state.lastBatchIds || []).map(String));
  let available = pool.filter(item => !used.has(String(item.id)));

  // Au terme du cycle, recommencer sans reprendre les cinq derniers titres si possible.
  if (available.length < count) {
    const notLastBatch = pool.filter(item => !lastBatch.has(String(item.id)));
    available = notLastBatch.length >= count ? notLastBatch : pool;
    used.clear();
  }

  const chosen = shuffle(available).slice(0, Math.min(count, pool.length));
  const nextUsed = new Set([...used, ...chosen.map(item => String(item.id))]);
  state = {
    year,
    usedIds: Array.from(nextUsed),
    lastBatchIds: chosen.map(item => String(item.id))
  };
  rotationByThread.set(key, state);
  if (rotationByThread.size > ROTATION_LIMIT) {
    rotationByThread.delete(rotationByThread.keys().next().value);
  }
  return chosen;
}

const SEASONS_FR = {
  WINTER: "Hiver", SPRING: "Printemps", SUMMER: "Été", FALL: "Automne"
};
const STATUSES_FR = {
  RELEASING: "En diffusion", FINISHED: "Terminée", NOT_YET_RELEASED: "À venir", HIATUS: "En pause"
};

function formatFuzzyDate(date) {
  if (!date || !date.year) return "non précisée";
  if (!date.month) return String(date.year);
  const d = new Date(Date.UTC(date.year, Math.max(0, date.month - 1), date.day || 1));
  return new Intl.DateTimeFormat("fr-FR", {
    day: date.day ? "numeric" : undefined,
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(d);
}

function formatAiringDate(airingAt) {
  const timestamp = Number(airingAt);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "date inconnue";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC"
  }).format(new Date(timestamp * 1000)) + " UTC";
}

function formatAnime(anime, index, displayYear) {
  const seasonName = SEASONS_FR[anime.season] || "Saison non précisée";
  const seasonYear = anime.seasonYear || displayYear;
  const episodeCount = Number.isFinite(Number(anime.episodes)) && anime.episodes !== null
    ? String(anime.episodes)
    : "non annoncé";
  const status = STATUSES_FR[anime.status] || "Statut non précisé";
  const synopsis = cleanText(anime.description, MAX_SYNOPSIS_LENGTH) || "Synopsis non renseigné sur la fiche.";
  const nextEpisode = anime.nextAiringEpisode && Number.isFinite(Number(anime.nextAiringEpisode.episode))
    ? `\n⏭️ Prochain épisode : #${anime.nextAiringEpisode.episode} — ${formatAiringDate(anime.nextAiringEpisode.airingAt)}`
    : "";
  const badge = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"][index] || `${index + 1}.`;

  return `${badge} ${cleanText(anime.title, 90)}\n📖 Synopsis : ${synopsis}\n🎞️ Épisodes : ${episodeCount} · Saison : ${seasonName} ${seasonYear}\n📅 Première sortie : ${formatFuzzyDate(anime.startDate)} · ${status}${nextEpisode}\n🔗 ${anime.siteUrl}`;
}

async function downloadCover(url) {
  if (!isValidCoverUrl(url)) throw new Error("URL d’affiche non autorisée.");
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 16000,
    maxContentLength: MAX_COVER_BYTES,
    maxBodyLength: MAX_COVER_BYTES,
    headers: { Accept: "image/*", "User-Agent": ANILIST_USER_AGENT, Referer: "https://anilist.co/" }
  });
  const buffer = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data || []);
  if (!buffer.length || buffer.length > MAX_COVER_BYTES) throw new Error("Affiche vide ou trop volumineuse.");
  return Jimp.read(buffer);
}

function getJpegBuffer(image) {
  return new Promise((resolve, reject) => {
    image.quality(86).getBuffer(Jimp.MIME_JPEG, (error, buffer) => {
      if (error) return reject(error);
      if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
        return reject(new Error("La mosaïque JPEG n’a pas été créée correctement."));
      }
      resolve(buffer);
    });
  });
}

async function createPosterCollage(animeList) {
  if (!Array.isArray(animeList) || animeList.length !== ROTATION_SIZE) {
    throw new Error("La mosaïque exige exactement cinq anime.");
  }
  // Promise.all rend le collage tout-ou-rien : ne jamais envoyer une mosaïque incomplète.
  const validPosters = await Promise.all(animeList.map(async anime => ({
    anime,
    image: await downloadCover(anime.coverUrl)
  })));

  const cellWidth = 280;
  const cellHeight = 400;
  const gap = 12;
  const margin = 12;
  const canvasWidth = margin * 2 + cellWidth * 3 + gap * 2;
  const canvasHeight = margin * 2 + cellHeight * 2 + gap;
  const canvas = await Jimp.create(canvasWidth, canvasHeight, 0x111827ff);

  validPosters.forEach(({ image }, index) => {
    image.contain(cellWidth, cellHeight);
    const row = index < 3 ? 0 : 1;
    const column = index < 3 ? index : index - 3;
    const rowWidth = row === 0 ? cellWidth * 3 + gap * 2 : cellWidth * 2 + gap;
    const x = Math.round((canvasWidth - rowWidth) / 2) + column * (cellWidth + gap);
    const y = margin + row * (cellHeight + gap);
    canvas.composite(image, x, y);
  });

  return getJpegBuffer(canvas);
}

function shortError(error) {
  const message = error && (error.message || error.code) || "erreur inconnue";
  return String(message).replace(/\s+/g, " ").slice(0, 120);
}

async function sendPoster(api, message, event, animeList) {
  const imageBuffer = await createPosterCollage(animeList);
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "goat-animelist-"));
  const tempFile = path.join(tempDir, "animelist-covers.jpg");
  try {
    await fs.promises.writeFile(tempFile, imageBuffer);
    await send({ api, message, event }, {
      body: "🖼️ Voici la mosaïque avec les 5 couvertures correspondant aux 5 anime — source : AniList.",
      attachment: fs.createReadStream(tempFile)
    });
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

module.exports = {
  config: {
    name: "animelist",
    version: "3.0.0",
    author: "Diwate",
    description: "Présente 5 anime récents avec synopsis, dates, épisodes et mosaïque d’affiches",
    category: "Anime",
    usages: "animelist",
    role: 0
  },

  // Fonctions exportées pour tester la rotation et le rendu sans requêtes Messenger.
  fetchRecentAnimePool,
  selectNextBatch,
  formatAnime,
  createPosterCollage,
  stripHtml,

  onStart: async function ({ api, message, event }) {
    try {
      const displayYear = new Date().getFullYear();
      const pool = await fetchRecentAnimePool(displayYear);
      if (!pool.length) {
        return send({ api, message, event }, `🎌 AniList n’a trouvé aucune fiche récente avec affiche pour ${displayYear - 1}–${displayYear}. Réessaie plus tard.`);
      }
      if (pool.length < ROTATION_SIZE) {
        return send({ api, message, event }, `🎌 AniList ne fournit que ${pool.length} fiche(s) avec couverture disponible. Je préfère attendre plutôt que d’envoyer une liste ou une mosaïque incomplète.`);
      }

      const animeList = selectNextBatch(pool, event && event.threadID, displayYear, ROTATION_SIZE);
      if (!animeList.length) return send({ api, message, event }, "🎌 Aucun anime n’a pu être sélectionné cette fois.");

      const header = `╭━━━〔 🎌 ANIMÉS RÉCENTS ${displayYear - 1}–${displayYear} 〕━━━╮\n📚 ${animeList.length} fiches sélectionnées — à la prochaine commande, la sélection sera différente.\n\n`;
      const body = animeList.map((anime, index) => formatAnime(anime, index, displayYear)).join("\n\n────────────────────\n\n");
      await send({ api, message, event }, `${header}${body}\n\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n📡 Source des fiches : AniList`);

      try {
        await sendPoster(api, message, event, animeList);
      } catch (error) {
        console.error("[animelist] Mosaïque indisponible :", shortError(error));
        await send({ api, message, event }, `⚠️ La liste est envoyée, mais la mosaïque des affiches a échoué : ${shortError(error)}`);
      }
    } catch (error) {
      console.error("[animelist] Recherche AniList indisponible :", shortError(error));
      return send({ api, message, event }, "❌ AniList est momentanément indisponible. Réessaie dans quelques instants.");
    }
  }
};
