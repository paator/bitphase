import { AY_REGISTER_COUNT } from '../ay/ay-export-utils';

/**
 * Encodes the foreground PSG stream embedded in TAYM frame data.
 *
 * TAYM timers can own AY registers between player frames. Foreground PSG writes
 * for owned registers must be suppressed while the timer owns them, then emitted
 * on the first unowned frame so playback hands the register back to the captured
 * base state.
 */
export function encodeForegroundPsgFrameData(
	registerFrames: number[][],
	ownedRegistersPerFrame: number[][]
): ArrayBuffer {
	const headerSize = 16;
	const data: number[] = [];

	data.push(0x50);
	data.push(0x53);
	data.push(0x47);
	data.push(0x1a);

	for (let i = 0; i < 12; i++) {
		data.push(0);
	}

	const currentRegs = new Array(AY_REGISTER_COUNT).fill(0);
	let prevOwned = new Array(AY_REGISTER_COUNT).fill(false);

	for (let frameIndex = 0; frameIndex < registerFrames.length; frameIndex++) {
		const frameRegs = registerFrames[frameIndex];
		const owned = ownedRegistersPerFrame[frameIndex];
		const ownedSet = new Set(owned ?? []);
		data.push(0xff);

		for (let reg = 0; reg < AY_REGISTER_COUNT; reg++) {
			const value = frameRegs[reg];
			if (ownedSet.has(reg)) {
				continue;
			}
			const releasedFromTimer = prevOwned[reg];
			if (releasedFromTimer || value !== currentRegs[reg]) {
				data.push(reg);
				data.push(value);
				currentRegs[reg] = value;
			}
		}

		const nextOwned = new Array(AY_REGISTER_COUNT).fill(false);
		for (const reg of ownedSet) {
			if (reg >= 0 && reg < AY_REGISTER_COUNT) {
				nextOwned[reg] = true;
			}
		}
		prevOwned = nextOwned;
	}

	data.push(0xfd);

	const buffer = new ArrayBuffer(headerSize + data.length);
	const view = new Uint8Array(buffer);
	for (let i = 0; i < data.length; i++) {
		view[i] = data[i];
	}

	return buffer;
}
