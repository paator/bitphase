export const VGM_VERSION_1_61 = 0x00000161;
export const VGM_HEADER_SIZE = 0x100;
export const VGM_DUAL_CHIP_CLOCK_BIT = 0x40000000;
export const VGM_CMD_AY8910 = 0xa0;
export const VGM_CMD_NES_APU = 0xb4;
export const VGM_CMD_WAIT = 0x61;
export const VGM_CMD_WAIT_735 = 0x62;
export const VGM_CMD_WAIT_882 = 0x63;
export const VGM_CMD_END = 0x66;
export const VGM_AY_TYPE_AY8910 = 0x00;
export const VGM_AY_TYPE_YM2149 = 0x10;
export const VGM_SAMPLE_RATE = 44100;

export type VgmGd3Fields = {
	trackName?: string;
	gameName?: string;
	systemName?: string;
	author?: string;
	releaseDate?: string;
	converter?: string;
	notes?: string;
};

export type EncodeVgmOptions = {
	ayClock?: number;
	ayDual?: boolean;
	ayType?: number;
	nesClock?: number;
	nesDual?: boolean;
	totalSamples: number;
	loopSamples?: number;
	loopDataOffset?: number;
	rateHz: number;
	commands: Uint8Array;
	gd3?: VgmGd3Fields;
};

function writeU32LE(view: DataView, offset: number, value: number): void {
	view.setUint32(offset, value >>> 0, true);
}

function encodeUtf16LeNullTerminated(text: string): number[] {
	const bytes: number[] = [];
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i);
		bytes.push(code & 0xff, (code >> 8) & 0xff);
	}
	bytes.push(0, 0);
	return bytes;
}

export function buildGd3Tag(fields: VgmGd3Fields = {}): Uint8Array {
	const strings = [
		fields.trackName ?? '',
		'',
		fields.gameName ?? '',
		'',
		fields.systemName ?? '',
		'',
		fields.author ?? '',
		'',
		fields.releaseDate ?? '',
		fields.converter ?? 'bitphase',
		fields.notes ?? ''
	];
	const payload: number[] = [];
	for (const value of strings) {
		payload.push(...encodeUtf16LeNullTerminated(value));
	}

	const tag = new Uint8Array(12 + payload.length);
	tag[0] = 0x47;
	tag[1] = 0x64;
	tag[2] = 0x33;
	tag[3] = 0x20;
	const view = new DataView(tag.buffer);
	writeU32LE(view, 4, 0x00000100);
	writeU32LE(view, 8, payload.length);
	tag.set(payload, 12);
	return tag;
}

export function samplesPerInterrupt(interruptFrequency: number): number {
	return Math.max(1, Math.round(VGM_SAMPLE_RATE / interruptFrequency));
}

export function appendWait(commands: number[], sampleWait: number): void {
	let remaining = sampleWait;
	while (remaining >= 882) {
		commands.push(VGM_CMD_WAIT_882);
		remaining -= 882;
	}
	while (remaining >= 735) {
		commands.push(VGM_CMD_WAIT_735);
		remaining -= 735;
	}
	if (remaining > 0) {
		commands.push(VGM_CMD_WAIT, remaining & 0xff, (remaining >> 8) & 0xff);
	}
}

export function appendAyWrite(
	commands: number[],
	register: number,
	value: number,
	chipIndex: 0 | 1 = 0
): void {
	const addr = (register & 0x7f) | (chipIndex === 1 ? 0x80 : 0);
	commands.push(VGM_CMD_AY8910, addr, value & 0xff);
}

export function appendNesWrite(
	commands: number[],
	addressOffset: number,
	value: number,
	chipIndex: 0 | 1 = 0
): void {
	const addr = (addressOffset & 0x7f) | (chipIndex === 1 ? 0x80 : 0);
	commands.push(VGM_CMD_NES_APU, addr, value & 0xff);
}

export function appendRegisterDiffs(
	commands: number[],
	previous: number[],
	next: number[],
	write: (commands: number[], index: number, value: number) => void
): void {
	const length = Math.min(previous.length, next.length);
	for (let i = 0; i < length; i++) {
		if (previous[i] !== next[i]) {
			write(commands, i, next[i]!);
			previous[i] = next[i]!;
		}
	}
}

