import type { NesDpcmCapture } from './nes-register-export';

const NSF_HEADER_SIZE = 0x80;
const NSF_BANK_SIZE = 0x1000;
const NSF_LOAD_ADDRESS = 0x8000;
const NSF_INIT_ADDRESS = 0xf000;
const NSF_PLAY_ADDRESS = 0xf003;
const NSF_SAMPLE_SPACE = 0x3000;
const NSF_STREAM_ORIGIN = 4;
const NSF_5B_COMMAND = 0xfc;
const NSF_BANKS_COMMAND = 0xfd;
const NSF_LOOP_COMMAND = 0xfe;
const NSF_HALT_COMMAND = 0xff;
const NSF_5B_ADDRESS = 0xc000;
const NSF_5B_DATA = 0xe000;
const NSF_EXPANSION_5B = 0x20;
const AY_REGISTER_COUNT = 14;
const NES_LENGTH_REG = [0x03, 0x07, 0x0b, 0x0f] as const;

export type NsfFrame = {
	regs: number[];
	dpcm?: NesDpcmCapture | null;
	lengthReloads?: readonly number[];
	ay?: readonly number[] | null;
	ayEnvelope?: boolean;
};

export type NsfEncodeOptions = {
	title: string;
	artist: string;
	copyright?: string;
	interruptFrequency: number;
	pal: boolean;
	frames: NsfFrame[];
	loopFrame?: number | null;
};

class Asm {
	private readonly bytes: number[] = [];
	private readonly labels = new Map<string, number>();
	private readonly fixups: { pos: number; kind: 'abs' | 'rel'; label: string }[] = [];

	constructor(private readonly origin: number) {}

	private pc(): number {
		return this.origin + this.bytes.length;
	}

	label(name: string): void {
		this.labels.set(name, this.pc());
	}

	private emit(...values: number[]): void {
		this.bytes.push(...values);
	}

	private abs(label: string): void {
		this.emit(0, 0);
		this.fixups.push({ pos: this.bytes.length - 2, kind: 'abs', label });
	}

	private rel(label: string): void {
		this.emit(0);
		this.fixups.push({ pos: this.bytes.length - 1, kind: 'rel', label });
	}

	jmp(label: string): void {
		this.emit(0x4c);
		this.abs(label);
	}

	jsr(label: string): void {
		this.emit(0x20);
		this.abs(label);
	}

	rts(): void {
		this.emit(0x60);
	}

	sei(): void {
		this.emit(0x78);
	}

	ldaImm(value: number): void {
		this.emit(0xa9, value & 0xff);
	}

	ldaZp(addr: number): void {
		this.emit(0xa5, addr & 0xff);
	}

	ldaAbs(addr: number): void {
		this.emit(0xad, addr & 0xff, (addr >> 8) & 0xff);
	}

	ldaIndY(addr: number): void {
		this.emit(0xb1, addr & 0xff);
	}

	ldxZp(addr: number): void {
		this.emit(0xa6, addr & 0xff);
	}

	ldyImm(value: number): void {
		this.emit(0xa0, value & 0xff);
	}

	staZp(addr: number): void {
		this.emit(0x85, addr & 0xff);
	}

	staAbs(addr: number): void {
		this.emit(0x8d, addr & 0xff, (addr >> 8) & 0xff);
	}

	staAbsX(addr: number): void {
		this.emit(0x9d, addr & 0xff, (addr >> 8) & 0xff);
	}

	pha(): void {
		this.emit(0x48);
	}

	pla(): void {
		this.emit(0x68);
	}

	incZp(addr: number): void {
		this.emit(0xe6, addr & 0xff);
	}

	decZp(addr: number): void {
		this.emit(0xc6, addr & 0xff);
	}

	cmpImm(value: number): void {
		this.emit(0xc9, value & 0xff);
	}

	beq(label: string): void {
		this.emit(0xf0);
		this.rel(label);
	}

	bne(label: string): void {
		this.emit(0xd0);
		this.rel(label);
	}

	bcc(label: string): void {
		this.emit(0x90);
		this.rel(label);
	}

	link(): Uint8Array {
		for (const fixup of this.fixups) {
			const address = this.labels.get(fixup.label);
			if (address === undefined) {
				throw new Error(`NSF driver is missing ${fixup.label}`);
			}
			if (fixup.kind === 'abs') {
				this.bytes[fixup.pos] = address & 0xff;
				this.bytes[fixup.pos + 1] = (address >> 8) & 0xff;
				continue;
			}
			const relative = address - (this.origin + fixup.pos + 1);
			if (relative < -128 || relative > 127) {
				throw new Error(`NSF driver branch to ${fixup.label} is out of range`);
			}
			this.bytes[fixup.pos] = relative & 0xff;
		}
		return Uint8Array.from(this.bytes);
	}
}

