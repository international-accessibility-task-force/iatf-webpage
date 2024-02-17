export const titleTags = (text: string): string => {
	// titleTags parses the sveltekit $page.url.pathname
	// and returns a capitalized string with spaces instead of hyphens.
	return text
		.substring(1) // remove leading slash
		.split('-') // split on hyphens
		.map((word) => word.charAt(0).toUpperCase() + word.substring(1)) // capitalize each word
		.join(' '); // join with spaces
};
