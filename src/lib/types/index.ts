/**
 * Tipos TypeScript para la aplicación
 */

// Archivo de Google Drive
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
  size?: string;
  owners?: Array<{
    displayName: string;
    emailAddress: string;
    photoLink?: string;
  }>;
  lastModifyingUser?: {
    displayName: string;
    emailAddress: string;
    photoLink?: string;
  };
  description?: string;
  shortcutDetails?: {
    targetId: string;
    targetMimeType: string;
  };
}

export interface DriveFileOwner {
  displayName: string;
  emailAddress: string;
  photoLink?: string;
}

// Nodo aplanado para virtualización del tree view
export interface FlatNode {
  id: string;
  name: string;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  isLoading: boolean;
  parentId: string | null;
  data: DriveFile;
}

// Tipos de archivo soportados
export type FileType =
  | 'folder'
  | 'shortcut'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'form'
  | 'drawing'
  | 'pdf'
  | 'image'
  | 'video'
  | 'audio'
  | 'text'
  | 'code'
  | 'archive'
  | 'font'
  | 'data'
  | 'executable'
  | 'design'
  | 'unknown';

// Tab de documento de Google Docs
export interface DocumentTab {
  tabId: string;
  title: string;
  index?: number;
  childTabs?: DocumentTab[];
}

// Documento de Google Docs con tabs
export interface DocsDocument {
  documentId: string;
  title: string;
  tabs: DocumentTab[];
}

// Item de favoritos
export interface FavoriteItem {
  id: string;
  name: string;
  mimeType: string;
  parentName?: string | null;
  addedAt: string; // ISO string
}

// Resultado de búsqueda
export interface SearchResult {
  files: DriveFile[];
  nextPageToken?: string;
}

// Resultado de listado de archivos
export interface ListFilesResult {
  files: DriveFile[];
  nextPageToken?: string;
}

// Estado de carga genérico
export interface LoadingState {
  isLoading: boolean;
  error: string | null;
  progress?: number;
}

// Entrada de caché
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

// Estadísticas del tree
export interface TreeStats {
  totalFiles: number;
  totalFolders: number;
  expandedCount: number;
  loadedFolders: number;
}

// Breadcrumb item
export interface BreadcrumbItem {
  id: string;
  name: string;
}

// Usuario autenticado
export interface AuthUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

// Respuesta de orden de carpeta (Redis)
export interface FolderOrderResponse {
  order: string[] | null;
}