const PTR = 0x00;
const BANK = 0x02;
const STOPPED = 0x03;
const LOOP_BANK = 0x04;
const LOOP_LO = 0x05;
const LOOP_HI = 0x06;
const TMP = 0x07;
const COUNT = 0x08;

function buildDriver(): Uint8Array {
	const asm = new Asm(NSF_INIT_ADDRESS);
	asm.jmp('init');
	asm.jmp('play');

	asm.label('init');
	asm.sei();
	asm.ldaImm(0);
	asm.staZp(STOPPED);
	asm.staZp(BANK);
	asm.staAbs(0x5ff8);
	asm.ldaAbs(NSF_LOAD_ADDRESS);
	asm.staZp(LOOP_BANK);
	asm.ldaAbs(NSF_LOAD_ADDRESS + 1);
	asm.staZp(LOOP_LO);
	asm.ldaAbs(NSF_LOAD_ADDRESS + 2);
	asm.staZp(LOOP_HI);
	asm.ldaImm(NSF_STREAM_ORIGIN);
	asm.staZp(PTR);
	asm.ldaImm(0x80);
	asm.staZp(PTR + 1);
	asm.jsr('silence');
	asm.rts();

	asm.label('play');
	asm.ldaZp(STOPPED);
	asm.bne('play_done');

	asm.label('read_cmd');
	asm.jsr('fetch');
	asm.cmpImm(NSF_HALT_COMMAND);
	asm.beq('halt');
	asm.cmpImm(NSF_LOOP_COMMAND);
	asm.beq('do_loop');
	asm.cmpImm(NSF_BANKS_COMMAND);
	asm.bne('check_5b');
	asm.jsr('fetch');
	asm.staAbs(0x5ffc);
	asm.jsr('fetch');
	asm.staAbs(0x5ffd);
	asm.jsr('fetch');
	asm.staAbs(0x5ffe);
	asm.jsr('fetch');
	asm.label('check_5b');
	asm.cmpImm(NSF_5B_COMMAND);
	asm.bne('have_count');
	asm.jsr('fetch');
	asm.staZp(COUNT);
	asm.label('write_5b');
	asm.ldaZp(COUNT);
	asm.beq('after_5b');
	asm.jsr('fetch');
	asm.staAbs(NSF_5B_ADDRESS);
	asm.jsr('fetch');
	asm.staAbs(NSF_5B_DATA);
	asm.decZp(COUNT);
	asm.jmp('write_5b');
	asm.label('after_5b');
	asm.jsr('fetch');
	asm.label('have_count');
	asm.staZp(COUNT);

	asm.label('write_pair');
	asm.ldaZp(COUNT);
	asm.beq('play_done');
	asm.jsr('fetch');
	asm.staZp(TMP);
	asm.jsr('fetch');
	asm.ldxZp(TMP);
	asm.staAbsX(0x4000);
	asm.decZp(COUNT);
	asm.jmp('write_pair');

	asm.label('do_loop');
	asm.ldaZp(LOOP_BANK);
	asm.staZp(BANK);
	asm.staAbs(0x5ff8);
	asm.ldaZp(LOOP_LO);
	asm.staZp(PTR);
	asm.ldaZp(LOOP_HI);
	asm.staZp(PTR + 1);
	asm.jmp('read_cmd');

	asm.label('halt');
	asm.ldaImm(1);
	asm.staZp(STOPPED);
	asm.jsr('silence');

	asm.label('play_done');
	asm.rts();

	asm.label('fetch');
	asm.ldyImm(0);
	asm.ldaIndY(PTR);
	asm.pha();
	asm.incZp(PTR);
	asm.bne('fetch_high');
	asm.incZp(PTR + 1);
	asm.label('fetch_high');
	asm.ldaZp(PTR + 1);
	asm.cmpImm(0x90);
	asm.bcc('fetch_done');
	asm.incZp(BANK);
	asm.ldaZp(BANK);
	asm.staAbs(0x5ff8);
	asm.ldaImm(0x80);
	asm.staZp(PTR + 1);
	asm.label('fetch_done');
	asm.pla();
	asm.rts();

	asm.label('silence');
	asm.ldaImm(0);
	asm.staAbs(0x4015);
	asm.ldaImm(7);
	asm.staAbs(NSF_5B_ADDRESS);
	asm.ldaImm(0x3f);
	asm.staAbs(NSF_5B_DATA);
	asm.ldaImm(8);
	asm.staAbs(NSF_5B_ADDRESS);
	asm.ldaImm(0);
	asm.staAbs(NSF_5B_DATA);
	asm.ldaImm(9);
	asm.staAbs(NSF_5B_ADDRESS);
	asm.ldaImm(0);
	asm.staAbs(NSF_5B_DATA);
	asm.ldaImm(10);
	asm.staAbs(NSF_5B_ADDRESS);
	asm.ldaImm(0);
	asm.staAbs(NSF_5B_DATA);
	asm.rts();

	const driver = asm.link();
	if (driver.length > NSF_BANK_SIZE) {
		throw new Error('NSF driver does not fit in one bank');
	}
	return driver;
}

