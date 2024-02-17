import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	const res = await fetch(`/api/posts`);
	const posts = await res.json();
	return { posts };
};