const NES_LENGTH_REG_BY_ENABLE_BIT = [0x03, 0x07, 0x0b, 0x0f] as const;

export function appendNesRegisterDiffs(
	commands: number[],
	previous: number[],
	next: number[],
	chipIndex: 0 | 1 = 0
): void {
	const prevStatus = previous[0x15] ?? 0;
	const nextStatus = next[0x15] ?? 0;
	const newlyEnabledBits = nextStatus & ~prevStatus & 0x0f;

	if (prevStatus !== nextStatus) {
		appendNesWrite(commands, 0x15, nextStatus, chipIndex);
		previous[0x15] = nextStatus;
	}

	const length = Math.min(previous.length, next.length, 0x15);
	for (let i = 0; i < length; i++) {
		if (previous[i] !== next[i]) {
			appendNesWrite(commands, i, next[i]!, chipIndex);
			previous[i] = next[i]!;
		}
	}

	if (newlyEnabledBits === 0) {
		return;
	}

	for (let bit = 0; bit < NES_LENGTH_REG_BY_ENABLE_BIT.length; bit++) {
		if ((newlyEnabledBits & (1 << bit)) === 0) {
			continue;
		}
		const lengthReg = NES_LENGTH_REG_BY_ENABLE_BIT[bit]!;
		const value = next[lengthReg] ?? 0;
		appendNesWrite(commands, lengthReg, value, chipIndex);
		previous[lengthReg] = value;
	}
}

export function encodeVgm(options: EncodeVgmOptions): ArrayBuffer {
	const gd3 = options.gd3 ? buildGd3Tag(options.gd3) : null;
	const commandBytes = options.commands;
	const endWithTerminator = new Uint8Array(commandBytes.length + 1);
	endWithTerminator.set(commandBytes, 0);
	endWithTerminator[commandBytes.length] = VGM_CMD_END;

	const dataStart = VGM_HEADER_SIZE;
	const gd3OffsetAbsolute = gd3 ? dataStart + endWithTerminator.length : 0;
	const eofAbsolute = gd3
		? gd3OffsetAbsolute + gd3.length
		: dataStart + endWithTerminator.length;

	const buffer = new ArrayBuffer(eofAbsolute);
	const view = new DataView(buffer);
	const bytes = new Uint8Array(buffer);

	bytes[0] = 0x56;
	bytes[1] = 0x67;
	bytes[2] = 0x6d;
	bytes[3] = 0x20;

	writeU32LE(view, 0x04, eofAbsolute - 0x04);
	writeU32LE(view, 0x08, VGM_VERSION_1_61);

	if (gd3) {
		writeU32LE(view, 0x14, gd3OffsetAbsolute - 0x14);
	}
	writeU32LE(view, 0x18, options.totalSamples >>> 0);

	if (options.loopDataOffset != null && options.loopSamples != null && options.loopSamples > 0) {
		writeU32LE(view, 0x1c, options.loopDataOffset - 0x1c);
		writeU32LE(view, 0x20, options.loopSamples >>> 0);
	}

	writeU32LE(view, 0x24, Math.round(options.rateHz) >>> 0);
	writeU32LE(view, 0x34, dataStart - 0x34);

	if (options.ayClock && options.ayClock > 0) {
		let clock = options.ayClock >>> 0;
		if (options.ayDual) {
			clock |= VGM_DUAL_CHIP_CLOCK_BIT;
		}
		writeU32LE(view, 0x74, clock);
		bytes[0x78] = options.ayType ?? VGM_AY_TYPE_AY8910;
	}

	if (options.nesClock && options.nesClock > 0) {
		let clock = options.nesClock >>> 0;
		if (options.nesDual) {
			clock |= VGM_DUAL_CHIP_CLOCK_BIT;
		}
		writeU32LE(view, 0x84, clock);
	}

	bytes.set(endWithTerminator, dataStart);
	if (gd3) {
		bytes.set(gd3, gd3OffsetAbsolute);
	}

	return buffer;
}

export function resolveVgmAyType(chipVariant: unknown, stMixing?: boolean): number {
	if (stMixing === true || chipVariant === 'YM') {
		return VGM_AY_TYPE_YM2149;
	}
	return VGM_AY_TYPE_AY8910;
}
