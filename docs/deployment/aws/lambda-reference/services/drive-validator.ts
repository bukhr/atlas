const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3';

interface FolderCapabilities {
  canAddChildren?: boolean;
  canRemoveChildren?: boolean;
}

/**
 * Verifica que el usuario tenga al menos rol Content Manager (fileOrganizer)
 * en la carpeta específica. Chequea capabilities a nivel de carpeta, lo que
 * permite permisos granulares (ej: Content Manager solo en una subcarpeta).
 *
 * Capabilities relevantes a nivel de carpeta:
 *   Manager / Content Manager → canAddChildren=true, canRemoveChildren=true
 *   Contributor (writer)      → canAddChildren=false
 *   Viewer (reader)           → canAddChildren=false
 */
export async function checkCapabilities(
  token: string,
  folderId: string
): Promise<{ allowed: boolean; status: number }> {
  const url = `${GOOGLE_DRIVE_API}/files/${folderId}?fields=capabilities(canAddChildren,canRemoveChildren)&supportsAllDrives=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    return { allowed: false, status: 401 };
  }
  if (!res.ok) {
    return { allowed: false, status: 422 };
  }

  const data = (await res.json()) as { capabilities?: FolderCapabilities };
  const caps = data.capabilities ?? {};

  const allowed = !!(caps.canAddChildren || caps.canRemoveChildren);
  console.log('Folder capabilities check:', { folderId, caps, allowed });
  // 422 en vez de 403 porque CloudFront CustomErrorResponses intercepta 403 y lo convierte en 200
  return { allowed, status: allowed ? 200 : 422 };
}
