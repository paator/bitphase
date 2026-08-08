import type { Project } from '../../../models/project';
import { downloadFile, sanitizeFilename } from '../../../utils/file-download';

export class FileExportService {
	static serializeProject(project: Project): string {
		return JSON.stringify(project);
	}

	static async compressData(data: string): Promise<Blob> {
		const encoder = new TextEncoder();
		const uint8Array = encoder.encode(data);
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(uint8Array);
				controller.close();
			}
		});
		const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
		const chunks: Uint8Array[] = [];
		const reader = compressedStream.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
		}
		return new Blob(chunks, { type: 'application/gzip' });
	}

	static async saveProject(project: Project): Promise<void> {
		const serialized = this.serializeProject(project);
		const blob = await this.compressData(serialized);
		const filename = project.name || 'project';
		const sanitizedFilename = sanitizeFilename(filename);
		downloadFile(blob, `${sanitizedFilename}.btp`);
	}
}

export async function handleFileExport(action: string, project: Project): Promise<void> {
	switch (action) {
		case 'save':
			await FileExportService.saveProject(project);
			break;
		default:
			console.warn('Unknown export action:', action);
	}
}
