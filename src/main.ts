import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

const visualizePath = window.location.pathname === '/visualize';
if (visualizePath) {
	window.location.replace('/visualize/');
}

const app = visualizePath
	? null
	: mount(App, {
			target: document.getElementById('app')!
		});

export default app;
