import type { BreadcrumbItem } from '$lib/types';

const SLUG_ID_SEPARATOR = '--';

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9\-_.]/g, '');
}

/**
 * Construye un path URL desde breadcrumbs.
 * Muestra solo la primera carpeta y el archivo final (con su ID).
 * Los nombres usan slugs sin tildes ni espacios.
 */
export function buildUrlPath(breadcrumbs: BreadcrumbItem[]): string {
  if (breadcrumbs.length === 0) return '';

  const last = breadcrumbs[breadcrumbs.length - 1];
  const lastSlug = `${slugify(last.name)}${SLUG_ID_SEPARATOR}${last.id}`;

  if (breadcrumbs.length === 1) return lastSlug;

  const first = breadcrumbs[0];
  return `${slugify(first.name)}/${lastSlug}`;
}

/**
 * Extrae el ID de Google Drive del último segmento de una URL.
 * Formato esperado: "nombre-archivo--driveId"
 * Retorna null si no se encuentra el separador.
 */
export function extractIdFromSlug(segment: string): string | null {
  const idx = segment.lastIndexOf(SLUG_ID_SEPARATOR);
  if (idx === -1) return null;
  const id = segment.slice(idx + SLUG_ID_SEPARATOR.length);
  return id.length > 0 ? id : null;
}

/**
 * Parsea un path URL en segmentos decodificados.
 * Filtra segmentos vacíos (doble slash, trailing slash, etc.).
 */
export function parseUrlPath(path: string): string[] {
  return path
    .split('/')
    .map((s) => decodeURIComponent(s))
    .filter((s) => s.length > 0);
}
