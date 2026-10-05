import { describe, expect, it } from 'vitest';
import type { NesDpcmCapture } from '../../../../../src/lib/services/file/nes/nes-register-export';
import { encodeNsf, type NsfFrame } from '../../../../../src/lib/services/file/nes/nsf-encoder';

const WINDOWS = [0x8000, 0x9000, 0xa000, 0xb000, 0xc000, 0xd000, 0xe000, 0xf000];

function u16(file: Uint8Array, offset: number): number {
	return file[offset]! | (file[offset + 1]! << 8);
}

function apuRegs(overrides: Record<number, number> = {}): number[] {
	const regs = new Array<number>(0x16).fill(0);
	regs[0x11] = -1;
	for (const [key, value] of Object.entries(overrides)) {
		regs[Number(key)] = value;
	}
	return regs;
}

function song(frames: NsfFrame[], extra: { pal?: boolean; loopFrame?: number | null; hz?: number } = {}) {
	return encodeNsf({
		title: 'Hello',
		artist: 'Bee',
		copyright: '2026',
		interruptFrequency: extra.hz ?? 50,
		pal: extra.pal ?? false,
		frames,
		loopFrame: extra.loopFrame
	});
}

class NsfPlayer {
	private readonly mem = new Uint8Array(0x10000);
	private readonly banks: Uint8Array[] = [];
	private readonly bankRegs = [0, 0, 0, 0, 0, 0, 0, 0];
	private a = 0;
	private x = 0;
	private y = 0;
	private sp = 0xff;
	private pc = 0;
	private c = 0;
	private z = 1;
	private n = 0;
	apu: [number, number][] = [];
	ay: [number, number][] = [];
	private ayAddress = 0;

	constructor(file: Uint8Array) {
		const data = file.subarray(0x80);
		for (let offset = 0; offset < data.length; offset += 0x1000) {
			const bank = new Uint8Array(0x1000);
			bank.set(data.subarray(offset, Math.min(offset + 0x1000, data.length)));
			this.banks.push(bank);
		}
		for (let index = 0; index < 8; index++) {
			this.bankRegs[index] = file[0x70 + index] ?? 0;
		}
		this.mapBanks();
	}

	read(addr: number): number {
		return this.mem[addr] ?? 0;
	}

	bank(index: number): number {
		return this.bankRegs[index] ?? 0;
	}

	private mapBanks(): void {
		for (let index = 0; index < WINDOWS.length; index++) {
			const bank = this.banks[this.bankRegs[index] ?? 0] ?? new Uint8Array(0x1000);
			this.mem.set(bank, WINDOWS[index]!);
		}
	}

	private write(addr: number, value: number): void {
		const byte = value & 0xff;
		if (addr >= 0x5ff8 && addr <= 0x5fff) {
			this.bankRegs[addr - 0x5ff8] = byte;
			this.mapBanks();
			return;
		}
		if (addr === 0xc000) {
			this.ayAddress = byte;
			return;
		}
		if (addr === 0xe000) {
			this.ay.push([this.ayAddress, byte]);
			return;
		}
		if (addr >= 0x4000 && addr <= 0x4017) {
			this.apu.push([addr, byte]);
		}
		if (addr < 0x8000) {
			this.mem[addr] = byte;
		}
	}

	private setZN(value: number): number {
		const byte = value & 0xff;
		this.z = byte === 0 ? 1 : 0;
		this.n = byte & 0x80 ? 1 : 0;
		return byte;
	}

	private push(value: number): void {
		this.mem[0x100 + this.sp] = value & 0xff;
		this.sp = (this.sp - 1) & 0xff;
	}

	private pull(): number {
		this.sp = (this.sp + 1) & 0xff;
		return this.mem[0x100 + this.sp] ?? 0;
	}

