import { describe, expect, it } from 'vitest';
import { importTaymBuffer, isTaymBuffer } from '@/lib/services/file/taym/taym-import';
import { readTaymFile } from '@/lib/services/file/taym/taym-reader';
import { mapUint8SampleToVolumeLevel } from '@/lib/chips/ay/ay-sample-lut';
import { instrumentHasSample } from '@/lib/chips/ay/sample-region';
import type { AyTimerRow } from '@/lib/chips/ay/instrument';
import type { Instrument } from '@/lib/models/instrument';
import {
	buildTaymFixture,
	FIXTURE_AMPLITUDE_C,
	FIXTURE_CLOCK_HZ,
	FIXTURE_DRUM_LANE,
	FIXTURE_DRUM_RATE_HZ,
	FIXTURE_FRAME_COUNT,
	FIXTURE_SID_PEAK,
	FIXTURE_TONE_A,
	FIXTURE_TONE_C
} from './taym-fixture';

type AyInstrument = Instrument & {
	timerRows?: AyTimerRow[];
	timerPwmDuty?: number;
	sampleData?: number[];
	sampleRate?: number;
	sampleStart?: number;
	sampleEnd?: number;
	sampleLoopEnabled?: boolean;
};

const FULL_VOLUME = 15;

function importFixture() {
	const { project, warnings } = importTaymBuffer(buildTaymFixture(), 'fixture');
	const song = project.songs[0]!;
	const instruments = project.instruments as AyInstrument[];
	const firstRow = (channel: number) => song.patterns[0]!.channels[channel]!.rows[0]!;
	const instrumentOf = (channel: number) =>
		instruments.find(
			(instrument, index) =>
				index + 1 === (firstRow(channel) as { instrument: number }).instrument
		)!;
	return { project, song, warnings, instruments, firstRow, instrumentOf };
}

describe('TAYM AY import', () => {
	it('recognises the fixture as a TAYM buffer', () => {
		expect(isTaymBuffer(buildTaymFixture())).toBe(true);
		expect(isTaymBuffer(new ArrayBuffer(4))).toBe(false);
	});

	it('reads the track, chip and timer definitions', () => {
		const file = readTaymFile(buildTaymFixture());
		expect(file.track.frameCount).toBe(FIXTURE_FRAME_COUNT);
		expect(file.track.timerCount).toBe(2);
		expect(file.chips[0]!.clockHz).toBe(FIXTURE_CLOCK_HZ);
		expect(file.lanes).toHaveLength(2);
		expect(file.lanes[1]!.loopIndex).toBeNull();
	});

	it('imports without warnings and covers every frame with pattern rows', () => {
		const { song, warnings, project } = importFixture();
		expect(warnings).toEqual([]);
		expect(song.chipFrequency).toBe(FIXTURE_CLOCK_HZ);
		const rows = project.patternOrder.reduce((total, patternId) => {
			const pattern = song.patterns.find((entry) => entry.id === patternId)!;
			return total + pattern.patternRows.length;
		}, 0);
		expect(rows).toBe(FIXTURE_FRAME_COUNT);
	});

	it('converts a one-shot amplitude lane into a sample instrument', () => {
		const { instrumentOf, firstRow } = importFixture();
		const drum = instrumentOf(1);

		expect(instrumentHasSample(drum)).toBe(true);
		expect(drum.sampleData).toHaveLength(FIXTURE_DRUM_LANE.length);
		expect(drum.sampleRate).toBe(FIXTURE_DRUM_RATE_HZ);
		expect(drum.sampleStart).toBe(0);
		expect(drum.sampleEnd).toBe(FIXTURE_DRUM_LANE.length - 1);
		expect(drum.sampleLoopEnabled).toBe(false);
		expect(drum.timerRows).toBeUndefined();
	});

	it('stores sample bytes that map back to the source amplitudes', () => {
		const { instrumentOf } = importFixture();
		const drum = instrumentOf(1);
		const levels = drum.sampleData!.map((byte) => mapUint8SampleToVolumeLevel(byte, 'AY'));
		expect(levels).toEqual(FIXTURE_DRUM_LANE);
	});

	it('plays a sample at the pitch reference note and full volume', () => {
		const { firstRow } = importFixture();
		const row = firstRow(1) as { note: { name: number; octave: number }; volume: number };
		expect(row.note.octave).toBe(4);
		expect(row.volume).toBe(FULL_VOLUME);
	});

	it('normalises a two-level amplitude lane into a pulse plus volume', () => {
		const { instrumentOf, firstRow } = importFixture();
		const sid = instrumentOf(0);
		const timerRow = sid.timerRows![0]!;

		expect(timerRow.sid).toBe(true);
		expect(timerRow.timerWaveform).toEqual([FULL_VOLUME, 0]);
		expect((firstRow(0) as { volume: number }).volume).toBe(FIXTURE_SID_PEAK);
	});

	it('derives the SID rate from the note instead of a fixed period', () => {
		const { instrumentOf } = importFixture();
		const timerRow = instrumentOf(0).timerRows![0]!;

		expect(timerRow.sidPeriodMode).toBe('auto');
		expect(timerRow.semitone).toBe(0);
		expect(timerRow.detune).toBe(0);
	});

	it('keeps the pulse width from the timer lane', () => {
		const { instrumentOf } = importFixture();
		expect(instrumentOf(0).timerPwmDuty).toBe(75);
	});

	it('carries a tone period between two notes as an instrument tone offset', () => {
		const { instrumentOf, firstRow, song } = importFixture();
		const offset = (instrumentOf(2).rows[0] as unknown as { toneAdd: number }).toneAdd;
		const noteIndex = (firstRow(2) as { note: { name: number; octave: number } }).note;
		const notePeriod = song.tuningTable.find((period) => period === FIXTURE_TONE_C - offset);

		expect(song.tuningTable).not.toContain(FIXTURE_TONE_C);
		expect(offset).not.toBe(0);
		expect(notePeriod).toBeDefined();
		expect(notePeriod! + offset).toBe(FIXTURE_TONE_C);
		expect(noteIndex.octave).toBeGreaterThan(0);
	});

	it('leaves notes that land on the tuning table without an offset', () => {
		const { instrumentOf, song } = importFixture();
		const sid = instrumentOf(0);
		const offset = (sid.rows[0] as unknown as { toneAdd: number }).toneAdd;

		expect(song.tuningTable).toContain(FIXTURE_TONE_A);
		expect(offset).toBe(0);
	});

	it('reuses one instrument per distinct voice shape', () => {
		const { instruments, firstRow } = importFixture();
		const ids = [0, 1, 2].map(
			(channel) => (firstRow(channel) as { instrument: number }).instrument
		);

		expect(new Set(ids).size).toBe(3);
		expect(instruments).toHaveLength(3);
	});

	it('keeps the plain channel amplitude in the volume column', () => {
		const { firstRow } = importFixture();
		expect((firstRow(2) as { volume: number }).volume).toBe(FIXTURE_AMPLITUDE_C);
	});
});
