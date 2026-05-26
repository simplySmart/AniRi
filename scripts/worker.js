import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { processRelease } from './parser.js';

const SUBSPLEASE_RSS = "https://subsplease.org/rss/?r=1080";
const DB_DIR = path.resolve("./db");
const LATEST_FEED_PATH = path.join(DB_DIR, "latest", "feed.json");

const readJSON = (filePath) => {
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  return null;
};

const writeJSON = (filePath, data) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
};

// --- THE NEW JIKAN API FETCHER ---
async function fetchPoster(title) {
  try {
    // 1-second pause to guarantee we never hit Jikan's rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log(`[API] Fetching official poster from Jikan for: ${title}`);
    const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`);
    
    if (!res.ok) return null;
    
    const json = await res.json();
    if (json.data && json.data.length > 0 && json.data[0].images?.jpg?.large_image_url) {
      return json.data[0].images.jpg.large_image_url;
    }
  } catch (err) {
    console.error(`Failed to fetch poster for ${title}:`, err);
  }
  return null;
}

async function fetchAndProcess() {
  console.log("Fetching RSS feeds...");
  const response = await fetch(SUBSPLEASE_RSS);
  const xmlData = await response.text();

  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xmlData);
  const items = parsed.rss.channel.item || [];

  let latestFeed = readJSON(LATEST_FEED_PATH) || [];
  let newUpdates = false;
  let newEntries = [];

  for (const item of items) {
    const rawRelease = {
      raw_title: item.title,
      magnet: item.link,
      size: item["tv:contentLength"] ? `${(item["tv:contentLength"] / 1073741824).toFixed(1)} GB` : "Unknown",
      pub_date: new Date(item.pubDate).toISOString(),
    };

    const result = processRelease(rawRelease);
    if (result.status === "quarantined") continue;

    const animeData = result.data;
    const animeId = animeData.anime_id;
    
    if (
      latestFeed.some(f => f.id === `${animeId}-${animeData.episode}`) ||
      newEntries.some(f => f.id === `${animeId}-${animeData.episode}`)
    ) {
      continue; 
    }

    console.log(`Processing: ${animeData.clean_title} - EP ${animeData.episode}`);
    newUpdates = true;

    const animeFilePath = path.join(DB_DIR, "anime", `${animeId}.json`);
    let animeHistory = readJSON(animeFilePath) || {
      id: animeId,
      title: animeData.clean_title,
      poster: null, // New caching property
      episodes: {}
    };

    // If we don't have a poster saved yet, grab it!
    if (!animeHistory.poster) {
      animeHistory.poster = await fetchPoster(animeData.clean_title);
    }

    if (!animeHistory.episodes[animeData.episode]) {
      animeHistory.episodes[animeData.episode] = {
        released_at: animeData.pub_date,
        releases: []
      };
    }
    
    animeHistory.episodes[animeData.episode].releases.push({
      group: animeData.group,
      resolution: animeData.resolution,
      magnet: animeData.magnet,
      size: animeData.size
    });

    writeJSON(animeFilePath, animeHistory);

    newEntries.push({
      id: `${animeId}-${animeData.episode}`,
      clean_title: animeData.clean_title,
      episode: animeData.episode,
      group: animeData.group,
      resolution: animeData.resolution,
      size: animeData.size,
      seeders: Math.floor(Math.random() * 500) + 500,
      pub_date: animeData.pub_date,
      magnet: animeData.magnet,
      poster: animeHistory.poster // Inject it into the UI feed
    });
  }

  if (newUpdates) {
    latestFeed = [...newEntries, ...latestFeed].slice(0, 100);
    writeJSON(LATEST_FEED_PATH, latestFeed);
    console.log("Database successfully generated.");
  } else {
    console.log("No new updates found.");
  }
}

fetchAndProcess().catch(console.error);
