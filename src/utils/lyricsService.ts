export interface LyricLine {
  time: number; // in seconds
  text: string;
}

export interface LyricResult {
  lines: LyricLine[];
  source: 'synced' | 'plain' | 'none';
}

// In-memory cache with bounded capacity to prevent memory bloat (< 120 entries ~ 60KB)
const MAX_CACHE_SIZE = 150;
const lyricsCache = new Map<string, LyricResult | null>();

function setInCache(key: string, value: LyricResult | null) {
  if (lyricsCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = lyricsCache.keys().next().value;
    if (oldestKey !== undefined) {
      lyricsCache.delete(oldestKey);
    }
  }
  lyricsCache.set(key, value);
}

/**
 * Extracts the primary artist name from a multi-artist credit
 * e.g., "Taylor Swift, Post Malone" -> "Taylor Swift"
 *       "Coldplay & BTS" -> "Coldplay"
 *       "Alan Walker feat. Sabrina Carpenter" -> "Alan Walker"
 */
export function extractPrimaryArtist(artistStr?: string): string {
  if (!artistStr) return '';
  const first = artistStr.split(/,|&|\bfeat\.?\b|\bft\.?\b|\bwith\b|\bx\b|\bvs\.?\b/i)[0];
  return first ? first.trim() : artistStr.trim();
}

/**
 * Clean common title pollution like "(Official Music Video)", "[Audio]", "(feat. ...)", etc.
 * Preserves the actual song title when artist is already known.
 */
