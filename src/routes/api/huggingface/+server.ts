import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { UrlSanitizer } from '$lib/utils/urlSanitizer';
import { HUGGING_FACE_API_TOKEN } from '$env/static/private';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const imageUrl = body.url;

	if (!UrlSanitizer.isValidLength(imageUrl)) {
		return json({ error: 'URL is too long.' }, { status: 400 });
	}

	if (!UrlSanitizer.isHttpsUrl(imageUrl)) {
		return json({ error: 'URL must use HTTPS.' }, { status: 400 });
	}

	try {
		const huggingFaceResponse = await fetch(
			'https://api-inference.huggingface.co/models/ydshieh/vit-gpt2-coco-en',
			{
				method: 'POST',
				headers: { Authorization: `Bearer ${HUGGING_FACE_API_TOKEN}` },
				body: imageUrl
			}
		);

		if (!huggingFaceResponse.ok) {
			return json(
				{
					error: `Failed to fetch description from Hugging Face API: ${huggingFaceResponse.statusText}`
				},
				{ status: huggingFaceResponse.status }
			);
		}

		const data = await huggingFaceResponse.json();

		return json(data, { status: 200 });
	} catch (error) {
		console.error('Error calling Hugging Face API:', error);
		return json({ error: 'Failed to fetch description.' }, { status: 500 });
	}
};
