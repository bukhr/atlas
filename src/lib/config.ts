/**
 * Configuración global de la aplicación
 */

export const config = {
  // Google Drive
  rootFolderId: import.meta.env.VITE_ROOT_FOLDER_ID || 'root',
  appUrl: import.meta.env.PUBLIC_APP_URL || 'http://localhost:3000',

  // Cache configuration (en milisegundos)
  cache: {
    treeStructure: 2 * 60 * 60 * 1000,       // 2 horas
    fileMetadata: 1 * 60 * 60 * 1000,        // 1 horas
    searchResults: 30 * 60 * 1000,           // 30 minutos
    folderOrder: 5 * 60 * 1000,              // 5 minutos
    maxCacheSize: 50 * 1024 * 1024           // 50MB
  },

  // Tree view configuration
  tree: {
    maxDepth: 10,
    pageSize: 1000,
    prefetchDepth: 2,
    virtualItemHeight: 36
  },

  // Google Drive API
  api: {
    baseUrl: 'https://www.googleapis.com/drive/v3',
    docsBaseUrl: 'https://docs.googleapis.com/v1',
    maxRetries: 5,
    baseDelay: 100,
    maxDelay: 10000,
    maxConcurrent: 6
  },

  // Supported MIME types
  supportedMimeTypes: [
    // Google Workspace
    'application/vnd.google-apps.folder',
    'application/vnd.google-apps.shortcut',
    'application/vnd.google-apps.document',
    'application/vnd.google-apps.presentation',
    'application/vnd.google-apps.spreadsheet',
    'application/vnd.google-apps.form',
    'application/vnd.google-apps.drawing',
    // Documents
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/rtf',
    'application/vnd.oasis.opendocument.text',
    'application/epub+zip',
    // Spreadsheets
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.oasis.opendocument.spreadsheet',
    'text/csv',
    'text/tab-separated-values',
    // Presentations
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'application/vnd.oasis.opendocument.presentation',
    // Archives
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'application/gzip',
    'application/x-tar',
    'application/x-bzip2',
    // Design
    'image/vnd.adobe.photoshop',
    'application/postscript',
    'image/x-dxf',
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    // Video
    'video/mp4',
    'video/webm',
    // Audio
    'audio/mpeg',
    'audio/wav',
    // Code
    'application/javascript',
    'application/typescript',
    'text/javascript',
    'text/x-python',
    'text/x-java-source',
    // Data
    'application/json',
    'application/xml',
    'text/xml',
    'text/yaml',
    'application/x-yaml',
    'application/sql',
    // Text
    'text/plain',
    'text/html',
    'text/css',
    // Fonts
    'font/ttf',
    'font/otf',
    'font/woff',
    'font/woff2',
    // Executables
    'application/x-executable',
    'application/x-sh',
    'application/x-msdos-program'
  ]
} as const;

export type Config = typeof config;
