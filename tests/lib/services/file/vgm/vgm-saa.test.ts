import { describe, expect, it } from 'vitest';
import { SAA_CHIP_SCHEMA, SAA_SAM_CLOCK, resolveSaaTuningTable } from '@/lib/chips/saa/schema';
import { Project } from '@/lib/models/project';
import { Instrument, Note, NoteName, Pattern, Song } from '@/lib/models/song';
import { encodeCapturedVgm } from '@/lib/services/file/vgm/vgm-export';
import { captureVgmProject } from '@/lib/services/file/vgm/vgm-shared-capture';
import { appendSaaRegisterDiffs, saaRegistersFromState } from '@/lib/services/file/vgm/vgm-saa';
import {
	SAA_REG_ENABLE,
	SAA_REG_ENVELOPE_0,
	SAA_REG_NOISE_CLOCK,
	SAA_REG_TONE_MIXER
} from '../../../../../public/saa/saa-constants.js';
import SaaAudioDriver, {
	resolveSaaHardwareState
} from '../../../../../public/saa/saa-audio-driver.js';
import SaaVirtualChannelMixer from '../../../../../public/saa/saa-virtual-channel-mixer.js';
import SaaRegisterState from '../../../../../public/saa/saa-register-state.js';
import SaaState from '../../../../../public/saa/saa-state.js';
import { saaPeriodFromCode } from '../../../../../public/saa/saa-levels.js';
import TrackerPatternProcessor from '../../../../../public/tracker/tracker-pattern-processor.js';
import { VGM_CMD_SAA1099, VGM_HEADER_SIZE } from '@/lib/services/file/vgm/vgm-encoder';

const ROWS = 4;
const SPEED = 1;

function saaModules() {
	return {
		SaaState,
		TrackerPatternProcessor,
		SaaAudioDriver,
		SaaRegisterState,
		SaaVirtualChannelMixer,
		resolveSaaHardwareState,
		saaPeriodFromCode
	};
}

function createSaaProject(): Project {
	const pattern = new Pattern(0, ROWS, SAA_CHIP_SCHEMA);
	pattern.channels[0]!.rows[0]!.note = new Note(NoteName.A, 4);
	pattern.channels[0]!.rows[0]!.instrument = 1;

	const song = new Song(SAA_CHIP_SCHEMA);
	song.chipType = 'saa';
	song.chipFrequency = SAA_SAM_CLOCK;
	song.interruptFrequency = 50;
	song.a4TuningHz = 440;
	song.tuningTable = resolveSaaTuningTable(SAA_SAM_CLOCK, 440);
	song.patterns = [pattern];

	const instrument = new Instrument('01', 'Square', 'saa');
	instrument.macros = {
		left: { values: [15], loop: 0 },
		right: { values: [15], loop: 0 },
		tone: { values: [true], loop: 0 }
	};
	return new Project('SAA VGM', 'bitphase', [song], 0, [0], [], {}, [instrument], SPEED);
}

describe('saa vgm registers', () => {
	it('packs amplitude, pitch, noise, and the output enable bit', () => {
		const frame = saaRegistersFromState({
			channelCount: 6,
			channels: [
				{ tone: true, noise: false, left: 15, right: 8, octave: 4, freq: 200 },
				{ tone: false, noise: true, left: 1, right: 2, octave: 1, freq: 10 },
				undefined,
				{ tone: false, noise: false, left: 15, right: 15, octave: 4, freq: 80 }
			],
			noise0: 1,
			noise1: 2,
			envelope0: 0x9a,
			envelopeRetrigger0: true
		});

		expect(frame.registers[0]).toBe(0x8f);
		expect(frame.registers[1]).toBe(0x21);
		expect(frame.registers[3]).toBe(0);
		expect(frame.registers[8]).toBe(200);
		expect(frame.registers[9]).toBe(10);
		expect(frame.registers[16]).toBe(0x14);
		expect(frame.registers[SAA_REG_TONE_MIXER]).toBe(0x01);
		expect(frame.registers[21]).toBe(0x02);
		expect(frame.registers[SAA_REG_NOISE_CLOCK]).toBe(0x21);
		expect(frame.registers[SAA_REG_ENVELOPE_0]).toBe(0x9a);
		expect(frame.registers[SAA_REG_ENABLE]).toBe(0x01);
		expect(frame.envelopeRetrigger).toEqual([true, false]);
	});

	it('keeps the level of an envelope channel that is not gating a square or noise', () => {
		const frame = saaRegistersFromState({
			channelCount: 6,
			channels: [
				undefined,
				undefined,
				{ tone: false, noise: false, left: 13, right: 12, octave: 2, freq: 196 }
			],
			envelope0: 0x9a
		});
		expect(frame.registers[2]).toBe(0xcd);
	});

	it('restarts an enabled envelope before writing the latched shape', () => {
		const previous = new Array(32).fill(0);
		previous[SAA_REG_ENVELOPE_0] = 0x9a;
		const registers = new Array(32).fill(0);
		registers[SAA_REG_ENVELOPE_0] = 0x9a;
		const commands: number[] = [];
		appendSaaRegisterDiffs(commands, previous, registers, 0, [true, false]);
		expect(commands).toEqual([
			VGM_CMD_SAA1099,
			SAA_REG_ENVELOPE_0,
			0x1a,
			VGM_CMD_SAA1099,
			SAA_REG_ENVELOPE_0,
			0x9a
		]);
	});
});

describe('saa vgm capture', () => {
	it('logs an A4 square as SAA1099 register writes', async () => {
		const project = createSaaProject();
		const captured = await captureVgmProject(project, [], [], { saaModules: saaModules() }, [
			0
		]);
		const frame = captured.saaCaptures[0]?.frames[0];
		const packed = resolveSaaTuningTable(SAA_SAM_CLOCK, 440)[45]!;

		expect(captured.saaCaptures[0]?.frames).toHaveLength(ROWS);
		expect(captured.saaCaptures[0]?.chipFrequency).toBe(SAA_SAM_CLOCK);
		expect(frame?.registers[0]).toBe(0xff);
		expect(frame?.registers[8]).toBe(packed & 0xff);
		expect(frame?.registers[16] & 0x0f).toBe((packed >> 8) & 7);
		expect(frame?.registers[SAA_REG_TONE_MIXER] & 0x01).toBe(1);

		const buffer = encodeCapturedVgm(project, captured, []);
		const bytes = new Uint8Array(buffer);
		const view = new DataView(buffer);
		expect(view.getUint32(0xc8, true)).toBe(SAA_SAM_CLOCK);
		expect(view.getUint32(0x18, true)).toBe(ROWS * 882);
		expect(bytes[VGM_HEADER_SIZE]).toBe(VGM_CMD_SAA1099);
		expect(bytes[VGM_HEADER_SIZE + 1]).toBe(0);
		expect(bytes[VGM_HEADER_SIZE + 2]).toBe(0xff);

		const system = [
			0x53, 0x00, 0x41, 0x00, 0x41, 0x00, 0x31, 0x00, 0x30, 0x00, 0x39, 0x00, 0x39, 0x00
		];
		const systemAt = bytes.findIndex((_, index) =>
			system.every((value, offset) => bytes[index + offset] === value)
		);
		expect(systemAt).toBeGreaterThan(0);
	});
});
