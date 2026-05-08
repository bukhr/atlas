import { SignJWT, jwtVerify, decodeJwt } from 'jose';
import { config } from '../config.js';

export interface JwtPayload {
	sub: string;
	email: string;
	name: string;
	picture: string;
}

function secretBytes(): Uint8Array {
	return new TextEncoder().encode(config.jwtSecret);
}

export async function signSessionJwt(payload: JwtPayload): Promise<string> {
	return new SignJWT({
		email: payload.email,
		name: payload.name,
		picture: payload.picture,
	})
		.setProtectedHeader({ alg: 'HS256' })
		.setSubject(payload.sub)
		.setIssuer(config.jwt.issuer)
		.setIssuedAt()
		.setExpirationTime(config.jwt.expiration)
		.sign(secretBytes());
}

export async function verifySessionJwt(token: string): Promise<JwtPayload | null> {
	try {
		const { payload } = await jwtVerify(token, secretBytes(), {
			issuer: config.jwt.issuer,
		});
		return {
			sub: payload.sub!,
			email: payload.email as string,
			name: payload.name as string,
			picture: payload.picture as string,
		};
	} catch {
		return null;
	}
}

export function decodeSessionJwt(token: string): JwtPayload | null {
	try {
		const payload = decodeJwt(token);
		return {
			sub: payload.sub!,
			email: payload.email as string,
			name: payload.name as string,
			picture: payload.picture as string,
		};
	} catch {
		return null;
	}
}
