import { describe, it, expect } from 'vitest';
import { VirtualChannelService } from '../../../../src/lib/services/pattern/virtual-channel-service';
import { Song, Pattern, NoteName } from '../../../../src/lib/models/song';
import { AY_CHIP_SCHEMA } from '../../../../src/lib/chips/ay/schema';

function createSong(virtualChannelMap: Record<number, number> = {}): Song {
	const song = new Song(AY_CHIP_SCHEMA);
	song.virtualChannelMap = { ...virtualChannelMap };
	return song;
}

describe('VirtualChannelService', () => {
	describe('addVirtualChannel', () => {
		it('should split a hardware channel into 2 virtual channels', () => {
			const song = createSong();
			const patterns = [song.patterns[0]];

			const result = VirtualChannelService.addVirtualChannel(song, 1, patterns);

			expect(result.updatedMap).toEqual({ 1: 2 });
			expect(result.updatedPatterns[0].channels).toHaveLength(4);
			expect(result.updatedPatterns[0].channels.map((c) => c.label)).toEqual([
				'A', 'B1', 'B2', 'C'
			]);
		});

		it('should add a third virtual channel to an already-split channel', () => {
			const song = createSong({ 1: 2 });
			song.patterns = [new Pattern(0, 64, AY_CHIP_SCHEMA, ['A', 'B1', 'B2', 'C'])];
			const patterns = song.patterns;

			const result = VirtualChannelService.addVirtualChannel(song, 1, patterns);

			expect(result.updatedMap).toEqual({ 1: 3 });
			expect(result.updatedPatterns[0].channels).toHaveLength(5);
			expect(result.updatedPatterns[0].channels.map((c) => c.label)).toEqual([
				'A', 'B1', 'B2', 'B3', 'C'
			]);
		});

		it('should preserve existing channel data when splitting', () => {
			const song = createSong();
			const pattern = song.patterns[0];
			pattern.channels[1].rows[0].note.name = NoteName.C;
			pattern.channels[1].rows[0].note.octave = 4;

			const result = VirtualChannelService.addVirtualChannel(song, 1, [pattern]);

			expect(result.updatedPatterns[0].channels[1].rows[0].note.name).toBe(NoteName.C);
			expect(result.updatedPatterns[0].channels[1].rows[0].note.octave).toBe(4);
		});

		it('should add virtual channel to first hardware channel', () => {
			const song = createSong();
			const result = VirtualChannelService.addVirtualChannel(song, 0, song.patterns);

			expect(result.updatedMap).toEqual({ 0: 2 });
			expect(result.updatedPatterns[0].channels.map((c) => c.label)).toEqual([
				'A1', 'A2', 'B', 'C'
			]);
		});

		it('should add virtual channel to last hardware channel', () => {
			const song = createSong();
			const result = VirtualChannelService.addVirtualChannel(song, 2, song.patterns);

			expect(result.updatedMap).toEqual({ 2: 2 });
			expect(result.updatedPatterns[0].channels.map((c) => c.label)).toEqual([
				'A', 'B', 'C1', 'C2'
			]);
		});

		it('should refuse a fourth virtual channel on the same hardware channel', () => {
			const song = createSong({ 1: 3 });
			song.patterns = [new Pattern(0, 64, AY_CHIP_SCHEMA, ['A', 'B1', 'B2', 'B3', 'C'])];

			const result = VirtualChannelService.addVirtualChannel(song, 1, song.patterns);

			expect(result).toBeNull();
			expect(song.virtualChannelMap).toEqual({ 1: 3 });
			expect(song.patterns[0].channels).toHaveLength(5);
		});

		it('should update all patterns', () => {
			const song = createSong();
			song.patterns.push(new Pattern(1, 32, AY_CHIP_SCHEMA));

			const result = VirtualChannelService.addVirtualChannel(song, 1, song.patterns);

			expect(result.updatedPatterns).toHaveLength(2);
			expect(result.updatedPatterns[0].channels).toHaveLength(4);
			expect(result.updatedPatterns[1].channels).toHaveLength(4);
		});
	});

	describe('removeVirtualChannel', () => {
		it('should return null when channel has no virtual channels', () => {
			const song = createSong();
			const result = VirtualChannelService.removeVirtualChannel(song, 1, song.patterns);

			expect(result).toBeNull();
		});

		it('should remove the last virtual channel by default', () => {
			const song = createSong({ 1: 2 });
			song.patterns = [new Pattern(0, 64, AY_CHIP_SCHEMA, ['A', 'B1', 'B2', 'C'])];

			const result = VirtualChannelService.removeVirtualChannel(song, 1, song.patterns);

			expect(result).not.toBeNull();
			expect(result!.updatedMap).toEqual({});
			expect(result!.updatedPatterns[0].channels).toHaveLength(3);
			expect(result!.updatedPatterns[0].channels.map((c) => c.label)).toEqual([
				'A', 'B', 'C'
			]);
		});

		it('should remove a specific virtual channel by effective index', () => {
			const song = createSong({ 1: 3 });
			song.patterns = [new Pattern(0, 64, AY_CHIP_SCHEMA, ['A', 'B1', 'B2', 'B3', 'C'])];
			song.patterns[0].channels[2].rows[0].note.name = NoteName.E;

			const result = VirtualChannelService.removeVirtualChannel(song, 1, song.patterns, 1);

			expect(result).not.toBeNull();
			expect(result!.updatedMap).toEqual({ 1: 2 });
			expect(result!.updatedPatterns[0].channels).toHaveLength(4);
			expect(result!.updatedPatterns[0].channels[1].rows[0].note.name).toBe(NoteName.E);
		});

		it('should remove the first virtual channel when specified', () => {
			const song = createSong({ 0: 2 });
			song.patterns = [new Pattern(0, 64, AY_CHIP_SCHEMA, ['A1', 'A2', 'B', 'C'])];
			song.patterns[0].channels[1].rows[0].note.name = NoteName.D;

			const result = VirtualChannelService.removeVirtualChannel(song, 0, song.patterns, 0);

			expect(result).not.toBeNull();
			expect(result!.updatedPatterns[0].channels).toHaveLength(3);
			expect(result!.updatedPatterns[0].channels[0].rows[0].note.name).toBe(NoteName.D);
			expect(result!.updatedPatterns[0].channels[0].label).toBe('A');
		});

		it('should fall back to removing last channel for out-of-range effective index', () => {
			const song = createSong({ 1: 2 });
			song.patterns = [new Pattern(0, 64, AY_CHIP_SCHEMA, ['A', 'B1', 'B2', 'C'])];

			const result = VirtualChannelService.removeVirtualChannel(song, 1, song.patterns, 99);

			expect(result).not.toBeNull();
			expect(result!.updatedPatterns[0].channels).toHaveLength(3);
		});

		it('should clean up map entry when going back to 1 virtual channel', () => {
			const song = createSong({ 1: 2 });
			song.patterns = [new Pattern(0, 64, AY_CHIP_SCHEMA, ['A', 'B1', 'B2', 'C'])];

			const result = VirtualChannelService.removeVirtualChannel(song, 1, song.patterns);

			expect(result!.updatedMap).toEqual({});
		});

		it('shifts a timer role onto the column that remains after a removal', () => {
			const song = createSong({ 1: 3 });
			song.virtualChannelRoles = { 1: { 2: 'timer' } };
			song.patterns = [new Pattern(0, 64, AY_CHIP_SCHEMA, ['A', 'B1', 'B2', 'B3', 'C'])];

			const result = VirtualChannelService.removeVirtualChannel(song, 1, song.patterns, 2);

			expect(result!.updatedRoles).toEqual({ 1: { 1: 'timer' } });
		});

		it('clears a timer role when the hardware channel collapses to one column', () => {
			const song = createSong({ 0: 2 });
			song.virtualChannelRoles = { 0: { 1: 'timer' } };
			song.patterns = [new Pattern(0, 64, AY_CHIP_SCHEMA, ['A1', 'A2', 'B', 'C'])];

			const result = VirtualChannelService.removeVirtualChannel(song, 0, song.patterns, 1);

			expect(result!.updatedRoles).toEqual({});
		});

		it('should keep map entry when going from 3 to 2 virtual channels', () => {
			const song = createSong({ 1: 3 });
			song.patterns = [new Pattern(0, 64, AY_CHIP_SCHEMA, ['A', 'B1', 'B2', 'B3', 'C'])];

			const result = VirtualChannelService.removeVirtualChannel(song, 1, song.patterns);

			expect(result!.updatedMap).toEqual({ 1: 2 });
			expect(result!.updatedPatterns[0].channels.map((c) => c.label)).toEqual([
				'A', 'B1', 'B2', 'C'
			]);
		});

		it('should relabel remaining channel when going from 2 to 1', () => {
			const song = createSong({ 2: 2 });
			song.patterns = [new Pattern(0, 64, AY_CHIP_SCHEMA, ['A', 'B', 'C1', 'C2'])];

			const result = VirtualChannelService.removeVirtualChannel(song, 2, song.patterns);

			expect(result!.updatedPatterns[0].channels[2].label).toBe('C');
		});
	});
});
