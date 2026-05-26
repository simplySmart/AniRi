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

  // 1. Strip bracketed or parenthesized hashes (e.g., [BB8A3538] or (42652d4a))
  cleaned = cleaned.replace(/[\[\(][a-fA-F0-9]{8}[\]\)]/g, '');

  // 1.5. Aggressively strip any standalone 8-character hex strings
  cleaned = cleaned.replace(/\b[a-fA-F0-9]{8}\b/g, '');

  // 2. Strip group tags at the beginning
  cleaned = cleaned.replace(/^\[.*?\]/, '');

  // 3. Lowercase for token verification
  cleaned = cleaned.toLowerCase();

  // 4. Wipe global video tags
  NOISE_TAGS.forEach(tag => {
    const regex = new RegExp(`\\b${tag}\\b|\\[${tag}\\]|\\(${tag}\\)`, 'gi');
    cleaned = cleaned.replace(regex, '');
  });

  // 5. Separate out episode number markers
  cleaned = cleaned.replace(/(?:-|ep|e)\s*\d+(?:\.\d+)?/gi, '');

  // 6. Scrub remaining loose brackets, dots and dashes
  cleaned = cleaned.replace(/[\[\]\(\)\-\._,]/g, ' ').trim();

  return cleaned.replace(/\s+/g, ' ');
}

export function processRelease(rawRelease) {
  const { raw_title } = rawRelease;
  const { group, resolution, episode } = extractMetadata(raw_title);
  const cleanedTitle = cleanAndNormalize(raw_title);

  // Generate valid URL IDs
  const anime_id = cleanedTitle.replace(/\s+/g, '-').replace(/-+$/, '');
  
  // Title capitalization formatting for display
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
