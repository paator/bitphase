import { describe, it, expect } from 'vitest';
import { Project, Table } from '../../../src/lib/models/project';
import { Song } from '../../../src/lib/models/song';
import { AY_CHIP_SCHEMA } from '../../../src/lib/chips/ay/schema';

describe('Project', () => {
	describe('constructor', () => {
		it('should create project with default values', () => {
			const project = new Project();

			expect(project.name).toBe('');
			expect(project.author).toBe('');
			expect(project.songs).toHaveLength(0);
			expect(project.loopPointId).toBe(0);
			expect(project.patternOrder).toEqual([0]);
			expect(project.tables).toHaveLength(1);
		});

		it('should create project with custom values', () => {
			const song = new Song(AY_CHIP_SCHEMA);
			const project = new Project('Test Project', 'Test Author', [song], 5, [0, 1, 2], []);

			expect(project.name).toBe('Test Project');
			expect(project.author).toBe('Test Author');
			expect(project.songs).toHaveLength(1);
			expect(project.loopPointId).toBe(5);
			expect(project.patternOrder).toEqual([0, 1, 2]);
			expect(project.tables).toHaveLength(0);
		});
	});
});

describe('Table', () => {
	describe('constructor', () => {
		it('should create table with default name', () => {
			const table = new Table(0, [1, 2, 3], 1);

			expect(table.id).toBe(0);
			expect(table.rows).toEqual([1, 2, 3]);
			expect(table.loop).toBe(1);
			expect(table.name).toBe('Table 1');
			expect(table.additive).toBe(false);
		});

		it('should create table with additive mode', () => {
			const table = new Table(0, [1], 0, 'Slide', true);
			expect(table.additive).toBe(true);
		});

		it('should create table with custom name', () => {
			const table = new Table(5, [10, 20], 0, 'Custom Table');

			expect(table.id).toBe(5);
			expect(table.rows).toEqual([10, 20]);
			expect(table.loop).toBe(0);
			expect(table.name).toBe('Custom Table');
		});

		it('should generate correct default names', () => {
			const table1 = new Table(0, [], 0);
			const table2 = new Table(9, [], 0);
			const table3 = new Table(34, [], 0);

			expect(table1.name).toBe('Table 1');
			expect(table2.name).toBe('Table A');
			expect(table3.name).toBe('Table Z');
		});
	});
});