	private step(): void {
		const op = this.read(this.pc++);
		const immediate = () => this.read(this.pc++);
		const absolute = () => {
			const low = this.read(this.pc++);
			const high = this.read(this.pc++);
			return low | (high << 8);
		};
		switch (op) {
			case 0x4c:
				this.pc = absolute();
				break;
			case 0x20: {
				const target = absolute();
				const ret = (this.pc - 1) & 0xffff;
				this.push(ret >> 8);
				this.push(ret & 0xff);
				this.pc = target;
				break;
			}
			case 0x60: {
				const low = this.pull();
				const high = this.pull();
				this.pc = ((low | (high << 8)) + 1) & 0xffff;
				break;
			}
			case 0x78:
				break;
			case 0xa9:
				this.a = this.setZN(immediate());
				break;
			case 0xa5:
				this.a = this.setZN(this.read(immediate()));
				break;
			case 0xad:
				this.a = this.setZN(this.read(absolute()));
				break;
			case 0xb1: {
				const zp = immediate();
				const base = this.read(zp) | (this.read((zp + 1) & 0xff) << 8);
				this.a = this.setZN(this.read((base + this.y) & 0xffff));
				break;
			}
			case 0xa6:
				this.x = this.setZN(this.read(immediate()));
				break;
			case 0xa0:
				this.y = this.setZN(immediate());
				break;
			case 0x85:
				this.write(immediate(), this.a);
				break;
			case 0x8d:
				this.write(absolute(), this.a);
				break;
			case 0x9d:
				this.write((absolute() + this.x) & 0xffff, this.a);
				break;
			case 0x48:
				this.push(this.a);
				break;
			case 0x68:
				this.a = this.setZN(this.pull());
				break;
			case 0xe6: {
				const zp = immediate();
				this.write(zp, this.setZN(this.read(zp) + 1));
				break;
			}
			case 0xc6: {
				const zp = immediate();
				this.write(zp, this.setZN(this.read(zp) - 1));
				break;
			}
			case 0xc9: {
				const value = immediate();
				this.c = this.a >= value ? 1 : 0;
				this.setZN(this.a - value);
				break;
			}
			case 0xf0:
			case 0xd0:
			case 0x90: {
				const offset = immediate();
				const signed = offset < 128 ? offset : offset - 256;
				const take = op === 0xf0 ? this.z === 1 : op === 0xd0 ? this.z === 0 : this.c === 0;
				if (take) this.pc = (this.pc + signed) & 0xffff;
				break;
			}
			default:
				throw new Error(`unknown opcode ${op.toString(16)} at ${(this.pc - 1).toString(16)}`);
		}
	}

	call(address: number): void {
		const sentinel = 0x0001;
		this.push(0);
		this.push((sentinel - 1) & 0xff);
		this.pc = address;
		for (let steps = 0; steps < 100000; steps++) {
			if (this.pc === sentinel) return;
			this.step();
		}
		throw new Error('NSF routine did not return');
	}
}

function boot(file: Uint8Array): NsfPlayer {
	const player = new NsfPlayer(file);
	player.call(u16(file, 0x0a));
	player.apu = [];
	player.ay = [];
	return player;
}

function play5b(player: NsfPlayer, file: Uint8Array): [number, number][] {
	player.ay = [];
	player.call(u16(file, 0x0c));
	return player.ay;
}

function play(player: NsfPlayer, file: Uint8Array): [number, number][] {
	player.apu = [];
	player.call(u16(file, 0x0c));
	return player.apu;
}

function pulse(log: [number, number][]): number | undefined {
	const writes = log.filter(([addr]) => addr === 0x4000);
	return writes.at(-1)?.[1];
}

describe('encodeNsf header', () => {
	const file = song([{ regs: apuRegs({ 0: 1, 0x15: 1 }) }]);

	it('matches the NSF1 header', () => {
		expect(Array.from(file.subarray(0, 8))).toEqual([0x4e, 0x45, 0x53, 0x4d, 0x1a, 1, 1, 1]);
		expect(u16(file, 0x08)).toBe(0x8000);
		expect(u16(file, 0x0a)).toBe(0xf000);
		expect(u16(file, 0x0c)).toBe(0xf003);
		expect(file[0x0e]).toBe('H'.charCodeAt(0));
		expect(file[0x2e]).toBe('B'.charCodeAt(0));
		expect(file[0x4e]).toBe('2'.charCodeAt(0));
		expect(u16(file, 0x6e)).toBe(20000);
		expect(u16(file, 0x78)).toBe(20000);
		expect(Array.from(file.subarray(0x70, 0x78))).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
		expect(file[0x7a]).toBe(0);
		expect(file[0x7b]).toBe(0);
		expect(file[0x7c]).toBe(0);
		expect(file.length).toBe(0x80 + 2 * 0x1000);
	});

	it('truncates text fields and keeps them terminated', () => {
		const title = '0123456789abcdef0123456789abcdefXXXX';
		const encoded = encodeNsf({
			title,
			artist: title,
			copyright: title,
			interruptFrequency: 60,
			pal: true,
			frames: [{ regs: apuRegs() }]
		});
		expect(String.fromCharCode(...encoded.subarray(0x0e, 0x0e + 31))).toBe(title.slice(0, 31));
		expect(encoded[0x0e + 31]).toBe(0);
		expect(encoded[0x2e + 31]).toBe(0);
		expect(encoded[0x4e + 31]).toBe(0);
		expect(u16(encoded, 0x6e)).toBe(16667);
		expect(u16(encoded, 0x78)).toBe(16667);
		expect(encoded[0x7a]).toBe(1);
	});

	it('rejects an empty song, a bad loop, and a sample the player cannot see', () => {
		expect(() => song([])).toThrow('Song is empty');
		expect(() => song([{ regs: apuRegs() }], { loopFrame: 2 })).toThrow(
			'NSF loop frame is outside the song'
		);
		expect(() =>
			song([
				{
					regs: apuRegs(),
					dpcm: { retrigger: true, bytes: new Uint8Array(0x3001) }
				}
			])
		).toThrow('DPCM samples do not fit in the NSF');
	});
});

