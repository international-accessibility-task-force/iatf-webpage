export class UrlSanitizer {
	static isValidLength(url: string, maxLength: number = 2048): boolean {
		return url.length <= maxLength;
	}

	static isHttpsUrl(url: string): boolean {
		try {
			const parsedUrl = new URL(url);
			return parsedUrl.protocol === 'https:';
		} catch (e) {
			return false; // URL parsing failed, indicating it's not a valid URL
		}
	}

	static isValidExtension(url: string): boolean {
		const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp'];
		const extension = url.split('.').pop()?.toLowerCase();
		return allowedExtensions.includes(extension ?? '');
	}
}
