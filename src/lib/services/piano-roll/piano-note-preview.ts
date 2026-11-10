import type { PatternConverter } from '../../chips/base/adapter';
import type { ChipProcessor, PreviewNoteSupport } from '../../chips/base/processor';
import type { ChipSchema } from '../../chips/base/schema';
import type { Pattern } from '../../models/song';
import type { AudioService } from '../audio/audio-service';
import { PreviewService } from '../audio/preview-service';

export interface PianoPreviewRequest {
	processor: ChipProcessor | undefined;
	songIndex: number;
	pattern: Pattern;
	channelIndex: number;
	row: number;
	schema: ChipSchema;
	converter: PatternConverter;
	previewFullRow: boolean;
	timed: boolean;
}

type PreviewProcessor = ChipProcessor & PreviewNoteSupport;

const TIMED_PREVIEW_MS = 450;

export class PianoNotePreview {
	private readonly previewService = new PreviewService();
	private processor: PreviewProcessor | null = null;
	private channel: number | null = null;
	private timer: number | null = null;

	constructor(private readonly audioService: AudioService) {}

	play(request: PianoPreviewRequest): void {
		const { processor } = request;
		if (!processor || !('playPreviewRow' in processor)) return;
		const previewProcessor = processor as PreviewProcessor;
		this.audioService.setPreviewActiveForChips(request.songIndex);
		const played = this.previewService.playFromContext(
			previewProcessor,
			request.pattern,
			request.channelIndex,
			request.row,
			request.schema,
			request.converter,
			{ previewFullRow: request.previewFullRow, isGlobalField: false }
		);
		if (played !== undefined) {
			this.channel = played;
			this.processor = previewProcessor;
		}
		if (request.timed) this.scheduleStop();
		else this.clearTimer();
	}

	stop(): void {
		this.clearTimer();
		if (this.channel === null) return;
		const processor = this.processor;
		if (processor && 'stopPreviewNote' in processor) {
			this.previewService.stopNote(processor, this.channel === -1 ? undefined : this.channel);
		}
		this.audioService.setPreviewActiveForChips(null);
		this.channel = null;
		this.processor = null;
	}

	private scheduleStop(): void {
		this.clearTimer();
		this.timer = window.setTimeout(() => {
			this.timer = null;
			this.stop();
		}, TIMED_PREVIEW_MS);
	}

	private clearTimer(): void {
		if (this.timer === null) return;
		window.clearTimeout(this.timer);
		this.timer = null;
	}
}
