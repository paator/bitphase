import { describe, expect, it } from 'vitest';
import { renderSampleLimit } from '@/lib/services/file/wav/render-sample-limit';

describe('render sample limit', () => {
	it('allows a song longer than five minutes', () => {
		const fiveMinutes = 44100 * 300;
		const limit = renderSampleLimit(44100, 3824, 1, 50);
		expect(limit).toBeGreaterThan(fiveMinutes);
		expect(limit).toBeGreaterThan(44100 * 324);
	});
});
