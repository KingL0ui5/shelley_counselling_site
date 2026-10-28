// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
	site: 'https://www.shelleyliutherapy.co.uk',
	output: 'static',
	adapter: vercel({
		// The contact form's FormSubmit delivery can be slow, so give the
		// /api/contact function more headroom than Vercel's short default.
		maxDuration: 75,
	}),
	vite: {
		plugins: [tailwindcss()]
	}
});
