export interface FolderOrder {
	order: string[];
	updatedAt: string;
	updatedBy?: string;
}

export interface Session {
	userId: string;
	email: string;
	name: string;
	picture: string;
	refreshToken: string;
	createdAt: string;
	lastUsedAt: string;
}

export interface StorageAdapter {
	readOrder(folderId: string): Promise<FolderOrder | null>;
	writeOrder(folderId: string, data: FolderOrder): Promise<void>;

	getSession(userId: string): Promise<Session | null>;
	saveSession(session: Session): Promise<void>;
	deleteSession(userId: string): Promise<void>;

	invalidateOrderCache?(folderId: string): Promise<void>;
}
