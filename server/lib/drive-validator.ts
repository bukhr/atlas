const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3';

interface FolderCapabilities {
	canAddChildren?: boolean;
	canRemoveChildren?: boolean;
}

/**
 * Verifies that the user has at least Content Manager (fileOrganizer) role
 * on the given folder. Capabilities are checked at folder level, supporting
 * granular permissions (e.g. Content Manager only on a subfolder).
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
	return { allowed, status: allowed ? 200 : 422 };
}