describe('NSF player', () => {
	it('writes changed registers once and reloads length only when asked', () => {
		const frames: NsfFrame[] = [
			{ regs: apuRegs({ 0: 0x80, 2: 0x10, 3: 0xf0, 0x15: 0x01 }) },
			{ regs: apuRegs({ 0: 0x80, 2: 0x10, 3: 0xf0, 0x15: 0x01 }) },
			{
				regs: apuRegs({ 0: 0x80, 2: 0x10, 3: 0xf0, 0x15: 0x01 }),
				lengthReloads: [0x03]
			}
		];
		const file = song(frames);
		const player = boot(file);
		expect(player.read(0xf000)).toBe(0x4c);
		expect(player.read(0xf003)).toBe(0x4c);
		expect(player.read(0x00)).toBe(0x04);
		expect(player.read(0x01)).toBe(0x80);

		const first = play(player, file);
		expect(pulse(first)).toBe(0x80);
		expect(first.filter(([addr]) => addr === 0x4003)).toEqual([[0x4003, 0xf0]]);
		expect(play(player, file)).toEqual([]);
		expect(play(player, file)).toEqual([[0x4003, 0xf0]]);
		expect(first.some(([addr]) => addr === 0x4014)).toBe(false);
	});

	it('rewrites the length register when a channel is enabled again', () => {
		const file = song([
			{ regs: apuRegs({ 3: 0xf0, 0x15: 0x00 }) },
			{ regs: apuRegs({ 3: 0xf0, 0x15: 0x01 }) }
		]);
		const player = boot(file);
		play(player, file);
		const second = play(player, file);
		expect(second.filter(([addr]) => addr === 0x4003 || addr === 0x4015)).toEqual([
			[0x4015, 0x01],
			[0x4003, 0xf0]
		]);
	});

	it('loops to the requested frame and halts when the song ends', () => {
		const frames: NsfFrame[] = [
			{ regs: apuRegs({ 0: 0x11, 0x15: 0x01 }) },
			{ regs: apuRegs({ 0: 0x22, 0x15: 0x01 }) },
			{ regs: apuRegs({ 0: 0x33, 0x15: 0x01 }) }
		];
		const looping = song(frames, { loopFrame: 0 });
		const looped = boot(looping);
		expect([looped.read(0x04), looped.read(0x05), looped.read(0x06)]).toEqual([0, 0x04, 0x80]);
		expect(pulse(play(looped, looping))).toBe(0x11);
		expect(pulse(play(looped, looping))).toBe(0x22);
		expect(pulse(play(looped, looping))).toBe(0x33);
		expect(pulse(play(looped, looping))).toBe(0x11);
		expect(pulse(play(looped, looping))).toBe(0x22);

		const skipped = song(frames, { loopFrame: 1 });
		const skipPlayer = boot(skipped);
		expect(pulse(play(skipPlayer, skipped))).toBe(0x11);
		expect(pulse(play(skipPlayer, skipped))).toBe(0x22);
		expect(pulse(play(skipPlayer, skipped))).toBe(0x33);
		expect(pulse(play(skipPlayer, skipped))).toBe(0x22);
		expect(pulse(play(skipPlayer, skipped))).toBe(0x33);

		const ending = song(frames);
		const halted = boot(ending);
		expect(pulse(play(halted, ending))).toBe(0x11);
		expect(pulse(play(halted, ending))).toBe(0x22);
		expect(pulse(play(halted, ending))).toBe(0x33);
		expect(play(halted, ending)).toEqual([[0x4015, 0]]);
		expect(play(halted, ending)).toEqual([]);
	});

	it('places DPCM at $C000 and retriggers without rewriting the address later', () => {
		const first = new Uint8Array(16).fill(0xab);
		const second = new Uint8Array(16).fill(0xcd);
		const again = new Uint8Array(16).fill(0xab);
		const sample = (bytes: Uint8Array, retrigger: boolean): NesDpcmCapture => ({
			retrigger,
			bytes: retrigger ? bytes : null
		});
		const regs = apuRegs({ 0x10: 0x0f, 0x11: 0x40, 0x12: 0, 0x13: 0x01, 0x15: 0x1f });
		const moved = apuRegs({ 0: 0x55, 0x10: 0x0f, 0x11: 0x40, 0x12: 0, 0x13: 0x01, 0x15: 0x1f });
		const file = song([
			{ regs, dpcm: sample(first, true) },
			{ regs: moved, dpcm: sample(first, false) },
			{ regs, dpcm: sample(second, true) },
			{ regs, dpcm: sample(again, true) }
		]);
		const player = boot(file);
		expect(player.read(0xc000)).toBe(0xab);
		expect(player.read(0xc040)).toBe(0xcd);
		expect(player.read(0xc080)).toBe(0);

		const opening = play(player, file);
		const lengthAt = opening.findIndex(([addr]) => addr === 0x4003);
		const enabledAt = opening.findIndex(([addr]) => addr === 0x4015);
		expect(enabledAt).toBeGreaterThanOrEqual(0);
		expect(lengthAt).toBeGreaterThan(enabledAt);
		const trigger = opening.filter(([addr]) => addr >= 0x4010);
		expect(trigger).toEqual([
			[0x4015, 0x0f],
			[0x4015, 0x0f],
			[0x4010, 0x0f],
			[0x4011, 0x40],
			[0x4012, 0x00],
			[0x4013, 0x01],
			[0x4015, 0x1f]
		]);
		expect(play(player, file).some(([addr]) => addr === 0x4012)).toBe(false);
		expect(play(player, file).find(([addr]) => addr === 0x4012)?.[1]).toBe(1);
		expect(play(player, file).find(([addr]) => addr === 0x4012)?.[1]).toBe(0);
	});

	it('switches sample banks when the DPCM data leaves the first bank', () => {
		const frames: NsfFrame[] = [];
		for (let index = 0; index < 40; index++) {
			const bytes = new Uint8Array(401);
			bytes[0] = index + 1;
			frames.push({
				regs: apuRegs({ 0x10: 0x0f, 0x13: 0x19, 0x15: 0x1f }),
				dpcm: { retrigger: true, bytes }
			});
		}
		const file = song(frames);
		const player = boot(file);
		let address = 0;
		for (let index = 0; index < frames.length; index++) {
			const log = play(player, file);
			address = log.find(([addr]) => addr === 0x4012)?.[1] ?? address;
		}
		expect(player.bank(4)).toBeGreaterThan(1);
		expect(player.bank(4)).not.toBe(player.bank(7));
		expect(player.read(0xf000)).toBe(0x4c);
		expect(player.read(0xc000 + address * 64)).toBe(40);
	});

	it('follows the stream into the next music bank', () => {
		const frames: NsfFrame[] = [];
		for (let index = 0; index < 4200; index++) {
			frames.push({ regs: apuRegs({ 0: index === 4199 ? 0x22 : 0x11, 0x15: 0x01 }) });
		}
		const file = song(frames);
		expect(file.length).toBeGreaterThan(0x80 + 2 * 0x1000);
		const player = boot(file);
		let last = 0;
		for (let index = 0; index < frames.length; index++) {
			const value = pulse(play(player, file));
			if (value !== undefined) last = value;
		}
		expect(last).toBe(0x22);
		expect(player.bank(0)).toBeGreaterThan(0);
		expect(play(player, file)).toEqual([[0x4015, 0]]);
	});

	it('writes Sunsoft 5B registers and retriggers the envelope', () => {
		const tone = new Array<number>(14).fill(0);
		tone[0] = 0x34;
		tone[1] = 0x12;
		tone[7] = 0x38;
		tone[8] = 0x0f;
		tone[13] = 0x0e;
		const sample = new Uint8Array(64).fill(0xab);
		const file = song([
			{
				regs: apuRegs({ 0x10: 0x0f, 0x13: 0x01, 0x15: 0x10 }),
				dpcm: { retrigger: true, bytes: sample },
				ay: tone,
				ayEnvelope: true
			},
			{ regs: apuRegs({ 0x10: 0x0f, 0x13: 0x01, 0x15: 0x10 }), ay: tone, ayEnvelope: true },
			{ regs: apuRegs({ 0x10: 0x0f, 0x13: 0x01, 0x15: 0x10 }), ay: tone }
		]);
		expect(file[0x7b]).toBe(0x20);
		const player = boot(file);
		expect(player.read(0xc000)).toBe(0xab);
		const opening = play5b(player, file);
		expect(opening).toContainEqual([0, 0x34]);
		expect(opening).toContainEqual([1, 0x12]);
		expect(opening).toContainEqual([7, 0x38]);
		expect(opening).toContainEqual([8, 0x0f]);
		expect(opening).toContainEqual([13, 0x0e]);
		expect(player.apu.some(([addr]) => addr === 0x4010)).toBe(true);
		expect(play5b(player, file)).toEqual([[13, 0x0e]]);
		expect(play5b(player, file)).toEqual([]);
		expect(play5b(player, file)).toEqual([
			[7, 0x3f],
			[8, 0],
			[9, 0],
			[10, 0]
		]);
		expect(player.read(0xc000)).toBe(0xab);
	});
});
