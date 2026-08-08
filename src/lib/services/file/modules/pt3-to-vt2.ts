const PT3_MAGIC_PREFIXES: { prefix: string; minLen: number }[] = [
	{ prefix: 'ProTracker 3.', minLen: 13 },
	{ prefix: 'Vortex Tracker II', minLen: 17 }
];

const MAX_PAT_LEN = 256;
const DEF_PAT_LEN = 64;
const MAX_PAT_NUM = 84;
const MAX_SAM_LEN = 64;
const MAX_ORN_LEN = 255;

const NOTES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

interface SampleTick {
	addToTon: number;
	tonAccumulation: boolean;
	amplitude: number;
	amplitudeSliding: boolean;
	amplitudeSlideUp: boolean;
	envelopeEnabled: boolean;
	envelopeOrNoiseAccumulation: boolean;
	addToEnvelopeOrNoise: number;
	mixerTon: boolean;
	mixerNoise: boolean;
}

interface Ornament {
	loop: number;
	length: number;
	items: number[];
}

interface Sample {
	loop: number;
	length: number;
	items: SampleTick[];
}

interface ChannelLine {
	note: number;
	sample: number;
	ornament: number;
	volume: number;
	envelope: number;
	additionalCommand: { number: number; delay: number; parameter: number };
}

interface PatternLine {
	noise: number;
	envelope: number;
	channel: [ChannelLine, ChannelLine, ChannelLine];
}

interface Pattern {
	length: number;
	items: PatternLine[];
}

interface VTM {
	title: string;
	author: string;
	tonTable: number;
	initialDelay: number;
	chipFreq: number;
	intFreq: number;
	featuresLevel: number;
	vortexModuleHeader: boolean;
	positions: { value: number[]; length: number; loop: number };
	ornaments: (Ornament | null)[];
	samples: (Sample | null)[];
	patterns: (Pattern | null)[];
}

function readU8(data: Uint8Array, offset: number): number {
	return offset < data.length ? data[offset] : 0;
}

function readU16LE(data: Uint8Array, offset: number): number {
	if (offset + 1 >= data.length) return 0;
	return data[offset] | (data[offset + 1] << 8);
}

function readS16LE(data: Uint8Array, offset: number): number {
	const u = readU16LE(data, offset);
	return u > 32767 ? u - 65536 : u;
}

function readString(data: Uint8Array, offset: number, length: number): string {
	let s = '';
	for (let i = 0; i < length && offset + i < data.length; i++) {
		const c = data[offset + i];
		s += c >= 32 ? String.fromCharCode(c) : ' ';
	}
	return s.trimEnd();
}

function int4ToStr(i: number): string {
	if (i === 0) return '....';
	if (i < 16) return '...' + i.toString(16).toUpperCase();
	if (i < 256) return '..' + i.toString(16).toUpperCase().padStart(2, '0');
	if (i < 0x1000) return '.' + i.toString(16).toUpperCase().padStart(3, '0');
	return i.toString(16).toUpperCase().padStart(4, '0');
}

function int2ToStr(i: number): string {
	if (i === 0) return '..';
	if (i < 16) return '.' + i.toString(16).toUpperCase();
	return i.toString(16).toUpperCase().padStart(2, '0');
}

function int1ToStr(i: number): string {
	if (i === 0) return '.';
	return i.toString(16).toUpperCase();
}

function noteToStr(i: number): string {
	if (i === -1) return '---';
	if (i === -2) return 'R--';
	const octave = Math.floor(i / 12) + 1;
	if (octave < 1) return 'C-1';
	if (octave > 8) return 'B-8';
	return NOTES[i % 12] + octave;
}

function sampToStr(i: number): string {
	if (i === 0) return '.';
	if (i < 16) return i.toString(16).toUpperCase();
	return String.fromCharCode('A'.charCodeAt(0) + i - 10);
}