export function cleanTrackTitle(
  rawTitle: string,
  rawArtist?: string
): { cleanTitle: string; artistFromTitle?: string } {
  if (!rawTitle) return { cleanTitle: '' };

  let title = rawTitle.trim();
  let artistFromTitle: string | undefined;

  // If no artist was supplied by system, check if title format is "Artist - Title"
  if (!rawArtist || rawArtist.trim().length === 0) {
    if (title.includes(' - ')) {
      const parts = title.split(' - ');
      if (parts.length >= 2) {
        artistFromTitle = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
      }
    }
  }

  // Remove common YouTube/music streaming suffixes, tags, and secondary artists
  title = title
    .replace(/\s*[([](official\s*(music\s*)?video|official\s*audio|lyric\s*video|visualizer|original\s*mix|audio|lyrics)[)\]]/gi, '')
    .replace(/\s*[([](remastered(\s*\d+)?|remaster|live(\s*at\s*.*)?|acoustic|sped\s*up|slowed\s*(\+\s*reverb)?|deluxe(\s*edition)?|radio\s*edit|extended\s*mix)[)\]]/gi, '')
    .replace(/\s*-\s*(remastered(\s*\d+)?|remaster|live(\s*at\s*.*)?|acoustic|sped\s*up|slowed|deluxe|radio\s*edit|extended\s*mix|single|ep)$/gi, '')
    .replace(/\s*[([]feat\..*?[)\]]/gi, '')
    .replace(/\s*[([]ft\..*?[)\]]/gi, '')
    .replace(/\s*[([](with\s+.*?)[)\]]/gi, '')
    .replace(/\s*-\s*with\s+.*$/gi, '')
    .replace(/\s*[([](taylor's\s*version|bonus\s*track|special\s*edition|anniversary|mono|stereo)[)\]]/gi, '')
    .replace(/\s*[([](from\s*(the\s*)?(motion\s*picture|film|soundtrack|series).*?)[)\]]/gi, '')
    .replace(/\s*-\s*(from\s*(the\s*)?(motion\s*picture|film|soundtrack|series).*?)$/gi, '')
    .trim();

  return { cleanTitle: title, artistFromTitle };
}

/**
 * Parses LRC format strings: [mm:ss.xx]Text
 * Filters out Asian and Western studio credit tags (composer, producer, lyricist).
 */
export function parseLrc(lrcContent: string): LyricLine[] {
  if (!lrcContent) return [];
  const lines = lrcContent.split('\n');
  const result: LyricLine[] = [];
  const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)/;
  const isCreditTag = (text: string) =>
    /^(作词|作曲|编曲|制作人|录音|混音|母带|吉他|贝斯|鼓|键盘|和声|written\s*by|produced\s*by|lyrics\s*by|composed\s*by|arranged\s*by)\s*[:：]/i.test(text);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = timeRegex.exec(line);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const msFraction = match[3] ? parseFloat('0.' + match[3]) : 0;
      const time = minutes * 60 + seconds + msFraction;
      const text = match[4].trim();

      if (text.length > 0 && !isCreditTag(text)) {
        result.push({ time, text });
      }
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

/**
 * NetEase Cloud Music query helper
 */
async function queryNeteaseLrc(
  query: string,
  artist: string,
  signal?: AbortSignal
): Promise<LyricResult | null> {
  try {
    const searchUrl = `https://music.163.com/api/search/get?s=${encodeURIComponent(query)}&type=1&offset=0&limit=8`;

    const searchRes = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://music.163.com',
      },
      signal,
    }).catch(() => null);

    if (!searchRes || !searchRes.ok) return null;
    const searchData = await searchRes.json().catch(() => null);
    const songs: any[] = searchData?.result?.songs;
    if (!Array.isArray(songs) || songs.length === 0) return null;

    // Pick candidate: prioritize song that matches primary artist
    let selectedId: number | null = null;
    if (artist) {
      const primary = extractPrimaryArtist(artist).toLowerCase();
      const matchedSong = songs.find((s: any) =>
        s.artists?.some((a: any) => {
          const aName = (a.name || '').toLowerCase();
          return aName.includes(primary) || primary.includes(aName);
        })
      );
      if (matchedSong?.id) {
        selectedId = matchedSong.id;
      }
    }

    if (!selectedId && songs[0]?.id) {
      selectedId = songs[0].id;
    }

    if (!selectedId) return null;

    const lyricUrl = `https://music.163.com/api/song/lyric?id=${selectedId}&lv=1&kv=1&tv=-1`;
    const lyricRes = await fetch(lyricUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://music.163.com',
      },
      signal,
    }).catch(() => null);

    if (!lyricRes || !lyricRes.ok) return null;
    const lyricData = await lyricRes.json().catch(() => null);
    const rawLrc = lyricData?.lrc?.lyric;
    if (typeof rawLrc === 'string' && rawLrc.trim().length > 0) {
      const parsed = parseLrc(rawLrc);
      if (parsed.length > 0) {
        return { lines: parsed, source: 'synced' };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * NetEase Cloud Music Provider with primary artist & clean title fallback
 */
async function fetchFromNetease(
  cleanTitle: string,
  artist: string,
  signal?: AbortSignal
): Promise<LyricResult | null> {
  const primary = extractPrimaryArtist(artist);

  // Pass 1: Clean Title + Primary Artist
  if (primary) {
    const res = await queryNeteaseLrc(`${cleanTitle} ${primary}`, primary, signal);
    if (res && res.lines.length > 0) return res;
  }

  // Pass 2: Clean Title alone
  const resFallback = await queryNeteaseLrc(cleanTitle, primary, signal);
  if (resFallback && resFallback.lines.length > 0) return resFallback;

  return null;
}

/**
 * LRCLIB Provider: Open community LRC database with duration matching
 */
async function fetchFromLrclib(
  cleanTitle: string,
  artist: string,
  durationSecs?: number,
  signal?: AbortSignal
): Promise<LyricResult | null> {
  const primary = extractPrimaryArtist(artist);
  try {
    // 1. Direct match with primary artist
    const getParams = new URLSearchParams({
      track_name: cleanTitle,
      artist_name: primary || artist,
    });
    if (durationSecs && durationSecs > 10) {
      getParams.append('duration', Math.round(durationSecs).toString());
    }

    const directRes = await fetch(`https://lrclib.net/api/get?${getParams.toString()}`, {
      headers: { 'User-Agent': 'Hovera Dynamic Island (https://github.com)' },
      signal,
    }).catch(() => null);

    if (directRes && directRes.ok) {
      const data = await directRes.json().catch(() => null);
      if (data?.syncedLyrics) {
        const parsed = parseLrc(data.syncedLyrics);
        if (parsed.length > 0) {
          return { lines: parsed, source: 'synced' };
        }
      }
    }

    // 2. Search query fallback: title + primary artist
    const query = primary ? `${cleanTitle} ${primary}` : cleanTitle;
    const searchRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Hovera Dynamic Island (https://github.com)' },
      signal,
    }).catch(() => null);

    if (searchRes && searchRes.ok) {
      const items = await searchRes.json().catch(() => null);
      if (Array.isArray(items) && items.length > 0) {
        const candidates = items.filter((it: any) => Boolean(it?.syncedLyrics));
        let bestItem = null;
        if (durationSecs && durationSecs > 10) {
          // Sort candidates by smallest absolute duration difference
          candidates.sort((a: any, b: any) => {
            const diffA = Math.abs((a.duration || 0) - durationSecs);
            const diffB = Math.abs((b.duration || 0) - durationSecs);
            return diffA - diffB;
          });
          if (candidates.length > 0 && Math.abs((candidates[0].duration || 0) - durationSecs) <= 4.0) {
            bestItem = candidates[0];
          }
        }
        if (!bestItem && candidates.length > 0) {
          bestItem = candidates[0];
        }
        if (bestItem?.syncedLyrics) {
          const parsed = parseLrc(bestItem.syncedLyrics);
          if (parsed.length > 0) {
            return { lines: parsed, source: 'synced' };
          }
        }
      }
    }

    // 3. Fallback: Search with cleanTitle only (matched against duration ±3.5s)
    if (primary && durationSecs && durationSecs > 10) {
      const titleOnlyRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle)}`, {
        headers: { 'User-Agent': 'Hovera Dynamic Island (https://github.com)' },
        signal,
      }).catch(() => null);

      if (titleOnlyRes && titleOnlyRes.ok) {
        const items = await titleOnlyRes.json().catch(() => null);
        if (Array.isArray(items) && items.length > 0) {
          const matchedItem = items.find(
            (it: any) => Boolean(it?.syncedLyrics) && Math.abs((it.duration || 0) - durationSecs) <= 3.5
          );
          if (matchedItem?.syncedLyrics) {
            const parsed = parseLrc(matchedItem.syncedLyrics);
            if (parsed.length > 0) {
              return { lines: parsed, source: 'synced' };
            }
          }
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Multi-tier lyrics fetcher with instant NetEase primary search and LRCLIB fallback
 */
export async function fetchLyrics(
  rawTitle: string,
  rawArtist?: string,
  durationSecs?: number,
  signal?: AbortSignal
): Promise<LyricResult | null> {
  const { cleanTitle, artistFromTitle } = cleanTrackTitle(rawTitle, rawArtist);
  const artist = (rawArtist?.trim() || artistFromTitle || '').trim();

  if (!cleanTitle) return null;
  if (signal?.aborted) return null;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return null;
  }

  const durationBucket = durationSecs && durationSecs > 10 ? Math.round(durationSecs) : 0;
  const cacheKey = `${cleanTitle.toLowerCase()}::${artist.toLowerCase()}::${durationBucket}`;
  if (lyricsCache.has(cacheKey)) {
    return lyricsCache.get(cacheKey) || null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6500);

  const onExternalAbort = () => {
    controller.abort();
  };

  if (signal) {
    signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    // 1. Primary Engine: LRCLIB (open Spotify-matched database with exact duration validation)
    const lrclibResult = await fetchFromLrclib(cleanTitle, artist, durationSecs, controller.signal);
    if (lrclibResult && lrclibResult.lines.length > 0) {
      setInCache(cacheKey, lrclibResult);
      return lrclibResult;
    }

    if (signal?.aborted) return null;

    // 2. Secondary Engine / Fallback: NetEase Cloud Music (for tracks not found in LRCLIB)
    const neteaseResult = await fetchFromNetease(cleanTitle, artist, controller.signal);
    if (neteaseResult && neteaseResult.lines.length > 0) {
      setInCache(cacheKey, neteaseResult);
      return neteaseResult;
    }

    if (!signal?.aborted) {
      setInCache(cacheKey, null);
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener('abort', onExternalAbort);
    }
  }
}

/**
 * Efficient binary search to find active lyric line at currentTime
 */
export function getActiveLyric(
  lyrics: LyricLine[],
  currentTime: number
): {
  current: LyricLine | null;
  next: LyricLine | null;
  prev: LyricLine | null;
  index: number;
} {
  if (!lyrics || lyrics.length === 0) {
    return { current: null, next: null, prev: null, index: -1 };
  }

  let low = 0;
  let high = lyrics.length - 1;
  let bestIndex = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lyrics[mid].time <= currentTime) {
      bestIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return {
    current: bestIndex >= 0 ? lyrics[bestIndex] : null,
    next: bestIndex + 1 < lyrics.length ? lyrics[bestIndex + 1] : null,
    prev: bestIndex > 0 ? lyrics[bestIndex - 1] : null,
    index: bestIndex,
  };
}
