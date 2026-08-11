export class PsgFormatError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PsgFormatError';
	}
}

export const PSG_REGISTER_COUNT = 14;

export type PsgFrame = {
	registers: number[];
	writeMask: number;
};

const PSG_MAGIC = [0x50, 0x53, 0x47, 0x1a];
const PSG_HEADER_SIZE = 16;
const PSG_END_OF_DATA = 0xfd;
const PSG_MULTIPLE_FRAMES = 0xfe;
const PSG_END_OF_FRAME = 0xff;
const PSG_BULBA_REPEAT_UNIT = 4;
const PSG_SINGLE_REPEAT_UNIT = 1;
const PSG_REGISTER_SLOTS = 16;
const PSG_ENVELOPE_SHAPE_REGISTER = 13;
const PSG_NO_WRITE = 0xff;

export function hasPsgMagic(buffer: ArrayBuffer): boolean {
	if (buffer.byteLength < PSG_HEADER_SIZE) {
		return false;
	}
	const bytes = new Uint8Array(buffer, 0, PSG_MAGIC.length);
	return PSG_MAGIC.every((value, index) => bytes[index] === value);
}

export function decodePsgFrames(
	data: Uint8Array,
	repeatUnit: number = PSG_BULBA_REPEAT_UNIT
): PsgFrame[] {
	if (data.length < PSG_HEADER_SIZE) {
		throw new PsgFormatError('Frame data is smaller than the PSG header');
	}
	if (PSG_MAGIC.some((value, index) => data[index] !== value)) {
		throw new PsgFormatError('Frame data is not a Bulba PSG stream');
	}

	const frames: PsgFrame[] = [];
	const registers = new Array<number>(PSG_REGISTER_SLOTS).fill(0);
	let writeMask = 0;
	let frameOpen = false;
	let offset = PSG_HEADER_SIZE;

	const closeFrame = (mask: number) => {
		frames.push({ registers: registers.slice(0, PSG_REGISTER_COUNT), writeMask: mask });
	};

	while (offset < data.length) {
		const marker = data[offset++]!;

		if (marker === PSG_END_OF_DATA) {
			break;
		}

		if (marker === PSG_END_OF_FRAME) {
			if (frameOpen) {
				closeFrame(writeMask);
				writeMask = 0;
			}
			frameOpen = true;
			continue;
		}

		if (marker === PSG_MULTIPLE_FRAMES) {
			if (offset >= data.length) {
				throw new PsgFormatError('Truncated PSG multiple-frame marker');
			}
			const repeats = data[offset++]! * repeatUnit;
			if (frameOpen) {
				closeFrame(writeMask);
				writeMask = 0;
			}
			for (let index = 1; index < repeats; index++) {
				closeFrame(0);
			}
			frameOpen = true;
			continue;
		}

		if (marker >= PSG_REGISTER_SLOTS) {
			throw new PsgFormatError(`Invalid PSG register index ${marker}`);
		}
		if (offset >= data.length) {
			throw new PsgFormatError('Truncated PSG register write');
		}
		const value = data[offset++]!;
		frameOpen = true;
		if (marker === PSG_ENVELOPE_SHAPE_REGISTER && value === PSG_NO_WRITE) {
			continue;
		}
		registers[marker] = value;
		writeMask |= 1 << marker;
	}

	if (frameOpen) {
		closeFrame(writeMask);
	}

	if (frames.length === 0) {
		throw new PsgFormatError('PSG stream decoded to zero frames');
	}

	return frames;
}

export function decodePsgFramesForTrack(data: Uint8Array, frameCount: number): PsgFrame[] {
	const bulba = decodePsgFrames(data, PSG_BULBA_REPEAT_UNIT);
	if (bulba.length === frameCount) {
		return bulba;
	}
	const single = decodePsgFrames(data, PSG_SINGLE_REPEAT_UNIT);
	return single.length === frameCount ? single : bulba;
}

export function fitFrameCount(frames: PsgFrame[], frameCount: number): PsgFrame[] {
	if (frames.length === frameCount) {
		return frames;
	}
	if (frames.length > frameCount) {
		return frames.slice(0, frameCount);
	}
	const filled = frames.slice();
	const last = frames[frames.length - 1]!;
	while (filled.length < frameCount) {
		filled.push({ registers: last.registers.slice(), writeMask: 0 });
	}
	return filled;
}

const PSG_MIXER_REGISTER = 7;
const PSG_MIXER_ALL_DISABLED = 0x3f;

export function createSilentFrames(frameCount: number): PsgFrame[] {
	return Array.from({ length: frameCount }, () => {
		const registers = new Array<number>(PSG_REGISTER_COUNT).fill(0);
		registers[PSG_MIXER_REGISTER] = PSG_MIXER_ALL_DISABLED;
		return { registers, writeMask: 0 };
	});
}
