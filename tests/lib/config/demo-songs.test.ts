import { describe, expect, it } from 'vitest';
import { getDemoMenuItems } from '@/lib/config/demo-songs';

describe('demo song menu', () => {
	it('groups songs under chip-type headers', () => {
		const items = getDemoMenuItems().map((item) => [item.type, item.label]);
		expect(items[0]).toEqual(['header', '1xAY']);
		expect(items).toContainEqual(['normal', 'nIkO - man']);
		expect(items).toContainEqual(['header', '2xAY']);
		expect(items).toContainEqual(['normal', 'Ryu Umemoto (conv. by phase-mod) - Marina']);
	});
});
