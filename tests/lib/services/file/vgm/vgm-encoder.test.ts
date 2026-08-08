import { describe, expect, it } from 'vitest';
import {
	appendAyWrite,
	appendNesRegisterDiffs,
	appendNesWrite,
	appendWait,
	buildGd3Tag,
	encodeVgm,
	resolveVgmAyType,
	samplesPerInterrupt,
	VGM_AY_TYPE_AY8910,
	VGM_AY_TYPE_YM2149,
	VGM_CMD_AY8910,
	VGM_CMD_END,
	VGM_CMD_NES_APU,
	VGM_CMD_WAIT_882,
	VGM_DUAL_CHIP_CLOCK_BIT,
	VGM_HEADER_SIZE,
	VGM_VERSION_1_61
} from '@/lib/services/file/vgm/vgm-encoder';
import { convertNesRegisterStateToApuRegs } from '@/lib/services/file/nes/nes-register-export';

describe('vgm-encoder', () => {
	it('encodes header clocks, dual bit, AY type, and GD3', () => {
		const commands = [VGM_CMD_WAIT_882];
		const buffer = encodeVgm({
			ayClock: 1773400,
			ayDual: true,
			ayType: VGM_AY_TYPE_YM2149,
			nesClock: 1789773,
			totalSamples: 882,
			rateHz: 50,
			commands: Uint8Array.from(commands),
			gd3: {
				trackName: 'Test',
				author: 'Author',
				systemName: 'AY-3-8910'
			}
		});

		const view = new DataView(buffer);
		const bytes = new Uint8Array(buffer);
		expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe('Vgm ');
		expect(view.getUint32(0x08, true)).toBe(VGM_VERSION_1_61);
		expect(view.getUint32(0x74, true) & ~VGM_DUAL_CHIP_CLOCK_BIT).toBe(1773400);
		expect(view.getUint32(0x74, true) & VGM_DUAL_CHIP_CLOCK_BIT).toBe(VGM_DUAL_CHIP_CLOCK_BIT);
		expect(bytes[0x78]).toBe(VGM_AY_TYPE_YM2149);
		expect(view.getUint32(0x84, true)).toBe(1789773);
		expect(view.getUint32(0x18, true)).toBe(882);
		expect(view.getUint32(0x34, true)).toBe(VGM_HEADER_SIZE - 0x34);
		expect(bytes[VGM_HEADER_SIZE]).toBe(VGM_CMD_WAIT_882);
		expect(bytes[VGM_HEADER_SIZE + 1]).toBe(VGM_CMD_END);
		expect(view.getUint32(0x14, true)).toBeGreaterThan(0);
	});

	it('uses address bit 7 for second AY/NES chip', () => {
		const commands: number[] = [];
		appendAyWrite(commands, 0x07, 0x38, 0);
		appendAyWrite(commands, 0x07, 0x38, 1);
		appendNesWrite(commands, 0x15, 0x0f, 0);
		appendNesWrite(commands, 0x15, 0x0f, 1);
		expect(commands).toEqual([
			VGM_CMD_AY8910,
			0x07,
			0x38,
			VGM_CMD_AY8910,
			0x87,
			0x38,
			VGM_CMD_NES_APU,
			0x15,
			0x0f,
			VGM_CMD_NES_APU,
			0x95,
			0x0f
		]);
	});

	it('emits 882-sample wait for 50 Hz', () => {
		expect(samplesPerInterrupt(50)).toBe(882);
		const commands: number[] = [];
		appendWait(commands, 882);
		expect(commands).toEqual([VGM_CMD_WAIT_882]);
	});

	it('maps chipVariant to AY type', () => {
		expect(resolveVgmAyType('AY')).toBe(VGM_AY_TYPE_AY8910);
		expect(resolveVgmAyType('YM')).toBe(VGM_AY_TYPE_YM2149);
		expect(resolveVgmAyType('AY', true)).toBe(VGM_AY_TYPE_YM2149);
	});

	it('writes loop offset relative to 0x1C', () => {
		const commands = Uint8Array.from([VGM_CMD_WAIT_882]);
		const loopDataOffset = VGM_HEADER_SIZE;
		const buffer = encodeVgm({
			nesClock: 1789773,
			totalSamples: 1764,
			loopDataOffset,
			loopSamples: 882,
			rateHz: 50,
			commands
		});
		const view = new DataView(buffer);
		expect(view.getUint32(0x1c, true)).toBe(loopDataOffset - 0x1c);
		expect(view.getUint32(0x20, true)).toBe(882);
	});

	it('builds GD3 with UTF-16LE strings', () => {
		const tag = buildGd3Tag({ trackName: 'A', author: 'B' });
		expect(String.fromCharCode(tag[0], tag[1], tag[2], tag[3])).toBe('Gd3 ');
		expect(tag[12]).toBe(0x41);
		expect(tag[13]).toBe(0x00);
	});
});

describe('nes register conversion', () => {
	it('maps active pulse channel to $4000-$4003 and $4015', () => {
		const registerState = {
			channels: [
				{
					enabled: true,
					period: 256,
					volume: 10,
					duty: 2,
					volumeReg: -1,
					lengthNibble: -1,
					sweepReg: 0x08
				},
				{ enabled: false, period: 0, volume: 0, duty: 2 },
				{ enabled: false, period: 0 },
				{ enabled: false },
				{ enabled: false }
			]
		};
		const regs = convertNesRegisterStateToApuRegs(registerState);
		expect(regs[0x00] & 0x0f).toBe(10);
		expect(regs[0x02]).toBe(0xff);
		expect(regs[0x03] & 0x07).toBe(0);
		expect(regs[0x15] & 0x01).toBe(1);
	});

	it('maps active noise channel to $400C/$400E/$400F and $4015', () => {
		const regs = convertNesRegisterStateToApuRegs({
			channels: [
				{ enabled: false, period: 0 },
				{ enabled: false, period: 0 },
				{ enabled: false, period: 0 },
				{
					enabled: true,
					volume: 12,
					volumeReg: 0x1c,
					noisePeriod: 5,
					noiseMode: true,
					lengthNibble: 0xf
				},
				{ enabled: false }
			]
		});
		expect(regs[0x0c]).toBe(0x1c);
		expect(regs[0x0e]).toBe(0x85);
		expect(regs[0x0f]).toBe(0x78);
		expect(regs[0x15] & 0x08).toBe(0x08);
	});
});

describe('appendNesRegisterDiffs', () => {
	it('writes $4015 before channel regs and reloads length on enable', () => {
		const previous = new Array(0x16).fill(0);
		const next = new Array(0x16).fill(0);
		next[0x0c] = 0x1c;
		next[0x0e] = 0x05;
		next[0x0f] = 0x78;
		next[0x15] = 0x08;

		const commands: number[] = [];
		appendNesRegisterDiffs(commands, previous, next, 0);

		expect(commands.slice(0, 3)).toEqual([VGM_CMD_NES_APU, 0x15, 0x08]);
		expect(commands).toContain(0x0c);
		expect(commands).toContain(0x0e);
		expect(commands).toContain(0x0f);

		const lengthWrites = [];
		for (let i = 0; i < commands.length; i += 3) {
			if (commands[i + 1] === 0x0f) {
				lengthWrites.push(i);
			}
		}
		expect(lengthWrites.length).toBe(2);
		expect(lengthWrites[0]!).toBeGreaterThan(0);
		expect(commands[lengthWrites[1]!]!).toBe(VGM_CMD_NES_APU);
		expect(commands[lengthWrites[1]! + 1]).toBe(0x0f);
		expect(commands[lengthWrites[1]! + 2]).toBe(0x78);
	});
});