function getSampleString(sl: SampleTick): string {
	let r = sl.mixerTon ? 'T' : '.';
	r += sl.mixerNoise ? 'N' : '.';
	r += sl.envelopeEnabled ? 'E' : '.';
	r += ' ';
	r += sl.addToTon >= 0 ? '+' + sl.addToTon.toString(16).toUpperCase().padStart(3, '0') : '-' + (-sl.addToTon).toString(16).toUpperCase().padStart(3, '0');
	r += sl.tonAccumulation ? '^ ' : '_ ';
	r += sl.addToEnvelopeOrNoise >= 0 ? '+' + (sl.addToEnvelopeOrNoise & 0xff).toString(16).toUpperCase().padStart(2, '0') : '-' + ((-sl.addToEnvelopeOrNoise) & 0xff).toString(16).toUpperCase().padStart(2, '0');
	r += sl.envelopeOrNoiseAccumulation ? '^ ' : '_ ';
	r += sl.amplitude.toString(16).toUpperCase();
	r += sl.amplitudeSliding ? (sl.amplitudeSlideUp ? '+' : '-') : '_';
	return r;
}

function getPatternLineString(pat: Pattern, line: number): string {
	const item = pat.items[line];
	let r = int4ToStr(item.envelope) + '|';
	r += int2ToStr(item.noise) + '|';
	for (let ch = 0; ch < 3; ch++) {
		const c = item.channel[ch];
		r += (ch > 0 ? '|' : '') + noteToStr(c.note) + ' ' + sampToStr(c.sample) + int1ToStr(c.envelope) + int1ToStr(c.ornament) + int1ToStr(c.volume) + ' ';
		r += int1ToStr(c.additionalCommand.number) + int1ToStr(c.additionalCommand.delay) + int2ToStr(c.additionalCommand.parameter);
	}
	return r;
}

