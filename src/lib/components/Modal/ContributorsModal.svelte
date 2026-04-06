<script lang="ts">
	import Button from '../Button/Button.svelte';
	import { setupCanvas } from '../../utils/canvas-utils';
	import { getFonts } from '../../utils/fonts';

	let { resolve } = $props<{
		resolve?: (value?: unknown) => void;
	}>();

	const credits = [
		'Main code: Pator',
		'Contributors: CyberL1, dualjack',
		'Testers: phase-mod, Abyxus',
		'Ayumi emulator by Peter Sovietov',
		'Bitphase logo by Grongy',
		'Special thanks to Otomata Labs, Megus, Jammer, Tygrys, spkr, e!ghtbm, Tomarkus, arabek, RuGrantez, MmcM, nq, KK, AceMan, MaV, Jakim, LiSU, Volutar, MameXLIII',
		"and everyone else I've forgot to mention",
		'Thank you for using Bitphase'
	];
	const SCROLLER_TEXT = credits.join('  ***  ') + '  ***  ';
	const SCROLLER_SPEED = 48;
	const SCROLLER_AMPLITUDE = 8;
	const SCROLLER_WAVE_SPEED = 4;
	const SCROLLER_WAVE_FREQ = 0.15;

	let canvasEl: HTMLCanvasElement | null = $state(null);
	let demoContainerEl: HTMLDivElement | null = $state(null);

	const CUBE_SIZE = 45;
	const CUBE_CENTER_Z = 120;
	const PIXEL_SCALE = 3;
	const PLASMA_BLOCK = 2;

	type Vec3 = { x: number; y: number; z: number };

	const cubeVertices: Vec3[] = [
		{ x: -1, y: -1, z: -1 },
		{ x: 1, y: -1, z: -1 },
		{ x: 1, y: 1, z: -1 },
		{ x: -1, y: 1, z: -1 },
		{ x: -1, y: -1, z: 1 },
		{ x: 1, y: -1, z: 1 },
		{ x: 1, y: 1, z: 1 },
		{ x: -1, y: 1, z: 1 }
	];

	const cubeEdges = [
		[0, 1],
		[1, 2],
		[2, 3],
		[3, 0],
		[4, 5],
		[5, 6],
		[6, 7],
		[7, 4],
		[0, 4],
		[1, 5],
		[2, 6],
		[3, 7]
	];

	function rotateX(v: Vec3, angle: number): Vec3 {
		const c = Math.cos(angle);
		const s = Math.sin(angle);
		return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c };
	}

	function rotateY(v: Vec3, angle: number): Vec3 {
		const c = Math.cos(angle);
		const s = Math.sin(angle);
		return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
	}

	function project(
		x: number,
		y: number,
		z: number,
		cx: number,
		cy: number,
		cameraZ: number
	): { x: number; y: number } {
		const scale = cameraZ / (cameraZ + z);
		return { x: cx + x * scale, y: cy + y * scale };
	}

	function drawLinePixelAligned(
		ctx: CanvasRenderingContext2D,
		x0: number,
		y0: number,
		x1: number,
		y1: number,
		color: string
	) {
		const px0 = Math.floor(x0);
		const py0 = Math.floor(y0);
		const px1 = Math.floor(x1);
		const py1 = Math.floor(y1);
		let dx = Math.abs(px1 - px0);
		let dy = -Math.abs(py1 - py0);
		let sx = px0 < px1 ? 1 : -1;
		let sy = py0 < py1 ? 1 : -1;
		let err = dx + dy;
		let x = px0;
		let y = py0;
		ctx.fillStyle = color;
		for (;;) {
			ctx.fillRect(x, y, 1, 1);
			if (x === px1 && y === py1) break;
			const e2 = 2 * err;
			if (e2 >= dy) {
				err += dy;
				x += sx;
			}
			if (e2 <= dx) {
				err += dx;
				y += sy;
			}
		}
	}

	$effect(() => {
		const canvas = canvasEl;
		const container = demoContainerEl;
		if (!canvas || !container) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		ctx.imageSmoothingEnabled = false;
		const containerRef = container;
		const canvasRef = canvas;
		const ctxRef = ctx;

		let rafId = 0;
		let startTime = 0;
		let offscreen: HTMLCanvasElement | null = null;
		let offscreenCtx: CanvasRenderingContext2D | null = null;
		let lastLowW = 0;
		let lastLowH = 0;

		function resize() {
			const rect = containerRef.getBoundingClientRect();
			const w = rect.width;
			const h = rect.height;
			setupCanvas({
				canvas: canvasRef,
				ctx: ctxRef,
				width: w,
				height: h,
				fontSize: 8 * PIXEL_SCALE,
				fonts: { ...getFonts(), mono: '"Press Start 2P", monospace' },
				textBaseline: 'middle'
			});
		}

		function draw(t: number) {
			const rect = containerRef.getBoundingClientRect();
			const w = rect.width;
			const h = rect.height;
			if (w <= 0 || h <= 0) return;

			const lowW = Math.floor(w / PIXEL_SCALE);
			const lowH = Math.floor(h / PIXEL_SCALE);
			if (lowW <= 0 || lowH <= 0) return;

			if (!offscreen || lastLowW !== lowW || lastLowH !== lowH) {
				offscreen = document.createElement('canvas');
				offscreen.width = lowW;
				offscreen.height = lowH;
				offscreenCtx = offscreen.getContext('2d');
				lastLowW = lowW;
				lastLowH = lowH;
			}
			const ctx = offscreenCtx;
			if (!ctx) return;

			ctx.imageSmoothingEnabled = false;

			const cx = lowW / 2;
			const cy = lowH / 2;

			const plasmaTime = t * 0.0015;
			const pw = Math.floor(lowW / PLASMA_BLOCK) || 1;
			const ph = Math.floor(lowH / PLASMA_BLOCK) || 1;
			const plasmaData = ctx.createImageData(pw, ph);
			const pdata = plasmaData.data;
			const freq = 0.12;
			const freqDiag = 0.09;
			for (let py = 0; py < ph; py++) {
				for (let px = 0; px < pw; px++) {
					const v =
						Math.sin(px * freq + plasmaTime) +
						Math.sin(py * freq + plasmaTime * 1.1) +
						Math.sin((px + py) * freqDiag + plasmaTime * 0.7);
					const n = (v + 3) / 6;
					const r = Math.floor(20 + n * 60);
					const g = Math.floor(40 + n * 80);
					const b = Math.floor(120 + n * 135);
					const i = (py * pw + px) * 4;
					pdata[i] = Math.max(0, Math.min(255, r));
					pdata[i + 1] = Math.max(0, Math.min(255, g));
					pdata[i + 2] = Math.max(0, Math.min(255, b));
					pdata[i + 3] = 255;
				}
			}
			const plasmaCanvas = document.createElement('canvas');
			plasmaCanvas.width = pw;
			plasmaCanvas.height = ph;
			const plasmaCtx = plasmaCanvas.getContext('2d');
			if (plasmaCtx) {
				plasmaCtx.putImageData(plasmaData, 0, 0);
				ctx.imageSmoothingEnabled = false;
				ctx.drawImage(plasmaCanvas, 0, 0, pw, ph, 0, 0, lowW, lowH);
			}

			const angleX = t * 0.0011;
			const angleY = t * 0.0009;
			const pulse = 0.88 + Math.sin(t * 0.003) * 0.14;
			const bufferScale = lowW / 280;
			const scale = CUBE_SIZE * pulse * bufferScale;

			const rotated = cubeVertices.map((v) => {
				let r = rotateX(v, angleX);
				r = rotateY(r, angleY);
				return { x: r.x * scale, y: r.y * scale, z: r.z * scale + CUBE_CENTER_Z };
			});

			const projected = rotated.map((v) =>
				project(v.x, v.y, v.z, cx, cy, CUBE_CENTER_Z + CUBE_SIZE * 2)
			);

			const edgeColors = [
				'#000000',
				'#e00',
				'#000000',
				'#e00',
				'#e00',
				'#000000',
				'#e00',
				'#000000',
				'#000000',
				'#e00',
				'#e00',
				'#000000'
			];

			cubeEdges.forEach((edge, i) => {
				const a = projected[edge[0]];
				const b = projected[edge[1]];
				const za = rotated[edge[0]].z;
				const zb = rotated[edge[1]].z;
				const avgZ = (za + zb) / 2;
				const alpha = 0.5 + (avgZ / (CUBE_CENTER_Z + CUBE_SIZE * 2)) * 0.5;
				const color = edgeColors[i % edgeColors.length];
				ctx.globalAlpha = alpha;
				drawLinePixelAligned(ctx, a.x, a.y, b.x, b.y, color);
			});
			ctx.globalAlpha = 1;

			ctxRef.imageSmoothingEnabled = false;
			ctxRef.drawImage(offscreen, 0, 0, lowW, lowH, 0, 0, w, h);

			const chars = Array.from(SCROLLER_TEXT);
			const charWidths = chars.map((c) => ctxRef.measureText(c).width);
			const textWidthMain = charWidths.reduce((a, b) => a + b, 0);
			const scrollCycleMain = textWidthMain + w;
			const scrollOffsetMain = ((t / 1000) * SCROLLER_SPEED * PIXEL_SCALE) % scrollCycleMain;
			const baseYMain = h - 14 * PIXEL_SCALE;
			const phase = (t / 1000) * SCROLLER_WAVE_SPEED;
			const amplitudeMain = SCROLLER_AMPLITUDE * PIXEL_SCALE;

			function drawScrollerOnMain(startX: number) {
				let x = startX;
				for (let i = 0; i < chars.length; i++) {
					const yOff = amplitudeMain * Math.sin(phase + i * SCROLLER_WAVE_FREQ);
					const y = Math.round(baseYMain + yOff);
					const char = chars[i];
					const px = Math.round(x);
					ctxRef.fillStyle = '#000';
					ctxRef.fillText(char, px + 1, y + 1);
					ctxRef.fillStyle = '#fff';
					ctxRef.fillText(char, px, y);
					x += charWidths[i];
				}
			}

			drawScrollerOnMain(w - scrollOffsetMain);
			drawScrollerOnMain(w - scrollOffsetMain + scrollCycleMain);
		}

		function loop(t: number) {
			if (!startTime) startTime = t;
			const elapsed = t - startTime;
			draw(elapsed);
			rafId = requestAnimationFrame(loop);
		}

		resize();
		const resizeObserver = new ResizeObserver(resize);
		resizeObserver.observe(containerRef);
		rafId = requestAnimationFrame(loop);

		return () => {
			resizeObserver.disconnect();
			cancelAnimationFrame(rafId);
		};
	});

	function handleClose() {
		resolve?.();
	}
</script>

<div class="contributors-modal">
	<div
		class="flex items-center gap-2 border-b border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-3 py-2">
		<h2 class="font-bold text-[var(--color-app-text-primary)]">Contributors</h2>
	</div>

	<div class="modal-body">
		<div class="demo-area" bind:this={demoContainerEl}>
			<canvas
				bind:this={canvasEl}
				class="demo-canvas"
				aria-label="Demoscene plasma, cube and credits scroller"></canvas>
		</div>

		<div class="modal-footer">
			<Button variant="primary" onclick={handleClose}>Close</Button>
		</div>
	</div>
</div>

<style>
	.contributors-modal {
		display: flex;
		flex-direction: column;
		width: 560px;
		min-height: 420px;
	}

	.modal-body {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 360px;
		overflow: hidden;
	}

	.demo-area {
		position: relative;
		flex: 1;
		min-height: 200px;
	}

	.demo-canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
		image-rendering: crisp-edges;
	}

	.modal-footer {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 1rem 1.5rem 1.5rem;
		border-top: 1px solid var(--color-app-border);
		background: var(--color-app-surface);
	}
</style>
