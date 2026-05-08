// Configuracion de OAuth con Google Identity Services
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Scopes necesarios para Google Drive
export const GOOGLE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/documents.readonly',
  'https://www.googleapis.com/auth/drive.appdata'
].join(' ');

// Margen para renovar el access token antes de que expire (5 minutos)
export const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

// Clave del JWT de sesion en localStorage
export const SESSION_JWT_KEY = 'atlas-jwt';
