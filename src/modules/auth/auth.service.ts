import { PrismaClient } from '../../lib/prisma/generated/client.js'
import { env } from '../../lib/env.js'
import type { AuthResponse, AuthUserResponse } from './auth.schema.js'

type GoogleTokenResponse = {
  access_token: string
  id_token: string
}

type GoogleUserInfo = {
  sub: string
  name: string
  email: string
  picture: string
}

export class AuthService {
  constructor(private db: PrismaClient) {}

  getGoogleAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
    })
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  async exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    })

    if (!res.ok) {
      throw new Error('Failed to exchange code for tokens')
    }

    return res.json() as Promise<GoogleTokenResponse>
  }

  async getGoogleUser(accessToken: string): Promise<GoogleUserInfo> {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok) {
      throw new Error('Failed to fetch Google user info')
    }

    return res.json() as Promise<GoogleUserInfo>
  }

  async upsertUser(googleUser: GoogleUserInfo): Promise<AuthUserResponse> {
    const user = await this.db.user.upsert({
      where: { google_id: googleUser.sub },
      update: {
        name: googleUser.name,
        avatar_url: googleUser.picture,
      },
      create: {
        google_id: googleUser.sub,
        email: googleUser.email,
        name: googleUser.name,
        avatar_url: googleUser.picture,
      },
    })

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar_url: user.avatar_url,
    }
  }

  async handleCallback(code: string): Promise<AuthUserResponse> {
    const tokens = await this.exchangeCodeForTokens(code)
    const googleUser = await this.getGoogleUser(tokens.access_token)
    return this.upsertUser(googleUser)
  }
}