function playbackPeriod(interruptFrequency: number): number {
	const rate = interruptFrequency > 0 ? interruptFrequency : 60;
	return Math.max(1, Math.min(0xffff, Math.round(1_000_000 / rate)));
}

function writeField(target: Uint8Array, offset: number, text: string): void {
	const value = text || '';
	const count = Math.min(31, value.length);
	for (let index = 0; index < count; index++) {
		target[offset + index] = value.charCodeAt(index) & 0xff;
	}
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
	if (left.length !== right.length) return false;
	for (let index = 0; index < left.length; index++) {
		if (left[index] !== right[index]) return false;
	}
	return true;
}

type SamplePlacement = {
	bytes: Uint8Array;
	addrByte: number;
	banks: [number, number, number];
};

function placeSamples(frames: NsfFrame[]): {
	addresses: Map<NesDpcmCapture, SamplePlacement>;
	image: Uint8Array;
} {
	const placements: SamplePlacement[] = [];
	const addresses = new Map<NesDpcmCapture, SamplePlacement>();
	const chunks: { bytes: Uint8Array; offset: number }[] = [];
	let cursor = 0;
	for (const frame of frames) {
		const sample = frame.dpcm;
		const bytes = sample?.bytes;
		if (!sample?.retrigger || !bytes?.length) continue;
		const existing = placements.find((entry) => sameBytes(entry.bytes, bytes));
		if (existing) {
			addresses.set(sample, existing);
			continue;
		}
		const aligned = cursor + ((64 - (cursor % 64)) % 64);
		if (bytes.length > NSF_SAMPLE_SPACE || (aligned & 0xfff) + bytes.length > NSF_SAMPLE_SPACE) {
			throw new Error('DPCM samples do not fit in the NSF');
		}
		const origin = aligned >>> 12;
		const placement: SamplePlacement = {
			bytes,
			addrByte: (aligned & 0xfff) >> 6,
			banks: [origin, origin, origin]
		};
		placements.push(placement);
		addresses.set(sample, placement);
		chunks.push({ bytes, offset: aligned });
		cursor = aligned + bytes.length;
	}
	const sampleBankCount = cursor === 0 ? 0 : Math.ceil(cursor / NSF_BANK_SIZE);
	const lastBank = Math.max(0, sampleBankCount - 1);
	for (const placement of placements) {
		const origin = placement.banks[0];
		placement.banks = [
			Math.min(origin, lastBank),
			Math.min(origin + 1, lastBank),
			Math.min(origin + 2, lastBank)
		];
	}
	const image = new Uint8Array(cursor);
	for (const chunk of chunks) image.set(chunk.bytes, chunk.offset);
	return { addresses, image };
}

