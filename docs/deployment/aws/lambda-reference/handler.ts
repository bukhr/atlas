import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { checkCapabilities } from './services/drive-validator.js';
import { readOrder, writeOrder } from './services/s3-service.js';
import { invalidateCache } from './services/cloudfront-service.js';
import { exchangeCode, refreshAccessToken, revokeToken, getUserInfo } from './services/google-oauth-service.js';
import { signSessionJwt, verifySessionJwt } from './services/jwt-service.js';
import { saveSession, deleteSession, touchSession } from './services/session-service.js';

function extractToken(event: APIGatewayProxyEventV2): string | null {
  const auth = event.headers['authorization'] ?? event.headers['Authorization'];
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

function extractFolderId(event: APIGatewayProxyEventV2): string | null {
  return event.pathParameters?.folderId ?? null;
}

function jsonResponse(statusCode: number, body: Record<string, unknown>): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  // Auth routes
  if (path === '/api/auth/token' && method === 'POST') return handleAuthToken(event);
  if (path === '/api/auth/refresh' && method === 'POST') return handleAuthRefresh(event);
  if (path === '/api/auth/revoke' && method === 'POST') return handleAuthRevoke(event);

  // Folder order routes
  if (path.startsWith('/api/folder-order/')) {
    if (method === 'GET') return handleGetFolderOrder(event);
    if (method === 'PUT') return handlePutFolderOrder(event);
  }

  return jsonResponse(404, { error: 'Not found' });
}

// ============================================================
// Auth handlers
// ============================================================

async function handleAuthToken(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  let code: string;
  let redirectUri: string;

  try {
    const body = JSON.parse(event.body ?? '{}');
    code = body.code;
    redirectUri = body.redirectUri;
    if (!code || !redirectUri) {
      return jsonResponse(400, { error: 'Missing code or redirectUri' });
    }
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }

  try {
    // Exchange authorization code for tokens
    const tokens = await exchangeCode(code, redirectUri);

    if (!tokens.refresh_token) {
      console.warn('No refresh_token received from Google — user may need to re-consent');
    }

    // Get user info from Google
    const userInfo = await getUserInfo(tokens.access_token);

    // Save session with refresh token in S3
    await saveSession({
      userId: userInfo.id,
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
      refreshToken: tokens.refresh_token ?? '',
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    });

    // Sign a session JWT
    const jwt = await signSessionJwt({
      sub: userInfo.id,
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
    });

    return jsonResponse(200, {
      jwt,
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
      user: {
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
      },
    });
  } catch (err) {
    console.error('Auth token exchange failed:', err);
    return jsonResponse(401, { error: 'Token exchange failed' });
  }
}

async function handleAuthRefresh(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const token = extractToken(event);
  if (!token) {
    return jsonResponse(401, { error: 'Missing Authorization header' });
  }

  // Verify JWT
  const payload = await verifySessionJwt(token);
  if (!payload) {
    return jsonResponse(401, { error: 'Invalid or expired session' });
  }

  // Touch session (checks inactivity, updates lastUsedAt)
  const session = await touchSession(payload.sub);
  if (!session) {
    return jsonResponse(401, { error: 'Session expired due to inactivity' });
  }

  if (!session.refreshToken) {
    return jsonResponse(401, { error: 'No refresh token available' });
  }

  try {
    // Refresh the Google access token
    const { access_token, expires_in } = await refreshAccessToken(session.refreshToken);

    return jsonResponse(200, {
      accessToken: access_token,
      expiresIn: expires_in,
    });
  } catch (err) {
    console.error('Google token refresh failed:', err);
    // Refresh token likely revoked — clean up session
    await deleteSession(payload.sub);
    return jsonResponse(401, { error: 'Refresh token revoked — please sign in again' });
  }
}

async function handleAuthRevoke(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const token = extractToken(event);
  if (!token) {
    return jsonResponse(401, { error: 'Missing Authorization header' });
  }

  const payload = await verifySessionJwt(token);
  if (!payload) {
    return jsonResponse(401, { error: 'Invalid or expired session' });
  }

  try {
    const session = await touchSession(payload.sub);
    if (session?.refreshToken) {
      await revokeToken(session.refreshToken);
    }
    await deleteSession(payload.sub);
  } catch (err) {
    console.error('Revocation error (non-blocking):', err);
    // Best effort — always delete the session
    try { await deleteSession(payload.sub); } catch { /* ignore */ }
  }

  return jsonResponse(200, { success: true });
}

// ============================================================
// Folder order handlers
// ============================================================

async function handleGetFolderOrder(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const folderId = extractFolderId(event);
  if (!folderId) {
    return jsonResponse(400, { error: 'Missing folderId' });
  }

  try {
    const data = await readOrder(folderId);
    if (!data) {
      return jsonResponse(404, { error: 'No custom order' });
    }
    return jsonResponse(200, { order: data.order });
  } catch (err) {
    console.error('Failed to read order from S3:', err);
    return jsonResponse(500, { error: 'Failed to read order' });
  }
}

async function handlePutFolderOrder(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  // 1. Extract and validate token
  const rawToken = extractToken(event);
  if (!rawToken) {
    return jsonResponse(401, { error: 'Missing or invalid Authorization header' });
  }

  // 2. Extract folderId
  const folderId = extractFolderId(event);
  if (!folderId) {
    return jsonResponse(400, { error: 'Missing folderId' });
  }

  // 3. Parse and validate body
  let order: string[];
  try {
    const body = JSON.parse(event.body ?? '{}');
    order = body.order;
    if (!Array.isArray(order) || !order.every((id: unknown) => typeof id === 'string')) {
      return jsonResponse(400, { error: 'order must be an array of strings' });
    }
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }

  // 4. Resolve Google access token (JWT or legacy direct token)
  let googleAccessToken: string;

  const jwtPayload = await verifySessionJwt(rawToken);
  if (jwtPayload) {
    // New flow: JWT session — get a fresh Google access token via refresh
    const session = await touchSession(jwtPayload.sub);
    if (!session?.refreshToken) {
      return jsonResponse(401, { error: 'Session expired' });
    }
    try {
      const { access_token } = await refreshAccessToken(session.refreshToken);
      googleAccessToken = access_token;
    } catch {
      await deleteSession(jwtPayload.sub);
      return jsonResponse(401, { error: 'Failed to refresh Google token' });
    }
  } else {
    // Legacy flow: treat as raw Google access token (backward compatibility)
    googleAccessToken = rawToken;
  }

  // 5. Validate capabilities against Google Drive API
  // Usa 422 para permisos denegados (CloudFront CustomErrorResponses intercepta 403 → 200)
  const { allowed, status } = await checkCapabilities(googleAccessToken, folderId);
  if (!allowed) {
    const error = status === 401
      ? 'Invalid or expired Google token'
      : 'No permission to reorder this folder';
    return jsonResponse(status, { error });
  }

  // 6. Write order to S3
  try {
    await writeOrder(folderId, order);
  } catch (err) {
    console.error('Failed to write order to S3:', err);
    return jsonResponse(500, { error: 'Failed to save order' });
  }

  // 7. Invalidate CloudFront cache
  try {
    await invalidateCache(folderId);
  } catch (err) {
    console.error('Failed to invalidate CloudFront cache:', err);
  }

  return jsonResponse(200, { success: true });
}
