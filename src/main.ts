import { mount } from 'svelte';
import App from './App.svelte';
import 'katex/dist/katex.min.css';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/newsreader';
import '@fontsource/ibm-plex-mono/400.css';
import './app.css';

mount(App, { target: document.getElementById('app')! });