function frameWrites(
	previous: number[],
	frame: NsfFrame,
	sampleAddress: number | null
): [number, number][] {
	const next = frame.regs;
	const writes: [number, number][] = [];
	const written = new Set<number>();
	const previousStatus = previous[0x15]! < 0 ? 0 : previous[0x15]!;
	const nextStatus = (next[0x15] ?? 0) & 0xff;
	const retrigger = sampleAddress !== null;
	const lengthRegisters = new Set<number>(NES_LENGTH_REG);

	for (let register = 0; register <= 0x0f; register++) {
		if (lengthRegisters.has(register)) continue;
		const value = next[register];
		if (value == null || value < 0 || previous[register] === value) continue;
		writes.push([register, value & 0xff]);
		written.add(register);
	}

	const lengths: [number, number][] = [];
	const queueLength = (register: number, value: number) => {
		if (written.has(register) || value < 0) return;
		lengths.push([register, value & 0xff]);
		written.add(register);
	};
	for (const register of NES_LENGTH_REG) {
		const value = next[register];
		if (value == null || value < 0 || previous[register] === value) continue;
		queueLength(register, value);
	}
	for (const register of frame.lengthReloads ?? []) {
		const value = next[register];
		if (value == null || value < 0) continue;
		queueLength(register, value);
	}
	const enabled = nextStatus & ~previousStatus & 0x0f;
	for (let bit = 0; bit < NES_LENGTH_REG.length; bit++) {
		if ((enabled & (1 << bit)) === 0) continue;
		queueLength(NES_LENGTH_REG[bit]!, next[NES_LENGTH_REG[bit]!] ?? 0);
	}

	const enablingLength = lengths.some(([register]) => {
		const bit = NES_LENGTH_REG.indexOf(register as (typeof NES_LENGTH_REG)[number]);
		return bit >= 0 && (nextStatus & (1 << bit)) !== 0 && (previousStatus & (1 << bit)) === 0;
	});
	if (retrigger && enablingLength) {
		const status = nextStatus & ~0x10;
		if (previous[0x15] !== status) writes.push([0x15, status]);
	} else if (!retrigger && previous[0x15] !== nextStatus) {
		writes.push([0x15, nextStatus]);
	}
	writes.push(...lengths);

	if (retrigger) {
		writes.push([0x15, nextStatus & ~0x10]);
		const freq = next[0x10];
		if (freq != null && freq >= 0) writes.push([0x10, freq & 0xff]);
		const delta = next[0x11];
		if (delta != null && delta >= 0) writes.push([0x11, delta & 0x7f]);
		writes.push([0x12, sampleAddress & 0xff]);
		const length = next[0x13];
		if (length != null && length >= 0) writes.push([0x13, length & 0xff]);
		writes.push([0x15, nextStatus | 0x10]);
	} else {
		const delta = next[0x11];
		if (delta != null && delta >= 0 && previous[0x11] !== (delta & 0x7f)) {
			writes.push([0x11, delta & 0x7f]);
		}
	}

	if (writes.length >= NSF_5B_COMMAND) {
		throw new Error('NSF frame has too many register writes');
	}
	for (const [register, value] of writes) {
		previous[register] = value;
	}
	return writes;
}

function padBank(data: Uint8Array): Uint8Array {
	const banks = Math.max(1, Math.ceil(data.length / NSF_BANK_SIZE));
	const padded = new Uint8Array(banks * NSF_BANK_SIZE);
	padded.set(data);
	return padded;
}

function padToBanks(data: Uint8Array): Uint8Array {
	if (data.length === 0) return data;
	const banks = Math.ceil(data.length / NSF_BANK_SIZE);
	const padded = new Uint8Array(banks * NSF_BANK_SIZE);
	padded.set(data);
	return padded;
}

function sampleWindow(slot: number, musicBanks: number, sampleBankCount: number): number {
	if (sampleBankCount === 0) return 0;
	return musicBanks + Math.min(slot, sampleBankCount - 1);
}

function sunsoftWrites(previous: number[], frame: NsfFrame): [number, number][] {
	const regs = frame.ay;
	if (regs == null) return [];
	const writes: [number, number][] = [];
	for (let register = 0; register < AY_REGISTER_COUNT; register++) {
		const value = (regs[register] ?? 0) & 0xff;
		const retrigger = register === 13 && Boolean(frame.ayEnvelope);
		if (!retrigger && previous[register] === value) continue;
		writes.push([register, value]);
		previous[register] = value;
	}
	if (writes.length >= NSF_5B_COMMAND) {
		throw new Error('NSF frame has too many register writes');
	}
	return writes;
}

function streamAddress(offset: number): { bank: number; address: number } {
	return {
		bank: offset >>> 12,
		address: NSF_LOAD_ADDRESS + (offset & 0xfff)
	};
}

