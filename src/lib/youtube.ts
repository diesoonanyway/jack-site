const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;

export function getYouTubeVideoId(value: string | undefined): string | null {
  if (!value) return null;

  const input = value.trim();
  if (videoIdPattern.test(input)) return input;

  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

    const host = url.hostname.toLowerCase();
    let id: string | null = null;

    if (host === 'youtu.be' || host === 'www.youtu.be') {
      id = url.pathname.split('/')[1] ?? null;
    } else if (
      host === 'youtube.com' ||
      host === 'www.youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'www.youtube-nocookie.com' ||
      host === 'youtube-nocookie.com'
    ) {
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments[0] === 'watch') id = url.searchParams.get('v');
      if (segments[0] === 'shorts' || segments[0] === 'embed') id = segments[1] ?? null;
    }

    return id && videoIdPattern.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function getYouTubeThumbnailUrl(value: string | undefined): string | null {
  const id = getYouTubeVideoId(value);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}
