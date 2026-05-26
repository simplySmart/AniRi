const NOISE_TAGS = [
  "1080p", "720p", "480p", "x265", "hevc", "aac", "webrip", 
  "dual audio", "batch", "end", "v2", "mkv", "mp4"
];

function extractMetadata(rawTitle) {
  let group = "Unknown";
  const groupMatch = rawTitle.match(/^\[(.*?)\]/);
  if (groupMatch) group = groupMatch[1];

  let resolution = "Unknown";
  if (rawTitle.toLowerCase().includes("1080p")) resolution = "1080p";
  else if (rawTitle.toLowerCase().includes("720p")) resolution = "720p";
  else if (rawTitle.toLowerCase().includes("480p")) resolution = "480p";

  let episode = "Unknown";
  const epMatch = rawTitle.match(/(?:-|EP|E)\s*(\d+(?:\.\d+)?)/i);
  if (epMatch) episode = epMatch[1];

  return { group, resolution, episode };
}

function cleanAndNormalize(rawTitle) {
  let cleaned = rawTitle;
  cleaned = cleaned.replace(/[\[\(][a-fA-F0-9]{8}[\]\)]/g, '');
  cleaned = cleaned.replace(/\b[a-fA-F0-9]{8}\b/g, '');
  cleaned = cleaned.replace(/^\[.*?\]/, '');
  cleaned = cleaned.toLowerCase();
  NOISE_TAGS.forEach(tag => {
    const regex = new RegExp(`\\b${tag}\\b|\\[${tag}\\]|\\(${tag}\\)`, 'gi');
    cleaned = cleaned.replace(regex, '');
  });
  cleaned = cleaned.replace(/(?:-|ep|e)\s*\d+(?:\.\d+)?/gi, '');
  cleaned = cleaned.replace(/[\[\]\(\)\-\._,]/g, ' ').trim();
  return cleaned.replace(/\s+/g, ' ');
}

export function processRelease(rawRelease) {
  const { raw_title } = rawRelease;
  const { group, resolution, episode } = extractMetadata(raw_title);
  const cleanedTitle = cleanAndNormalize(raw_title);

  const anime_id = cleanedTitle.replace(/\s+/g, '-').replace(/-+$/, '');
  const clean_title_display = cleanedTitle
    .replace(/\b\w/g, l => l.toUpperCase())
    .trim();

  return {
    status: "success",
    data: {
      anime_id: anime_id,
      clean_title: clean_title_display,
      episode,
      group,
      resolution,
      raw_title,
      magnet: rawRelease.magnet,
      size: rawRelease.size,
      pub_date: rawRelease.pub_date
    }
  };
}
