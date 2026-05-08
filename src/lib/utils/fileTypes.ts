/**
 * Utilidades para manejo de tipos de archivo
 */

import type { FileType } from '$lib/types';
import {
  Folder,
  FileText,
  Table2,
  Presentation,
  Pencil,
  FileImage,
  File,
  FileCode,
  FileArchive,
  FileType as FileTypeIcon,
  FileMusic,
  Video,
  FileTerminal,
  Palette,
  Link2,
  type Icon
} from 'lucide-svelte';

// Mapeo de MIME types a tipos de archivo
const mimeTypeMap: Record<string, FileType> = {
  // Google Workspace
  'application/vnd.google-apps.folder': 'folder',
  'application/vnd.google-apps.shortcut': 'shortcut',
  'application/vnd.google-apps.document': 'document',
  'application/vnd.google-apps.spreadsheet': 'spreadsheet',
  'application/vnd.google-apps.presentation': 'presentation',
  'application/vnd.google-apps.form': 'form',
  'application/vnd.google-apps.drawing': 'drawing',

  // PDF
  'application/pdf': 'pdf',

  // Documentos Office/OpenDocument
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/msword': 'document',
  'application/rtf': 'document',
  'application/vnd.oasis.opendocument.text': 'document',
  'application/epub+zip': 'document',

  // Hojas de cálculo
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'spreadsheet',
  'application/vnd.ms-excel': 'spreadsheet',
  'application/vnd.oasis.opendocument.spreadsheet': 'spreadsheet',
  'text/csv': 'spreadsheet',
  'text/tab-separated-values': 'spreadsheet',

  // Presentaciones
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'presentation',
  'application/vnd.ms-powerpoint': 'presentation',
  'application/vnd.oasis.opendocument.presentation': 'presentation',

  // Archivos comprimidos
  'application/zip': 'archive',
  'application/x-rar-compressed': 'archive',
  'application/x-7z-compressed': 'archive',
  'application/gzip': 'archive',
  'application/x-tar': 'archive',
  'application/x-bzip2': 'archive',

  // Diseño
  'image/vnd.adobe.photoshop': 'design',
  'application/postscript': 'design',
  'image/x-dxf': 'design',

  // Código
  'application/javascript': 'code',
  'application/typescript': 'code',
  'text/javascript': 'code',
  'text/x-python': 'code',
  'text/x-java-source': 'code',

  // Datos
  'application/json': 'data',
  'application/xml': 'data',
  'text/xml': 'data',
  'text/yaml': 'data',
  'application/x-yaml': 'data',
  'application/sql': 'data',

  // Fuentes
  'font/ttf': 'font',
  'font/otf': 'font',
  'font/woff': 'font',
  'font/woff2': 'font',

  // Ejecutables
  'application/x-executable': 'executable',
  'application/x-sh': 'executable',
  'application/x-msdos-program': 'executable'
};

/**
 * Obtener tipo de archivo desde MIME type
 */
export function getFileType(mimeType: string): FileType {
  if (mimeTypeMap[mimeType]) {
    return mimeTypeMap[mimeType];
  }

  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('font/')) return 'font';
  if (mimeType.startsWith('application/x-font')) return 'font';
  if (mimeType.startsWith('text/')) return 'text';

  return 'unknown';
}

// Obtener icono según tipo de archivo
export function getFileIcon(mimeType: string): typeof Icon {
  const type = getFileType(mimeType);

  const iconMap: Record<string, typeof Icon> = {
    folder: Folder,
    shortcut: Link2,
    document: FileText,
    spreadsheet: Table2,
    presentation: Presentation,
    drawing: Pencil,
    pdf: FileText,
    image: FileImage,
    video: Video,
    audio: FileMusic,
    text: FileCode,
    code: FileCode,
    archive: FileArchive,
    font: FileTypeIcon,
    data: FileCode,
    design: Palette,
    executable: FileTerminal,
    unknown: File
  };

  return iconMap[type] || File;
}

/**
 * Obtener color CSS según tipo de archivo
 */
export function getFileColor(mimeType: string): string {
  const type = getFileType(mimeType);

  const colorMap: Record<FileType, string> = {
    folder: 'text-yellow-500',
    shortcut: 'text-sky-500',
    document: 'text-blue-500',
    spreadsheet: 'text-green-500',
    presentation: 'text-orange-500',
    form: 'text-purple-500',
    drawing: 'text-pink-500',
    pdf: 'text-red-500',
    image: 'text-cyan-500',
    video: 'text-rose-500',
    audio: 'text-indigo-500',
    text: 'text-gray-500',
    code: 'text-emerald-500',
    archive: 'text-amber-600',
    font: 'text-violet-500',
    data: 'text-teal-500',
    design: 'text-fuchsia-500',
    executable: 'text-slate-600',
    unknown: 'text-gray-400'
  };

  return colorMap[type];
}

/**
 * Verificar si es una carpeta
 */
export function isFolder(mimeType: string): boolean {
  return mimeType === 'application/vnd.google-apps.folder';
}

/**
 * Verificar si es un documento de Google
 */
export function isGoogleDoc(mimeType: string): boolean {
  return mimeType === 'application/vnd.google-apps.document';
}

function buildDocPreviewUrl(docId: string, tabId?: string): string {
  const url = new URL(`https://docs.google.com/document/d/${docId}/preview`);
  if (tabId) url.searchParams.set('tab', tabId);
  return url.toString();
}

/**
 * Obtener URL de preview para Google Drive
 */
export function getPreviewUrl(file: { id: string; mimeType: string; shortcutDetails?: { targetId: string; targetMimeType: string } }): string {
  const resolved = file.mimeType === 'application/vnd.google-apps.shortcut' && file.shortcutDetails
    ? { id: file.shortcutDetails.targetId, mimeType: file.shortcutDetails.targetMimeType }
    : file;

  const type = getFileType(resolved.mimeType);

  switch (type) {
    case 'document':
      return buildDocPreviewUrl(resolved.id);
    case 'spreadsheet':
      return `https://docs.google.com/spreadsheets/d/${resolved.id}/preview`;
    case 'presentation':
      return `https://docs.google.com/presentation/d/${resolved.id}/preview`;
    case 'form':
      return `https://docs.google.com/forms/d/${resolved.id}/viewform?embedded=true`;
    case 'drawing':
      return `https://docs.google.com/drawings/d/${resolved.id}/preview`;
    default:
      return `https://drive.google.com/file/d/${resolved.id}/preview`;
  }
}

/**
 * Obtener URL de preview con tab específico para Google Docs
 */
export function getDocPreviewUrlWithTab(docId: string, tabId?: string): string {
  return buildDocPreviewUrl(docId, tabId);
}
