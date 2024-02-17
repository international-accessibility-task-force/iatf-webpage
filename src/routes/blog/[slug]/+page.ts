// src/routes/blog/[slug]/+page.ts

import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
	const res = await fetch(`/api/posts`);
	if (!res.ok) {
		// Handle the case where the fetch request fails
		error(500, 'There was an error fetching the posts.');
	}

	const posts = await res.json();

	// Find the post that matches the current slug.
	let post = posts.find((e: any) => e.metadata.slug === params.slug);

	if (post) {
		return {
			title: post.metadata.title,
			date: post.metadata.date,
			summary: post.metadata.summary,
			content: post.content
		};
	} else {
		error(404, 'Not found');
	}
};
