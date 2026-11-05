import {
	SAA_CHANNEL_COUNT,
	SAA_ENABLE_OUTPUT,
	SAA_REG_ENABLE,
	SAA_REG_ENVELOPE_0,
	SAA_REG_ENVELOPE_1,
	SAA_REG_NOISE_CLOCK,
	SAA_REG_NOISE_MIXER,
	SAA_REG_TONE_MIXER
} from '../../../../../public/saa/saa-constants.js';
import { appendSaaWrite } from './vgm-encoder';

function saaNoiseClockByte(noise0: number, noise1: number): number {
	return ((noise1 & 3) << 4) | (noise0 & 3);
}

export const SAA_VGM_REGISTER_COUNT = 32;

export type SaaVgmFrame = {
	registers: number[];
	envelopeRetrigger: [boolean, boolean];
};

export type SaaCaptureResult = {
	frames: SaaVgmFrame[];
	orderIndices: number[];
	chipFrequency: number;
	interruptFrequency: number;
};

type SaaChannelRegisters = {
	tone?: boolean;
	noise?: boolean;
	left?: number;
	right?: number;
	octave?: number;
	freq?: number;
};

export type SaaRegisterStateLike = {
	channelCount?: number;
	channels?: SaaChannelRegisters[];
	noise0?: number;
	noise1?: number;
	envelope0?: number;
	envelope1?: number;
	envelopeRetrigger0?: boolean;
	envelopeRetrigger1?: boolean;
};

export function saaRegistersFromState(state: SaaRegisterStateLike): SaaVgmFrame {
	const registers = new Array<number>(SAA_VGM_REGISTER_COUNT).fill(0);
	const octaves = [0, 0, 0, 0, 0, 0];
	let toneMask = 0;
	let noiseMask = 0;
	const count = Math.min(SAA_CHANNEL_COUNT, state.channelCount ?? SAA_CHANNEL_COUNT);
	const channels = state.channels ?? [];
	const envelopeActive = [
		((state.envelope0 ?? 0) & 0x80) !== 0,
		((state.envelope1 ?? 0) & 0x80) !== 0
	];
	for (let channel = 0; channel < count; channel++) {
		const source = channels[channel];
		const left = (source?.left ?? 0) & 15;
		const right = (source?.right ?? 0) & 15;
		const mixed = Boolean(source?.tone) || Boolean(source?.noise);
		const envelopeHeld =
			(channel === 2 && envelopeActive[0]) || (channel === 5 && envelopeActive[1]);
		registers[channel] = mixed || envelopeHeld ? (right << 4) | left : 0;
		registers[8 + channel] = (source?.freq ?? 0) & 255;
		octaves[channel] = (source?.octave ?? 0) & 7;
		if (source?.tone) toneMask |= 1 << channel;
		if (source?.noise) noiseMask |= 1 << channel;
	}
	registers[16] = octaves[0]! | (octaves[1]! << 4);
	registers[17] = octaves[2]! | (octaves[3]! << 4);
	registers[18] = octaves[4]! | (octaves[5]! << 4);
	registers[SAA_REG_TONE_MIXER] = toneMask & 0xff;
	registers[SAA_REG_NOISE_MIXER] = noiseMask & 0xff;
	registers[SAA_REG_NOISE_CLOCK] = saaNoiseClockByte(state.noise0 ?? 0, state.noise1 ?? 0) & 0xff;
	registers[SAA_REG_ENVELOPE_0] = (state.envelope0 ?? 0) & 0xff;
	registers[SAA_REG_ENVELOPE_1] = (state.envelope1 ?? 0) & 0xff;
	registers[SAA_REG_ENABLE] = SAA_ENABLE_OUTPUT;
	return {
		registers,
		envelopeRetrigger: [Boolean(state.envelopeRetrigger0), Boolean(state.envelopeRetrigger1)]
	};
}

export function appendSaaRegisterDiffs(
	commands: number[],
	previous: number[],
	registers: number[],
	chipIndex: 0 | 1,
	envelopeRetrigger: readonly [boolean, boolean]
): void {
	const length = Math.min(previous.length, registers.length, SAA_VGM_REGISTER_COUNT);
	for (let register = 0; register < length; register++) {
		const value = (registers[register] ?? 0) & 0xff;
		const retrigger =
			(register === SAA_REG_ENVELOPE_0 && envelopeRetrigger[0]) ||
			(register === SAA_REG_ENVELOPE_1 && envelopeRetrigger[1]);
		if (retrigger && (value & 0x80) !== 0) {
			appendSaaWrite(commands, register, value & 0x7f, chipIndex);
			appendSaaWrite(commands, register, value, chipIndex);
			previous[register] = value;
			continue;
		}
		if (previous[register] !== value) {
			appendSaaWrite(commands, register, value, chipIndex);
			previous[register] = value;
		}
	}
}
