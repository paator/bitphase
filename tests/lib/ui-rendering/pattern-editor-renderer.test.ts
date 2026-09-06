import { describe, expect, it } from 'vitest';
import {
	CHANNEL_LEVEL_STRIP_HEIGHT,
	getChannelLevelStripDeviceRect
} from '../../../src/lib/ui-rendering/pattern-editor-renderer';

describe('getChannelLevelStripDeviceRect', () => {
	it('maps CSS header height into device pixels', () => {
		expect(getChannelLevelStripDeviceRect(20, 400, 2)).toEqual({
			x: 0,
			y: 40,
			width: 800,
			height: CHANNEL_LEVEL_STRIP_HEIGHT * 2
		});
	});

	it('does not place the strip inside the header on a 1x canvas', () => {
		expect(getChannelLevelStripDeviceRect(20, 400, 1)).toEqual({
			x: 0,
			y: 20,
			width: 400,
			height: CHANNEL_LEVEL_STRIP_HEIGHT
		});
	});
});
