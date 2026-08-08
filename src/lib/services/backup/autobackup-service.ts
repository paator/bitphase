import type { Project } from '../../models/project';
import { FileExportService } from '../file/project/file-export';
import { FileImportService } from '../file/project/file-import';

const DB_NAME = 'bitphase';
const DB_VERSION = 1;
const STORE_NAME = 'autobackup';
const KEY_LATEST = 'latest';

export interface AutobackupEntry {
	timestamp: number;
	data: ArrayBuffer;
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);
		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME);
			}
		};
	});
}

let saveInProgress = false;
let pendingProject: Project | null = null;

async function writeToDb(project: Project): Promise<void> {
	const serialized = FileExportService.serializeProject(project);
	const blob = await FileExportService.compressData(serialized);
	const data = await blob.arrayBuffer();
	const entry: AutobackupEntry = { timestamp: Date.now(), data };

	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);
		const request = store.put(entry, KEY_LATEST);
		request.onerror = () => {
			db.close();
			reject(request.error);
		};
		request.onsuccess = () => {
			db.close();
			resolve();
		};
	});
}

async function runSaveQueue(project: Project): Promise<void> {
	if (saveInProgress) {
		pendingProject = project;
		return;
	}
	saveInProgress = true;
	try {
		await writeToDb(project);
	} finally {
		saveInProgress = false;
		const next = pendingProject;
		pendingProject = null;
		if (next) {
			void runSaveQueue(next);
		}
	}
}

export const autobackupService = {
	saveAutobackup(project: Project): void {
		void runSaveQueue(project);
	},

	async getAutobackup(): Promise<Project | null> {
		const db = await openDb();
		const entry = await new Promise<AutobackupEntry | undefined>((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, 'readonly');
			const store = tx.objectStore(STORE_NAME);
			const request = store.get(KEY_LATEST);
			request.onerror = () => {
				db.close();
				reject(request.error);
			};
			request.onsuccess = () => {
				db.close();
				resolve(request.result);
			};
		});

		if (!entry?.data) return null;

		const blob = new Blob([entry.data], { type: 'application/gzip' });
		const text = await FileImportService.decompressData(blob);
		return await FileImportService.reconstructFromJsonAsync(text);
	},

	async clearAutobackup(): Promise<void> {
		const db = await openDb();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, 'readwrite');
			const store = tx.objectStore(STORE_NAME);
			const request = store.delete(KEY_LATEST);
			request.onerror = () => {
				db.close();
				reject(request.error);
			};
			request.onsuccess = () => {
				db.close();
				resolve();
			};
		});
	}
};
