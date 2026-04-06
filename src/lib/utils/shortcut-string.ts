function keyFromEvent(event: KeyboardEvent): string {
	if (event.altKey) {
		const code = event.code;
		if (code.startsWith('Key')) {
			return code.slice(3).toLowerCase();
		}
		if (code.startsWith('Digit')) {
			return code.slice(5);
		}
		return code;
	}
	if (event.code === 'Minus') {
		return '-';
	}
	const key = event.key;
	if (key.length === 1 && key >= 'A' && key <= 'Z') {
		return key.toLowerCase();
	}
	return key;
}

const MOUSE_BUTTON_NAMES: Record<number, string> = {
	0: 'LMB',
	1: 'MMB',
	2: 'RMB'
};

export class ShortcutString {
	static fromEvent(event: KeyboardEvent): string {
		const parts: string[] = [];
		if (event.ctrlKey || event.metaKey) {
			parts.push('Mod');
		}
		if (event.altKey) {
			parts.push('Alt');
		}
		if (event.shiftKey) {
			parts.push('Shift');
		}
		parts.push(keyFromEvent(event));
		return parts.join('+');
	}

	static fromMouseEvent(event: MouseEvent): string {
		const parts: string[] = [];
		if (event.ctrlKey || event.metaKey) {
			parts.push('Mod');
		}
		if (event.altKey) {
			parts.push('Alt');
		}
		if (event.shiftKey) {
			parts.push('Shift');
		}
		const buttonName = MOUSE_BUTTON_NAMES[event.button];
		if (buttonName) {
			parts.push(buttonName);
		}
		return parts.join('+');
	}

	static matchesMouseEvent(shortcut: string, event: MouseEvent): boolean {
		const normalized = ShortcutString.normalizeForComparison(shortcut);
		const fromEvent = ShortcutString.normalizeForComparison(
			ShortcutString.fromMouseEvent(event)
		);
		return normalized === fromEvent;
	}

	private static readonly KEY_DISPLAY_NAMES: Record<string, string> = {
		' ': 'Space',
		CapsLock: 'Caps Lock',
		LMB: 'LMB',
		MMB: 'MMB',
		RMB: 'RMB'
	};

	static toDisplay(shortcut: string): string {
		const isMac =
			typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC');
		let result = shortcut
			.replace(/\bMod\b/g, isMac ? 'Cmd' : 'Ctrl')
			.replace(/\bAlt\b/g, isMac ? 'Option' : 'Alt');
		const segments = result.split('+');
		const keyPart = segments[segments.length - 1];
		const displayKey =
			ShortcutString.KEY_DISPLAY_NAMES[keyPart] ??
			(keyPart.length === 1 && keyPart >= 'a' && keyPart <= 'z'
				? keyPart.toUpperCase()
				: keyPart);
		segments[segments.length - 1] = displayKey;
		return segments.join('+');
	}

	static normalizeForComparison(shortcut: string): string {
		const segments = shortcut.split('+');
		const keyPart = segments[segments.length - 1];
		if (keyPart.length === 1 && keyPart >= 'A' && keyPart <= 'Z') {
			segments[segments.length - 1] = keyPart.toLowerCase();
		}
		if (['LMB', 'MMB', 'RMB'].includes(keyPart.toUpperCase())) {
			segments[segments.length - 1] = keyPart.toUpperCase();
		}
		return segments.join('+');
	}
}
