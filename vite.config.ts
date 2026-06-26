import type { ResolvedConfig, ViteDevServer } from 'vite';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import Icons from 'unplugin-icons/vite';
import { execSync } from 'child_process';
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'fs';
import { isAbsolute, join, relative, resolve } from 'path';

function getGitCommitHash() {
	try {
		return execSync('git rev-parse --short HEAD').toString().trim();
	} catch {
		return 'unknown';
	}
}

function getBuildDate() {
	return new Date().toISOString().split('T')[0];
}

function serviceWorkerCacheVersion() {
	let outDir = 'dist';
	return {
		name: 'sw-cache-version',
		apply: 'build' as const,
		configResolved(config: ResolvedConfig) {
			outDir = config.build.outDir;
		},
		closeBundle() {
			const swPath = join(outDir, 'sw.js');
			const content = readFileSync(swPath, 'utf-8');
			writeFileSync(swPath, content.replace('__BUILD_VERSION__', getGitCommitHash()));
		}
	};
}

function servePublicModuleImportsInDev() {
	return {
		name: 'serve-public-module-imports-dev',
		apply: 'serve' as const,
		configureServer(server: ViteDevServer) {
			server.middlewares.use((req, res, next) => {
				const requestUrl = req.url ?? '';
				const queryIndex = requestUrl.indexOf('?');
				const pathname = queryIndex === -1 ? requestUrl : requestUrl.slice(0, queryIndex);
				const query = queryIndex === -1 ? '' : requestUrl.slice(queryIndex + 1);

				if (!pathname.endsWith('.js') || !new URLSearchParams(query).has('import')) {
					next();
					return;
				}

				let decodedPathname: string;
				try {
					decodedPathname = decodeURIComponent(pathname);
				} catch {
					next();
					return;
				}

				const publicDir = resolve(server.config.publicDir);
				const filePath = resolve(publicDir, `.${decodedPathname}`);
				const relativePath = relative(publicDir, filePath);
				if (
					relativePath.startsWith('..') ||
					isAbsolute(relativePath) ||
					!existsSync(filePath)
				) {
					next();
					return;
				}

				res.statusCode = 200;
				res.setHeader('Content-Type', 'text/javascript');
				createReadStream(filePath).pipe(res);
			});
		}
	};
}

// https://vite.dev/config/
export default defineConfig({
	base: '/',
	assetsInclude: ['**/*.wasm'],
	build: {
		target: 'esnext',
		rollupOptions: {
			external: (id) =>
				id === 'ayumi-constants.js' ||
				id.endsWith('/ayumi-constants.js') ||
				id === '/ayumi-constants.js'
		}
	},
	plugins: [
		svelte(),
		tailwindcss(),
		Icons({
			compiler: 'svelte'
		}),
		serviceWorkerCacheVersion(),
		servePublicModuleImportsInDev()
	],
	define: {
		'import.meta.env.VITE_COMMIT_HASH': JSON.stringify(getGitCommitHash()),
		'import.meta.env.VITE_BUILD_DATE': JSON.stringify(getBuildDate())
	}
});