export function encodeNsf(options: NsfEncodeOptions): Uint8Array {
	if (options.frames.length === 0) {
		throw new Error('Song is empty');
	}
	const loopFrame = options.loopFrame ?? null;
	if (loopFrame != null && (loopFrame < 0 || loopFrame >= options.frames.length)) {
		throw new Error('NSF loop frame is outside the song');
	}

	const { addresses: sampleAddresses, image: sampleImage } = placeSamples(options.frames);
	const samples = padToBanks(sampleImage);
	const sampleBankCount = samples.length / NSF_BANK_SIZE;
	const previous = new Array<number>(0x16).fill(-1);
	const previousAy = new Array<number>(AY_REGISTER_COUNT).fill(-1);
	const stream = [0, 0, 0, 0];
	const frameOffsets: number[] = [];
	const bankFixups: number[] = [];
	for (const frame of options.frames) {
		frameOffsets.push(stream.length);
		const captured = frame.dpcm;
		const placement =
			captured?.retrigger && captured.bytes ? sampleAddresses.get(captured) : undefined;
		const writes = frameWrites(previous, frame, placement ? placement.addrByte : null);
		const ay = sunsoftWrites(previousAy, frame);
		if (placement) {
			stream.push(NSF_BANKS_COMMAND);
			bankFixups.push(stream.length);
			stream.push(placement.banks[0], placement.banks[1], placement.banks[2]);
		}
		if (ay.length > 0) {
			stream.push(NSF_5B_COMMAND, ay.length);
			for (const [register, value] of ay) {
				stream.push(register, value);
			}
		}
		stream.push(writes.length);
		for (const [register, value] of writes) {
			stream.push(register, value);
		}
	}

	if (loopFrame != null) {
		const target = streamAddress(frameOffsets[loopFrame] ?? NSF_STREAM_ORIGIN);
		stream[0] = target.bank;
		stream[1] = target.address & 0xff;
		stream[2] = (target.address >> 8) & 0xff;
		stream.push(NSF_LOOP_COMMAND);
	} else {
		stream.push(NSF_HALT_COMMAND);
	}

	const musicBanks = Math.max(1, Math.ceil(stream.length / NSF_BANK_SIZE));
	for (const at of bankFixups) {
		for (let index = 0; index < 3; index++) {
			const value = (stream[at + index] ?? 0) + musicBanks;
			if (value > 0xff) throw new Error('Song does not fit in an NSF');
			stream[at + index] = value;
		}
	}
	const music = padBank(Uint8Array.from(stream));
	const driver = buildDriver();
	const driverBank = new Uint8Array(NSF_BANK_SIZE);
	driverBank.set(driver);
	const driverIndex = musicBanks + sampleBankCount;
	if (driverIndex > 0xff) {
		throw new Error('Song does not fit in an NSF');
	}
	const rom = new Uint8Array(music.length + samples.length + driverBank.length);
	rom.set(music, 0);
	rom.set(samples, music.length);
	rom.set(driverBank, music.length + samples.length);

	const period = playbackPeriod(options.interruptFrequency);
	const header = new Uint8Array(NSF_HEADER_SIZE);
	header.set([0x4e, 0x45, 0x53, 0x4d, 0x1a, 0x01, 0x01, 0x01], 0);
	header[0x08] = NSF_LOAD_ADDRESS & 0xff;
	header[0x09] = (NSF_LOAD_ADDRESS >> 8) & 0xff;
	header[0x0a] = NSF_INIT_ADDRESS & 0xff;
	header[0x0b] = (NSF_INIT_ADDRESS >> 8) & 0xff;
	header[0x0c] = NSF_PLAY_ADDRESS & 0xff;
	header[0x0d] = (NSF_PLAY_ADDRESS >> 8) & 0xff;
	writeField(header, 0x0e, options.title);
	writeField(header, 0x2e, options.artist);
	writeField(header, 0x4e, options.copyright ?? '');
	header[0x6e] = period & 0xff;
	header[0x6f] = (period >> 8) & 0xff;
	header[0x70] = 0;
	header[0x71] = 0;
	header[0x72] = 0;
	header[0x73] = 0;
	header[0x74] = sampleWindow(0, musicBanks, sampleBankCount);
	header[0x75] = sampleWindow(1, musicBanks, sampleBankCount);
	header[0x76] = sampleWindow(2, musicBanks, sampleBankCount);
	header[0x77] = driverIndex & 0xff;
	header[0x78] = period & 0xff;
	header[0x79] = (period >> 8) & 0xff;
	header[0x7a] = options.pal ? 0x01 : 0x00;
	header[0x7b] = options.frames.some((frame) => frame.ay != null) ? NSF_EXPANSION_5B : 0;

	const file = new Uint8Array(header.length + rom.length);
	file.set(header, 0);
	file.set(rom, header.length);
	return file;
}