function parsePT3(data: Uint8Array): VTM {
	const size = data.length;
	if (size < 0xc9 + 1) {
		throw new Error('PT3 file too small');
	}

	const headerStr = String.fromCharCode(...data.slice(0, Math.min(32, size)));
	const matchedMagic = PT3_MAGIC_PREFIXES.find(
		(m) => headerStr.length >= m.minLen && headerStr.startsWith(m.prefix)
	);
	if (!matchedMagic) {
		const preview = headerStr.replace(/[^\x20-\x7e]/g, '.').slice(0, 32);
		throw new Error(`Invalid PT3 file: wrong magic (got "${preview}")`);
	}

	const isProTracker = matchedMagic.prefix === 'ProTracker 3.';
	let featuresLevel = 1;
	if (isProTracker) {
		const ver = data[13];
		if (ver >= 0x30 && ver <= 0x35) featuresLevel = 0;
		else if (ver >= 0x37 && ver <= 0x39) featuresLevel = 2;
	}

	const vortexModuleHeader = !isProTracker;
	const title = readString(data, 0x1e, 32);
	const author = readString(data, 0x42, 32);
	const tonTable = readU8(data, 0x63);
	const initialDelay = readU8(data, 0x64);
	const loopPosition = readU8(data, 0x66);
	const patternsPointer = readU16LE(data, 0x67);

	const samplePointers: number[] = [];
	for (let i = 0; i < 32; i++) {
		samplePointers.push(readU16LE(data, 0x69 + i * 2));
	}

	const ornamentPointers: number[] = [];
	for (let i = 0; i < 16; i++) {
		ornamentPointers.push(readU16LE(data, 0xa9 + i * 2));
	}

	const positions: number[] = [];
	let pos = 0;
	while (pos < 256 && readU8(data, 0xc9 + pos) !== 255) {
		positions.push(Math.floor(readU8(data, 0xc9 + pos) / 3));
		pos++;
	}

	const vtm: VTM = {
		title,
		author,
		tonTable,
		initialDelay,
		chipFreq: 1773400,
		intFreq: 50,
		featuresLevel,
		vortexModuleHeader,
		positions: { value: [], length: positions.length, loop: loopPosition },
		ornaments: new Array(17).fill(null),
		samples: new Array(32).fill(null),
		patterns: new Array(MAX_PAT_NUM + 2).fill(null)
	};

	for (let i = 1; i <= 15; i++) {
		const ptr = ornamentPointers[i];
		if (ptr === 0 || ptr + 2 >= size) continue;
		const loop = readU8(data, ptr);
		const length = readU8(data, ptr + 1);
		const items: number[] = [];
		for (let j = 0; j < length && ptr + 2 + j < size; j++) {
			let v = readU8(data, ptr + 2 + j);
			if (v > 127) v -= 256;
			items.push(v);
		}
		vtm.ornaments[i] = { loop, length, items };
	}

	for (let i = 1; i <= 31; i++) {
		const ptr = samplePointers[i];
		if (ptr === 0 || ptr + 2 >= size) continue;
		const loop = readU8(data, ptr);
		const length = readU8(data, ptr + 1);
		if (loop > MAX_SAM_LEN - 1 || length > MAX_SAM_LEN) continue;

		const items: SampleTick[] = [];
		for (let j = 0; j < length; j++) {
			const off = ptr + 2 + j * 4;
			if (off + 4 >= size) break;

			const b2 = readU8(data, off);
			const b3 = readU8(data, off + 1);
			let addToEnvelopeOrNoise = (b2 >> 1) & 15;
			if (addToEnvelopeOrNoise & 0x10) addToEnvelopeOrNoise |= 0xf0;
			else addToEnvelopeOrNoise &= 15;
			if (addToEnvelopeOrNoise > 127) addToEnvelopeOrNoise -= 256;

			items.push({
				addToTon: readS16LE(data, off + 2),
				tonAccumulation: (b3 & 0x40) !== 0,
				amplitude: b3 & 0x0f,
				amplitudeSliding: (b2 & 0x80) !== 0,
				amplitudeSlideUp: (b2 & 0x40) !== 0,
				envelopeEnabled: (b2 & 1) === 0,
				envelopeOrNoiseAccumulation: (b3 & 0x20) !== 0,
				addToEnvelopeOrNoise,
				mixerTon: (b3 & 0x10) === 0,
				mixerNoise: (b3 & 0x80) === 0
			});
		}
		vtm.samples[i] = { loop, length, items };
	}

	const chPtr = [0, 0, 0];
	const skip = [1, 1, 1];
	const skipCounter = [1, 1, 1];
	const prevOrn = [0, 0, 0];
	let nsBase = 0;

	function patternInterpreter(vtm: VTM, patNum: number, lnNum: number, chNum: number): void {
		const pat = vtm.patterns[patNum];
		if (!pat) return;

		let ptr = chPtr[chNum];
		let quit = false;

		while (!quit && ptr < size) {
			const op = readU8(data, ptr);
			ptr++;

			if (op >= 0xf0 && op <= 0xff) {
				pat.items[lnNum].channel[chNum].envelope = 15;
				prevOrn[chNum] = op - 0xf0;
				pat.items[lnNum].channel[chNum].ornament = prevOrn[chNum];
				pat.items[lnNum].channel[chNum].sample = readU8(data, ptr) >> 1;
				ptr++;
			} else if (op >= 0xd1 && op <= 0xef) {
				pat.items[lnNum].channel[chNum].sample = op - 0xd0;
			} else if (op === 0xd0) {
				quit = true;
			} else if (op >= 0xc1 && op <= 0xcf) {
				pat.items[lnNum].channel[chNum].volume = op - 0xc0;
			} else if (op === 0xc0) {
				pat.items[lnNum].channel[chNum].note = -2;
				quit = true;
			} else if (op >= 0xb2 && op <= 0xbf) {
				pat.items[lnNum].channel[chNum].envelope = op - 0xb1;
				pat.items[lnNum].channel[chNum].ornament = prevOrn[chNum];
				pat.items[lnNum].envelope = (readU8(data, ptr) << 8) | readU8(data, ptr + 1);
				ptr += 2;
			} else if (op === 0xb1) {
				skip[chNum] = readU8(data, ptr);
				ptr++;
			} else if (op === 0xb0) {
				pat.items[lnNum].channel[chNum].envelope = 15;
				pat.items[lnNum].channel[chNum].ornament = prevOrn[chNum];
			} else if (op >= 0x50 && op <= 0xaf) {
				pat.items[lnNum].channel[chNum].note = op - 0x50;
				quit = true;
			} else if (op >= 0x40 && op <= 0x4f) {
				if (op === 0x40 && pat.items[lnNum].channel[chNum].envelope === 0) {
					pat.items[lnNum].channel[chNum].envelope = 15;
				}
				prevOrn[chNum] = op - 0x40;
				pat.items[lnNum].channel[chNum].ornament = prevOrn[chNum];
			} else if (op >= 0x20 && op <= 0x3f) {
				nsBase = op - 0x20;
			} else if (op >= 0x10 && op <= 0x1f) {
				if (op === 0x10) {
					pat.items[lnNum].channel[chNum].envelope = 15;
				} else {
					pat.items[lnNum].channel[chNum].envelope = op - 0x10;
					pat.items[lnNum].envelope = (readU8(data, ptr) << 8) | readU8(data, ptr + 1);
					ptr += 2;
				}
				pat.items[lnNum].channel[chNum].ornament = prevOrn[chNum];
				pat.items[lnNum].channel[chNum].sample = readU8(data, ptr) >> 1;
				ptr++;
			} else if ((op >= 0x08 && op <= 0x09) || (op >= 0x01 && op <= 0x05)) {
				pat.items[lnNum].channel[chNum].additionalCommand.number = op;
			}
		}

		const cmd = pat.items[lnNum].channel[chNum].additionalCommand;
		const hasBytes = (n: number) => ptr + n <= size;
		if (cmd.number === 1) {
			if (hasBytes(3)) {
				cmd.delay = readU8(data, ptr);
				ptr++;
				const tmp = readS16LE(data, ptr);
				ptr += 2;
				cmd.parameter = tmp < 0 ? -tmp : tmp;
				if (tmp < 0) cmd.number++;
			} else {
				ptr = Math.min(ptr + 3, size);
			}
		} else if (cmd.number === 2) {
			cmd.number++;
			if (hasBytes(5)) {
				cmd.delay = readU8(data, ptr);
				ptr += 3;
				const tmp = readS16LE(data, ptr);
				ptr += 2;
				cmd.parameter = tmp < 0 ? -tmp : tmp;
			} else {
				ptr = Math.min(ptr + 5, size);
			}
		} else if (cmd.number === 3 || cmd.number === 4) {
			cmd.number++;
			if (hasBytes(1)) {
				cmd.parameter = readU8(data, ptr);
				ptr++;
			}
		} else if (cmd.number === 5) {
			cmd.number++;
			if (hasBytes(2)) {
				cmd.parameter = (readU8(data, ptr) << 4) | readU8(data, ptr + 1);
				ptr += 2;
			} else {
				ptr = Math.min(ptr + 2, size);
			}
		} else if (cmd.number === 8) {
			cmd.number++;
			if (hasBytes(3)) {
				cmd.delay = readU8(data, ptr);
				ptr++;
				const tmp = readS16LE(data, ptr);
				ptr += 2;
				cmd.parameter = tmp < 0 ? -tmp : tmp;
				if (tmp < 0) cmd.number++;
			} else {
				ptr = Math.min(ptr + 3, size);
			}
		} else if (cmd.number === 9) {
			cmd.number = 0x0b;
			if (hasBytes(1)) {
				cmd.parameter = readU8(data, ptr);
				ptr++;
			}
		}

		chPtr[chNum] = ptr;
		skipCounter[chNum] = skip[chNum];
	}

	function decodePattern(j: number, jj: number): void {
		if (vtm.patterns[j] !== null) return;

		const items: PatternLine[] = [];
		for (let i = 0; i < MAX_PAT_LEN; i++) {
			items.push({
				noise: 0,
				envelope: 0,
				channel: [
					{ note: -1, sample: 0, ornament: 0, volume: 0, envelope: 0, additionalCommand: { number: 0, delay: 0, parameter: 0 } },
					{ note: -1, sample: 0, ornament: 0, volume: 0, envelope: 0, additionalCommand: { number: 0, delay: 0, parameter: 0 } },
					{ note: -1, sample: 0, ornament: 0, volume: 0, envelope: 0, additionalCommand: { number: 0, delay: 0, parameter: 0 } }
				]
			});
		}

		vtm.patterns[j] = { length: 0, items };

		for (let k = 0; k < 3; k++) {
			prevOrn[k] = 0;
			skipCounter[k] = 1;
			skip[k] = 1;
			chPtr[k] = readU16LE(data, patternsPointer + jj * 6 + k * 2);
		}
		nsBase = 0;

		let i = 0;
		let quit = false;
		while (i < MAX_PAT_LEN && !quit) {
			for (let k = 0; k < 3; k++) {
				skipCounter[k]--;
				if (skipCounter[k] === 0) {
					if (k === 0 && readU8(data, chPtr[0]) === 0) {
						i--;
						quit = true;
						break;
					}
					patternInterpreter(vtm, j, i, k);
				}
			}
			if (!quit && i >= 0) {
				vtm.patterns[j]!.items[i].noise = nsBase;
			}
			i++;
		}
		vtm.patterns[j]!.length = i;
	}

	for (let p = 0; p < positions.length; p++) {
		const j = positions[p];
		vtm.positions.value.push(j);
		decodePattern(j, j);
	}
	vtm.positions.loop = loopPosition;

	return vtm;
}

