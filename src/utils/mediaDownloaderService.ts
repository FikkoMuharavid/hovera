export type MediaPlatform = 'tiktok' | 'youtube' | 'instagram' | 'direct' | 'unknown';
export type MediaType = 'video' | 'photo' | 'carousel';

export interface MediaSlide {
  index: number;
  isVideo: boolean;
  displayUrl: string;
  videoUrl?: string;
  shortcode?: string;
}

export interface MediaInfo {
  platform: MediaPlatform;
  mediaType: MediaType;
  url: string;
  title: string;
  author?: string;
  thumbnail?: string;
  duration?: number | string;
  videoUrl?: string;
  hdVideoUrl?: string;
  audioUrl?: string;
  slides?: MediaSlide[];
  photoCount?: number;
  videoCount?: number;
}

export function detectMediaPlatform(rawUrl: string): MediaPlatform {
  if (!rawUrl || typeof rawUrl !== 'string') return 'unknown';
  const url = rawUrl.trim().toLowerCase();

  if (url.includes('tiktok.com') || url.includes('vt.tiktok.com') || url.includes('vm.tiktok.com')) {
    return 'tiktok';
  }
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return 'youtube';
  }
  if (url.includes('instagram.com') || url.includes('instagr.am')) {
    return 'instagram';
  }
  if (/\.(mp4|mp3|m4a|webm|mov|mkv|zip|pdf|png|jpg|jpeg)(\?.*)?$/i.test(url)) {
    return 'direct';
  }
  return 'unknown';
}

/**
 * Extracts YouTube Video ID from any watch, short, or share link
 */
export function extractYouTubeId(url: string): string | null {
  const regExp = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/;
  const match = url.match(regExp);
  return match ? match[1] : null;
}

/**
 * Extracts Instagram shortcode from post or reel link
 */
export function extractInstagramShortcode(rawUrl: string): string | null {
  const match = rawUrl.match(/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/i);
  return match ? match[1] : null;
}

/**
 * Helper to unescape JSON/URL character codes from Instagram embed HTML
 */
function cleanInstagramUrl(str: string): string {
  if (!str) return '';
  return str
    .replace(/\\u0026/g, '&')
    .replace(/\\u00253D/gi, '=')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, g) => String.fromCharCode(parseInt(g, 16)))
    .replace(/\\\//g, '/')
    .replace(/\\/g, '')
    .replace(/&amp;/g, '&');
}

/**
 * Fetches media information and streaming links from multi-tier providers
 */
