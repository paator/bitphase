import type { Project } from '../../models/project';

export interface RenderOptions {
	separateChannels?: boolean;
	startPatternOrderIndex?: number;
	loopCount?: number;
}

export interface ChipRenderer {
	render(
		project: Project,
		songIndex: number,
		onProgress?: (progress: number, message: string) => void,
		options?: RenderOptions
	): Promise<Float32Array[]>;
}

