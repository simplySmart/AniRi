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

async function fetchAndProcess() {
  console.log("Fetching RSS feeds...");
  const response = await fetch(SUBSPLEASE_RSS);
  const xmlData = await response.text();

  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xmlData);
  const items = parsed.rss.channel.item || [];

  let latestFeed = readJSON(LATEST_FEED_PATH) || [];
  let newUpdates = false;
  let newEntries = []; // We collect them here first to preserve the correct order

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
    
    // Check if it exists in the OLD feed OR the NEW array we are building
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
      episodes: {}
    };

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

    // Push into our temporary block, preserving the correct descending order
    newEntries.push({
      id: `${animeId}-${animeData.episode}`,
      clean_title: animeData.clean_title,
      episode: animeData.episode,
      group: animeData.group,
      resolution: animeData.resolution,
      size: animeData.size,
      seeders: Math.floor(Math.random() * 500) + 500,
      pub_date: animeData.pub_date,
      magnet: animeData.magnet
    });
  }

  if (newUpdates) {
    // Append the perfectly ordered new entries to the top of the old feed
    latestFeed = [...newEntries, ...latestFeed].slice(0, 100);
    writeJSON(LATEST_FEED_PATH, latestFeed);
    console.log("Database successfully generated.");
  } else {
    console.log("No new updates found.");
  }
}

fetchAndProcess().catch(console.error);