export async function fetchMediaInfo(rawUrl: string): Promise<MediaInfo | null> {
  const url = rawUrl.trim();
  const platform = detectMediaPlatform(url);

  if (platform === 'tiktok') {
    try {
      const response = await fetch('https://www.tikwm.com/api/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        body: new URLSearchParams({
          url: url,
          count: '12',
          cursor: '0',
          web: '1',
          hd: '1',
        }),
      });

      if (!response.ok) throw new Error('TikWM API request failed');
      const data = await response.json();

      if (data && data.code === 0 && data.data) {
        const item = data.data;
        const playUrl = item.play ? (item.play.startsWith('http') ? item.play : `https://www.tikwm.com${item.play}`) : undefined;
        const hdUrl = item.hdplay ? (item.hdplay.startsWith('http') ? item.hdplay : `https://www.tikwm.com${item.hdplay}`) : undefined;
        const musicUrl = item.music ? (item.music.startsWith('http') ? item.music : `https://www.tikwm.com${item.music}`) : undefined;

        if (item.images && Array.isArray(item.images) && item.images.length > 0) {
          const slides: MediaSlide[] = item.images.map((imgUrl: string, idx: number) => ({
            index: idx + 1,
            isVideo: false,
            displayUrl: imgUrl.startsWith('http') ? imgUrl : `https://www.tikwm.com${imgUrl}`,
          }));

          return {
            platform: 'tiktok',
            mediaType: slides.length > 1 ? 'carousel' : 'photo',
            url,
            title: item.title || 'TikTok Foto',
            author: item.author?.nickname || item.author?.unique_id || 'TikTok Creator',
            thumbnail: slides[0].displayUrl,
            slides,
            photoCount: slides.length,
            audioUrl: musicUrl,
          };
        }

        return {
          platform: 'tiktok',
          mediaType: 'video',
          url,
          title: item.title || 'TikTok Video',
          author: item.author?.nickname || item.author?.unique_id || 'TikTok Creator',
          thumbnail: item.cover || item.origin_cover,
          duration: item.duration ? `${item.duration}s` : undefined,
          videoUrl: playUrl,
          hdVideoUrl: hdUrl,
          audioUrl: musicUrl,
        };
      }
      throw new Error('TikWM code not 0');
    } catch {
      // Fallback
      return {
        platform: 'tiktok',
        mediaType: 'video',
        url,
        title: 'TikTok Video (Siap Diunduh)',
        author: 'TikTok',
      };
    }
  }

  if (platform === 'youtube') {
    const videoId = extractYouTubeId(url);
    if (videoId) {
      const instances = [
        'https://yt.chocolatemoo53.com',
        'https://invidious.nerdvpn.de',
        'https://inv.nadeko.net',
      ];

      for (const instance of instances) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3500);
          const res = await fetch(`${instance}/api/v1/videos/${videoId}`, {
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (res.ok) {
            const json = await res.json();
            const formatStream = (json.formatStreams || []).find((f: any) => f.container === 'mp4');
            const adaptiveAudio = (json.adaptiveFormats || []).find((f: any) => f.type?.includes('audio/mp4'));

            return {
              platform: 'youtube',
              mediaType: 'video',
              url,
              title: json.title || 'YouTube Video',
              author: json.author,
              thumbnail: json.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
              duration: json.lengthSeconds ? `${Math.floor(json.lengthSeconds / 60)}:${String(json.lengthSeconds % 60).padStart(2, '0')}` : undefined,
              videoUrl: formatStream?.url,
              audioUrl: adaptiveAudio?.url,
            };
          }
        } catch {
          // Try next instance
        }
      }

      // If Invidious timed out, return fallback with standard YouTube thumbnail
      return {
        platform: 'youtube',
        mediaType: 'video',
        url,
        title: 'Video YouTube',
        author: 'YouTube',
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      };
    }
  }

  if (platform === 'instagram') {
    const shortcode = extractInstagramShortcode(url);
    if (shortcode && window.electronAPI?.fetchUrlText) {
      try {
        const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
        const rawHtml = await window.electronAPI.fetchUrlText(embedUrl);

        if (rawHtml && rawHtml.length > 500) {
          // 1. Author
          const authorMatch = rawHtml.match(/class=\\"UsernameText\\"[^>]*>([^<]+)<\/a>/i) ||
                              rawHtml.match(/class="UsernameText"[^>]*>([^<]+)<\/a>/i) ||
                              rawHtml.match(/\\"username\\":\\"([^\\"]+)\\"/i) ||
                              rawHtml.match(/"username":"([^"]+)"/i);
          const author = authorMatch ? `@${authorMatch[1]}` : 'Instagram User';

          // 2. Caption
          const captionMatch = rawHtml.match(/class=\\"Caption\\"[^>]*>([\s\S]*?)<\/div>/i) ||
                               rawHtml.match(/class="Caption"[^>]*>([\s\S]*?)<\/div>/i);
          let caption = captionMatch ? captionMatch[1].replace(/<[^>]+>/g, '').trim() : '';
          if (!caption) {
            const textMatch = rawHtml.match(/\\"text\\":\\"([^\\"]+)\\"/i);
            if (textMatch) {
              caption = textMatch[1]
                .replace(/\\n/g, ' ')
                .replace(/\\u([0-9a-fA-F]{4})/g, (_, g) => String.fromCharCode(parseInt(g, 16)))
                .trim();
            }
          }

          // 3. Slides
          const slides: MediaSlide[] = [];
          const sidecarPos = rawHtml.indexOf('edge_sidecar_to_children');

          if (sidecarPos !== -1) {
            const rawBlock = rawHtml.slice(sidecarPos, sidecarPos + 120000);
            const block = rawBlock.split('\\"').join('"');
            const nodeMatches = block.split('{"node":{');

            for (let i = 1; i < nodeMatches.length; i++) {
              const chunk = nodeMatches[i];
              const scMatch = chunk.match(/"shortcode":"([^"]+)"/);
              const videoMatch = chunk.match(/"is_video":(true|false)/);
              const displayMatch = chunk.match(/"display_url":"([^"]+)"/);
              const videoUrlMatch = chunk.match(/"video_url":"([^"]+)"/);

              if (scMatch && displayMatch) {
                slides.push({
                  index: slides.length + 1,
                  shortcode: scMatch[1],
                  isVideo: videoMatch ? videoMatch[1] === 'true' : false,
                  displayUrl: cleanInstagramUrl(displayMatch[1]),
                  videoUrl: videoUrlMatch ? cleanInstagramUrl(videoUrlMatch[1]) : undefined,
                });
              }
            }
          }

          // Single post fallback
          if (slides.length === 0) {
            const unescapedAll = rawHtml.split('\\"').join('"');
            const singleDisplay = unescapedAll.match(/"display_url":"([^"]+)"/i) ||
                                  unescapedAll.match(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/i);
            const singleVideo = unescapedAll.match(/"video_url":"([^"]+)"/i);
            const isVideo = !!singleVideo;
            if (singleDisplay || singleVideo) {
              slides.push({
                index: 1,
                isVideo,
                displayUrl: cleanInstagramUrl(singleDisplay ? singleDisplay[1] : ''),
                videoUrl: singleVideo ? cleanInstagramUrl(singleVideo[1]) : undefined,
                shortcode,
              });
            }
          }

          if (slides.length === 0) {
            return {
              platform: 'instagram',
              mediaType: 'video',
              url,
              title: caption ? caption.slice(0, 55) : `Instagram Reel (${shortcode})`,
              author,
            };
          }

          const photoCount = slides.filter((s) => !s.isVideo).length;
          const videoCount = slides.filter((s) => s.isVideo).length;
          const mediaType: MediaType = slides.length > 1 ? 'carousel' : (slides[0].isVideo ? 'video' : 'photo');

          return {
            platform: 'instagram',
            mediaType,
            url,
            title: caption ? caption.slice(0, 55) : `Instagram Post (${shortcode})`,
            author,
            thumbnail: slides[0].displayUrl,
            slides,
            photoCount,
            videoCount,
            videoUrl: slides[0].videoUrl,
          };
        }
      } catch (e) {
        console.warn('Instagram embed fetch failed:', e);
      }
    }

    return {
      platform: 'instagram',
      mediaType: 'video',
      url,
      title: 'Instagram Post / Reel',
      author: 'Instagram',
    };
  }

  if (platform === 'direct') {
    const filename = url.split('/').pop()?.split('?')[0] || 'berkas_unduhan';
    const isImage = /\.(png|jpe?g|webp|gif)$/i.test(filename);
    return {
      platform: 'direct',
      mediaType: isImage ? 'photo' : 'video',
      url,
      title: decodeURIComponent(filename),
      videoUrl: url,
    };
  }

  return null;
}
