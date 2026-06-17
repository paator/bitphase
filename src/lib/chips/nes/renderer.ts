import type { Project } from '../../models/project';
import type { ChipRenderer, RenderOptions } from '../base/renderer';

export class NESChipRenderer implements ChipRenderer {
	async render(
		_project: Project,
		_songIndex: number,
		_onProgress?: (progress: number, message: string) => void,
		_options?: RenderOptions
	): Promise<Float32Array[]> {
		throw new Error('2A03 / 2A07 WAV export is not implemented yet');
	}
}
