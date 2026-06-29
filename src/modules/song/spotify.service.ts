import { env } from "../../lib/env.js";
import { AppError } from "../../shared/errors/app-error.js";

type SpotifyToken = {
  access_token: string;
  expires_at: number;
};

type SpotifyTrack = {
  id: string;
  name: string;
  artists: { name: string }[];
  album: {
    name: string;
    images: { url: string; width: number }[];
  };
  external_urls: { spotify: string };
  preview_url: string | null;
};

export type SongSearchResult = {
  spotify_id: string;
  title: string;
  artist: string;
  album: string;
  thumbnail_url: string | null;
  spotify_url: string;
  preview_url: string | null;
};

// token em memória — dura 1h, renovado automaticamente
let cachedToken: SpotifyToken | null = null;

export class SpotifyService {
  private async getToken(): Promise<string> {
    if (cachedToken && cachedToken.expires_at > Date.now()) {
      return cachedToken.access_token;
    }

    if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) {
      throw new AppError(
        "Spotify não configurado neste servidor",
        503,
        "SPOTIFY_UNAVAILABLE",
      );
    }

    const credentials = Buffer.from(
      `${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`,
    ).toString("base64");

    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!res.ok) {
      throw new AppError(
        "Falha ao autenticar com Spotify",
        502,
        "SPOTIFY_AUTH_ERROR",
      );
    }

    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };

    cachedToken = {
      access_token: data.access_token,
      expires_at: Date.now() + (data.expires_in - 60) * 1000, // renova 1min antes
    };

    return cachedToken.access_token;
  }

  async search(query: string, limit = 10): Promise<SongSearchResult[]> {
    const token = await this.getToken();

    const params = new URLSearchParams({
      q: query,
      type: "track",
      limit: String(limit),
      market: "BR",
    });

    const res = await fetch(`https://api.spotify.com/v1/search?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new AppError(
        "Erro ao buscar no Spotify",
        502,
        "SPOTIFY_SEARCH_ERROR",
      );
    }

    const data = (await res.json()) as { tracks: { items: SpotifyTrack[] } };

    return data.tracks.items.map((track) => {
      // pega a menor thumbnail que ainda seja visível (64px ou maior)
      const images = track.album.images.sort((a, b) => a.width - b.width);
      const thumb = images.find((i) => i.width >= 64) ?? images[0];

      return {
        spotify_id: track.id,
        title: track.name,
        artist: track.artists.map((a) => a.name).join(", "),
        album: track.album.name,
        thumbnail_url: thumb?.url ?? null,
        spotify_url: track.external_urls.spotify,
        preview_url: track.preview_url,
      };
    });
  }
}
