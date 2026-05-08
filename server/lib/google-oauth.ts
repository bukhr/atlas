import { config } from '../config.js';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v2/userinfo';

export interface GoogleTokenResponse {
	access_token: string;
	refresh_token?: string;
	expires_in: number;
	token_type: string;
	id_token?: string;
}

export interface GoogleUserInfo {
	id: string;
	email: string;
	name: string;
	picture: string;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<GoogleTokenResponse> {
	const res = await fetch(TOKEN_ENDPOINT, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			client_id: config.googleClientId,
			client_secret: config.googleClientSecret,
			redirect_uri: redirectUri,
		}),
	});

	if (!res.ok) {
		const error = await res.text();
		throw new Error(`Google token exchange failed (${res.status}): ${error}`);
	}

	return res.json();
}

export async function refreshAccessToken(
	refreshToken: string
): Promise<{ access_token: string; expires_in: number }> {
	const res = await fetch(TOKEN_ENDPOINT, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: refreshToken,
			client_id: config.googleClientId,
			client_secret: config.googleClientSecret,
		}),
	});

	if (!res.ok) {
		const error = await res.text();
		throw new Error(`Google token refresh failed (${res.status}): ${error}`);
	}

	const data = (await res.json()) as { access_token: string; expires_in: number };
	return { access_token: data.access_token, expires_in: data.expires_in };
}

export async function revokeToken(token: string): Promise<void> {
	await fetch(`${REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
	});
}

export async function getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
	const res = await fetch(USERINFO_ENDPOINT, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});

	if (!res.ok) {
		throw new Error(`Failed to fetch user info (${res.status})`);
	}

	const data = (await res.json()) as GoogleUserInfo;
	return {
		id: data.id,
		email: data.email,
		name: data.name,
		picture: data.picture,
	};
}
