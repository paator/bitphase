import { describe, expect, it } from 'vitest';
import { groupBy } from '@/lib/utils/group-by';

describe('groupBy', () => {
	it('groups items in first-seen order', () => {
		const groups = groupBy([3, 1, 4, 1, 5, 9, 2, 6], (value) => value % 2);
		expect([...groups.entries()]).toEqual([
			[1, [3, 1, 1, 5, 9]],
			[0, [4, 2, 6]]
		]);
	});

	it('maps grouped values', () => {
		const groups = groupBy(
			[
				{ id: 'a', value: 1 },
				{ id: 'a', value: 2 }
			],
			(item) => item.id,
			(item) => item.value
		);
		expect(groups.get('a')).toEqual([1, 2]);
	});
});
