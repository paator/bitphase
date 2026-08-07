import { defineConfig } from 'vitepress';

export default defineConfig({
	title: 'Bitphase',
	description: 'Documentation for the Bitphase chiptune tracker',
	base: '/docs/',
	outDir: '../dist/docs',
	cleanUrls: false,
	appearance: 'dark',
	head: [['link', { rel: 'icon', href: '/docs/logo.svg' }]],
	themeConfig: {
		logo: '/logo.svg',
		siteTitle: 'Bitphase',
		nav: [
			{ text: 'Docs', link: '/' },
			{ text: 'Open tracker', link: 'https://bitphase.app/' }
		],
		sidebar: [
			{
				text: 'Start',
				items: [
					{ text: 'Introduction', link: '/' },
					{ text: 'Getting started', link: '/getting-started' }
				]
			},
			{
				text: 'Reference',
				items: [
					{ text: 'Keyboard', link: '/keyboard' },
					{ text: 'Effects', link: '/effects' },
					{ text: 'Pattern editor', link: '/pattern-editor' },
					{ text: 'Order list', link: '/order-list' },
					{ text: 'Instruments', link: '/instruments' },
					{ text: 'Import & export', link: '/import-export' },
					{ text: 'Settings', link: '/settings' }
				]
			}
		],
		socialLinks: [{ icon: 'github', link: 'https://github.com/paator/bitphase' }],
		search: {
			provider: 'local'
		},
		outline: {
			level: [2, 3]
		}
	}
});
