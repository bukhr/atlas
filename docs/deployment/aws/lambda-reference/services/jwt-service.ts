import { SignJWT, jwtVerify, decodeJwt } from 'jose';
import { getJwtSecret } from './secrets-service.js';

const JWT_ISSUER = 'atlas';
const JWT_EXPIRATION = '90d';

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  picture: string;
}

export async function signSessionJwt(payload: JwtPayload): Promise<string> {
  const secret = await getJwtSecret();

  return new SignJWT({
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuer(JWT_ISSUER)
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRATION)
    .sign(secret);
}

export async function verifySessionJwt(token: string): Promise<JwtPayload | null> {
  try {
    const secret = await getJwtSecret();
    const { payload } = await jwtVerify(token, secret, {
      issuer: JWT_ISSUER,
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

/**
 * Decodes a JWT without verification (for extracting user data on the frontend).
 * Only use when the JWT will be verified server-side later.
 */
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
