import { mount } from 'svelte';
import './app.css';
import VisualizePage from './lib/components/Visualize/VisualizePage.svelte';

const root = document.getElementById('app');
if (!root) {
	throw new Error('Missing app root');
}

mount(VisualizePage, { target: root });
