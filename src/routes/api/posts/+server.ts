import { json } from '@sveltejs/kit';
import { marked } from 'marked';

async function getPosts() {
	const paths = import.meta.glob('/markdown/blog/*.md', { query: 'raw' });

	let posts = [];

	for await (const [path, loader] of Object.entries(paths)) {
		const rawContent = (await loader()) as any;
		const metadataRegex = /^---\n([\s\S]+?)\n---/;
		const match = rawContent.default.match(metadataRegex);
		if (!match) throw new Error('Metadata block not found');

		const metadataBlock = match[1];
		const metadataLines: string[] = metadataBlock.split('\n');
		const metadata: any = {};

		// Extract metadata from the metadata block
		metadataLines.forEach((line) => {
			const [key, value] = line.split(':').map((part) => part.trim());
			if (key && value) {
				if (value === 'true' || value === 'false') {
					metadata[key] = value === 'true';
				} else if (!isNaN(Date.parse(value))) {
					const date = new Date(value);
					// user refers to the server environment's timezone
					const userTimezoneOffset = date.getTimezoneOffset() * 60000; // Offset in milliseconds
					const correctedDate = new Date(date.getTime() - userTimezoneOffset);
					metadata[key] = correctedDate.toISOString().split('T')[0];
					// parse data
					/*
						const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
						return new Date(string).toLocaleDateString(undefined, options);
					*/
					const options: Intl.DateTimeFormatOptions = {
						year: 'numeric',
						month: 'long',
						day: 'numeric'
					};
					const parsedDate = new Date(metadata[key]).toLocaleDateString(undefined, options);
					metadata[key] = parsedDate;
				} else {
					metadata[key] = value;
				}
			}
		});

		// Extract content after the metadata block
		const contentStartIndex = rawContent.default.indexOf('---', match.index + 3) + 3;
		const postContent = rawContent.default.substring(contentStartIndex).trim();

		// Optionally convert Markdown content to HTML
		const htmlContent = marked(postContent);

		posts.push({
			metadata,
			content: htmlContent
		});
	}

	return posts;
}

export async function GET() {
	const posts = await getPosts();
	return json(posts);
}