function vtmToVT2Text(vtm: VTM): string {
	const lines: string[] = [];

	lines.push('[Module]');
	lines.push(vtm.vortexModuleHeader ? 'VortexTrackerII=1' : 'VortexTrackerII=0');
	lines.push('Version=3.' + (5 + vtm.featuresLevel));
	lines.push('Title=' + vtm.title);
	lines.push('Author=' + vtm.author);
	lines.push('NoteTable=' + vtm.tonTable);
	lines.push('ChipFreq=' + vtm.chipFreq);
	lines.push('IntFreq=' + vtm.intFreq);
	lines.push('Speed=' + vtm.initialDelay);
	lines.push('Noise=HEX');
	lines.push('PlayOrder=' + vtm.positions.value.map((v, i) => (i === vtm.positions.loop ? 'L' : '') + v).join(','));
	lines.push('');
	lines.push('');

	for (let i = 1; i <= 15; i++) {
		lines.push('[Ornament' + i + ']');
		const orn = vtm.ornaments[i];
		if (!orn) {
			lines.push('L0');
		} else {
			const parts: string[] = [];
			for (let j = 0; j < orn.items.length; j++) {
				parts.push((j === orn.loop ? 'L' : '') + orn.items[j]);
			}
			lines.push(parts.join(','));
		}
		lines.push('');
	}

	for (let i = 1; i <= 31; i++) {
		lines.push('[Sample' + i + ']');
		const sam = vtm.samples[i];
		if (!sam) {
			lines.push('... +000_ +00_ 0_ L');
		} else {
			for (let j = 0; j < sam.items.length; j++) {
				let line = getSampleString(sam.items[j]);
				if (j === sam.loop) line += ' L';
				lines.push(line);
			}
		}
		lines.push('');
	}

	for (let i = 0; i <= MAX_PAT_NUM; i++) {
		const pat = vtm.patterns[i];
		if (!pat) continue;
		lines.push('[Pattern' + i + ']');
		const len = pat.length > 0 ? pat.length : DEF_PAT_LEN;
		for (let j = 0; j < len; j++) {
			if (j < pat.items.length) {
				lines.push(getPatternLineString(pat, j));
			} else {
				lines.push('....|..|--- .... ....|--- .... ....|--- .... ....');
			}
		}
		lines.push('');
	}

	return lines.join('\n');
}

export function isTurboSoundPT3(buffer: ArrayBuffer): boolean {
	const data = new Uint8Array(buffer);
	if (data.length < 16) return false;
	const footer = data.slice(data.length - 4);
	return footer[0] === 0x30 && footer[1] === 0x32 && footer[2] === 0x54 && footer[3] === 0x53;
}

export function splitTurboSoundPT3(buffer: ArrayBuffer): { module1: ArrayBuffer; module2: ArrayBuffer } {
	const data = new Uint8Array(buffer);
	const footerOffset = data.length - 16;
	const size1 = data[footerOffset + 4] | (data[footerOffset + 5] << 8);
	const size2 = data[footerOffset + 10] | (data[footerOffset + 11] << 8);

	if (size1 + size2 + 16 !== data.length) {
		throw new Error(`TurboSound PT3: module sizes don't match file size (${size1} + ${size2} + 16 != ${data.length})`);
	}

	return {
		module1: buffer.slice(0, size1),
		module2: buffer.slice(size1, size1 + size2)
	};
}

export function convertPT3ToVT2(buffer: ArrayBuffer): string {
	const data = new Uint8Array(buffer);
	const vtm = parsePT3(data);
	return vtmToVT2Text(vtm);
}
