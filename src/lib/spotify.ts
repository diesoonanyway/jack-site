const spotifyHost = 'open.spotify.com';
const episodePath = /^\/episode\/([A-Za-z0-9]+)\/?$/;

function getSpotifyUrl(value: string | undefined): URL | null {
  if (!value) return null;

  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && url.hostname.toLowerCase() === spotifyHost
      ? url
      : null;
  } catch {
    return null;
  }
}

export function getSpotifyEpisodeId(value: string | undefined): string | null {
  const url = getSpotifyUrl(value);
  return url?.pathname.match(episodePath)?.[1] ?? null;
}

export function getSpotifyExternalUrl(value: string | undefined): string | null {
  return getSpotifyUrl(value)?.href ?? null;
}

export function getSafeExternalAudioUrl(value: string | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
