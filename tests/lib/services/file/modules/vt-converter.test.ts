import { describe, it, expect } from 'vitest';
import { convertVT2String } from '@/lib/services/file/modules/vt-converter';

describe('VT2Converter', () => {
	describe('TurboSound (2xAY) import', () => {
		it('merges instruments from both chips with remapped IDs', () => {
			const vt2 = `[Module]
Title=TurboSound Test
Author=Test
Speed=3
PlayOrder=0,1
NoteTable=0
ChipFreq=1773400
IntFreq=50

[Ornament1]
0,1,2,L3
[Sample1]
T 00 00 0F
T 01 00 0F L
[Pattern0]
0000 00 | C-4 1000 | --- .... | --- ....

[Module]
Title=Chip 2
Author=Test
Speed=3
PlayOrder=0,1
NoteTable=0
ChipFreq=1773400
IntFreq=50

[Ornament1]
0,2,4,L2
[Sample1]
T 00 00 0E
T 02 00 0E L
[Pattern0]
0000 00 | D-4 1000 | --- .... | --- ....
[Pattern1]
0000 00 | --- .... | E-4 1000 | --- ....
`;

			const project = convertVT2String(vt2);

			expect(project.songs).toHaveLength(2);
			expect(project.instruments.length).toBeGreaterThanOrEqual(2);

			const chip1InstIds = project.instruments.map((i) => parseInt(i.id, 36));
			expect(chip1InstIds).toContain(1);
			expect(chip1InstIds).toContain(2);

			const song1 = project.songs[0];
			const song2 = project.songs[1];

			expect(song1.patterns).toHaveLength(2);
			expect(song2.patterns).toHaveLength(2);
			expect(song1.patterns.some((p) => p.id === 0)).toBe(true);
			expect(song2.patterns.some((p) => p.id === 0)).toBe(true);
		});

		it('merges tables from both chips', () => {
			const vt2 = `[Module]
Title=Chip 1
Speed=3
PlayOrder=0
NoteTable=0
ChipFreq=1773400
IntFreq=50

[Ornament1]
0,1,L2
[Sample1]
T 00 00 0F
[Pattern0]
0000 00 | C-4 1010 | --- .... | --- ....

[Module]
Title=Chip 2
Speed=3
PlayOrder=0
NoteTable=0
ChipFreq=1773400
IntFreq=50

[Ornament1]
0,2,L1
[Sample1]
T 00 00 0F
[Pattern0]
0000 00 | D-4 1010 | --- .... | --- ....
`;

			const project = convertVT2String(vt2);

			expect(project.tables.length).toBe(2);
			expect(project.songs[0].patterns).toHaveLength(1);
			expect(project.songs[1].patterns).toHaveLength(1);
		});

		it('creates unified sequential pattern order when play orders differ', () => {
			const vt2 = `[Module]
Title=Chip 1
Speed=3
PlayOrder=2,3,1
NoteTable=0
ChipFreq=1773400
IntFreq=50

[Sample1]
T 00 00 0F
[Pattern1]
0000 00 | C-4 1000 | --- .... | --- ....
[Pattern2]
0000 00 | D-4 1000 | --- .... | --- ....
[Pattern3]
0000 00 | E-4 1000 | --- .... | --- ....

[Module]
Title=Chip 2
Speed=3
PlayOrder=3,2,1
NoteTable=0
ChipFreq=1773400
IntFreq=50

[Sample1]
T 00 00 0F
[Pattern1]
0000 00 | F-4 1000 | --- .... | --- ....
[Pattern2]
0000 00 | G-4 1000 | --- .... | --- ....
[Pattern3]
0000 00 | A-4 1000 | --- .... | --- ....
`;

			const project = convertVT2String(vt2);

			expect(project.patternOrder).toEqual([0, 1, 2]);
			const song1 = project.songs[0];
			const song2 = project.songs[1];

			expect(song1.patterns).toHaveLength(3);
			expect(song2.patterns).toHaveLength(3);
			expect(song1.patterns.map((p) => p.id).sort((a, b) => a - b)).toEqual([0, 1, 2]);
			expect(song2.patterns.map((p) => p.id).sort((a, b) => a - b)).toEqual([0, 1, 2]);
		});

		it('duplicates patterns when same VT pattern maps to multiple unified IDs', () => {
			const vt2 = `[Module]
Title=Chip 1
Speed=3
PlayOrder=0,1,0
NoteTable=0
ChipFreq=1773400
IntFreq=50

[Sample1]
T 00 00 0F
[Pattern0]
0000 00 | C-4 1000 | --- .... | --- ....
[Pattern1]
0000 00 | D-4 1000 | --- .... | --- ....

[Module]
Title=Chip 2
Speed=3
PlayOrder=0,1,2
NoteTable=0
ChipFreq=1773400
IntFreq=50

[Sample1]
T 00 00 0F
[Pattern0]
0000 00 | E-4 1000 | --- .... | --- ....
[Pattern1]
0000 00 | F-4 1000 | --- .... | --- ....
[Pattern2]
0000 00 | G-4 1000 | --- .... | --- ....
`;

			const project = convertVT2String(vt2);

			expect(project.patternOrder).toEqual([0, 1, 2]);
			const song1 = project.songs[0];
			const song2 = project.songs[1];

			expect(song1.patterns).toHaveLength(3);
			expect(song2.patterns).toHaveLength(3);

			const s1p0 = song1.patterns.find((p) => p.id === 0);
			const s1p2 = song1.patterns.find((p) => p.id === 2);
			expect(s1p0).toBeDefined();
			expect(s1p2).toBeDefined();
		});

		it('remaps chip 2 patterns when play orders differ', () => {
			const vt2 = `[Module]
Title=Chip 1
Speed=3
PlayOrder=0,1,2,0
NoteTable=0
ChipFreq=1773400
IntFreq=50

[Sample1]
T 00 00 0F
[Pattern0]
0000 00 | C-4 1000 | --- .... | --- ....
[Pattern1]
0000 00 | D-4 1000 | --- .... | --- ....
[Pattern2]
0000 00 | E-4 1000 | --- .... | --- ....

[Module]
Title=Chip 2
Speed=3
PlayOrder=0,1,3,0
NoteTable=0
ChipFreq=1773400
IntFreq=50

[Sample1]
T 00 00 0F
[Pattern0]
0000 00 | F-4 1000 | --- .... | --- ....
[Pattern1]
0000 00 | G-4 1000 | --- .... | --- ....
[Pattern3]
0000 00 | A-4 1000 | --- .... | --- ....
`;

			const project = convertVT2String(vt2);

			expect(project.patternOrder).toEqual([0, 1, 2, 0]);
			const song1 = project.songs[0];
			const song2 = project.songs[1];

			expect(song1.patterns).toHaveLength(3);
			expect(song2.patterns).toHaveLength(3);
			const chip2Pattern2 = song2.patterns.find((p) => p.id === 2);
			expect(chip2Pattern2).toBeDefined();
			expect(song2.patterns.some((p) => p.id === 3)).toBe(false);
		});

		it('uses shared pattern order when both modules have same play order', () => {
			const vt2 = `[Module]
Title=Chip 1
Speed=3
PlayOrder=0,1,0
NoteTable=0
ChipFreq=1773400
IntFreq=50

[Sample1]
T 00 00 0F
[Pattern0]
0000 00 | C-4 1000 | --- .... | --- ....
[Pattern1]
0000 00 | D-4 1000 | --- .... | --- ....

[Module]
Title=Chip 2
Speed=3
PlayOrder=0,1,0
NoteTable=0
ChipFreq=1773400
IntFreq=50

[Sample1]
T 00 00 0F
[Pattern0]
0000 00 | E-4 1000 | --- .... | --- ....
[Pattern1]
0000 00 | F-4 1000 | --- .... | --- ....
`;

			const project = convertVT2String(vt2);

			expect(project.patternOrder).toEqual([0, 1, 0]);
			expect(project.songs[0].patterns).toHaveLength(2);
			expect(project.songs[1].patterns).toHaveLength(2);
		});
	});
});
