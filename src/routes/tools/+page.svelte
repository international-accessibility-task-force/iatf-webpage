<script lang="ts">
	import Title from '$lib/components/Title.svelte';
	import Meta from '$lib/components/Meta.svelte';
	import Header from '$lib/components/Header.svelte';

	import { PUBLIC_CLOUDINARY_CLOUD_NAME, PUBLIC_CLOUDINARY_PRESET } from '$env/static/public';

	let files: FileList | undefined;
	let fileName: string = 'No file chosen';
	let url: string = '';
	let answer: string = ''; // Initialize answer as an empty string.
	let errorMessage: string = ''; // Initialize errorMessage as an empty string.
	let selectedOption = 'upload'; // Default selection

	// Function to update the file name or display a default message
	function updateFileName() {
		if (files && files.length > 0) {
			fileName = files[0].name;
		} else {
			fileName = 'No file chosen';
		}
	}

	function triggerFileInput() {
		const fileInput = document.getElementById('image');
		fileInput?.click();
	}

	// Keyboard event handler for the label
	function handleLabelKeydown(event: KeyboardEvent) {
		// Trigger file input on Enter or Space
		if (event.key === 'Enter' || event.key === ' ') {
			triggerFileInput();
			event.preventDefault(); // Prevent the default action to avoid scrolling on space key
		}
	}

	// Function to get a description for the image from our backend
	async function getDescription(imageUrl: string): Promise<string> {
		const response = await fetch('/api/huggingface', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ url: imageUrl })
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(errorData.error || `An error occurred: ${response.statusText}`);
		}

		const data = await response.json();
		return data[0].generated_text || 'No description found.';
	}

	// Function to upload the image directly to Cloudinary
	async function uploadImage(file: File): Promise<string> {
		const formData = new FormData();
		formData.append('file', file);
		formData.append('upload_preset', PUBLIC_CLOUDINARY_PRESET);

		const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`;

		const response = await fetch(cloudinaryUrl, {
			method: 'POST',
			body: formData
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(errorData.error || `An error occurred: ${response.statusText}`);
		}

		const data = await response.json();
		return data.secure_url;
	}

	// Handle form submission for both direct URL input and file upload
	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		answer = ''; // Reset answer
		errorMessage = ''; // Reset error message at the start of each submission

		try {
			// Determine the submission type based on selectedOption
			if (selectedOption === 'url' && url) {
				// If URL option is selected and URL is provided
				const description = await getDescription(url);
				const str = description.substring(0, description.length - 1);
				answer = `${str}.`;
				files = undefined; // Clear files selection
			} else if (selectedOption === 'upload' && files && files.length > 0) {
				// If upload option is selected and a file is provided
				const imageUrl = await uploadImage(files[0]);
				const description = await getDescription(imageUrl);
				const str = description.substring(0, description.length - 1);
				answer = `${str}.`;
			} else {
				// No valid input provided
				throw new Error('Please provide an image URL or select a file to upload.');
			}
		} catch (error: any) {
			console.error(error);
			errorMessage = error.message || 'Failed to process request. Please try again.';
		}
	}
</script>

<svelte:head>
	<Title title="Tools" />
	<Meta
		content="Explore tools like ITTAI developed by the International Accessibility Task Force to make the web more accessible for users with disabilities."
	/>
</svelte:head>

<Header title="Tools" />

<main id="main">
	<section aria-label="Tools Introduction">
		<h2>Tools You'll Love at the International Accessibility Task Force</h2>
		<p>
			Welcome to our special toolbox at IATF! This is a place where smart ideas help everyone surf
			the web easily, no matter the hurdles. Every tool we build has one big dream: to open up the
			internet so everyone can join in. Ready to see what we've got for you?
		</p>
	</section>
	<section aria-label="Image to Text Artificial Intelligence">
		<h2>ITTAI - Image to Text Artificial Intelligence</h2>
		<p>
			Say hello to ITTAI! Think of it as a friendly helper that can tell you what's in a picture
			when you can't see it yourself. Simply upload a file directly or provide ITTAI with the web
			address (URL) of the picture. Choose the option that best fits your needs, then press "Get
			Description" button, and ITTAI will give you the words to picture it in your mind.
		</p>
		<p>How to Use ITTAI:</p>
		<ol>
			<li>
				<strong>Option 1 (Default):</strong> Upload an image - Pick an image file from your device that
				you want described.
			</li>
			<li>
				<strong>Option 2:</strong> Use an image URL - Type in the web address of the image you're curious
				about.
			</li>
			<li>
				Hit the "Get Description" button, and hang tight for just a few seconds. ITTAI will get back
				to you with a description shortly!
			</li>
		</ol>
		<p>
			Just a heads-up, ITTAI does its best, but sometimes it might get things a bit mixed up, so
			it's good to double-check important stuff.
		</p>

		<form on:submit|preventDefault={handleSubmit}>
			<fieldset>
				<legend>How do you want to send your image to ITTAI?</legend>
				<div id="optionFields">
					<label class:selected={selectedOption === 'upload'}>
						<input type="radio" bind:group={selectedOption} value="upload" /> Upload Image
					</label>
					<label class:selected={selectedOption === 'url'}>
						<input type="radio" bind:group={selectedOption} value="url" /> Submit Image URL
					</label>
				</div>
				<div id="uploadFields" class={selectedOption === 'upload' ? '' : 'hidden'}>
					<div
						class="file-upload-trigger action"
						tabindex="0"
						role="button"
						aria-describedby="file-note"
						on:click={triggerFileInput}
						on:keydown={handleLabelKeydown}
					>
						Select Image to Upload:
					</div>
					<input
						type="file"
						id="image"
						accept="image/*"
						class="hidden"
						bind:files
						on:change={updateFileName}
						aria-describedby="file-note"
					/>
					<span class="file-name">{fileName}</span>
					<p id="file-note">Supported formats: JPG, PNG, GIF, SVG, WEBP, AVIF.</p>
				</div>
				<div id="urlFields" class={selectedOption === 'url' ? '' : 'hidden'}>
					<label class="action" for="url">Type or Copy-Paste Image URL here:</label>
					<input type="text" id="url" bind:value={url} aria-describedby="url-note" />
					<p id="url-note">Enter the web address of the image you want described.</p>
				</div>

				<button id="submit" type="submit">Get Description</button>
			</fieldset>
		</form>
		{#if answer}
			<p id="answer" aria-live="polite" tabindex="-1">{answer}</p>
		{/if}
		{#if errorMessage}
			<p id="error-message" aria-live="assertive" style="color: red;" tabindex="-1" role="alert">
				{errorMessage}
			</p>
		{/if}
	</section>
	<section id="note-for-developers" aria-label="A Kind Note to Our Tech-Savvy Friends">
		<h2>A Kind Note to Our Tech-Savvy Friends</h2>
		<div>
			<p>
				ITTAI has evolved! Now, not only can you submit an image URL for description, but you can
				also directly upload images. These images are securely hosted on Cloudinary's free tier
				plan, ensuring accessibility for everyone. It’s a joint effort, powered by the innovative
				technology from ydshieh at Hugging Face and the robust hosting capabilities of Cloudinary.
			</p>
			<p>Want to Dive Deeper? Here’s What You Should Know:</p>
			<ul>
				<li>
					For DIY Enthusiasts: If you're inclined to deploy the model yourself, ydshieh has
					generously provided detailed instructions on Hugging Face. Discover how to integrate this
					technology into your own projects by visiting <a
						href="https://huggingface.co/ydshieh/vit-gpt2-coco-en"
						target="_blank"
						rel="noopener noreferrer">the model card on Hugging Face</a
					>.
				</li>
				<li>
					API Integration: Prefer a direct API approach? Hugging Face offers extensive documentation
					to guide you through utilizing their API. Dive into the <a
						href="https://huggingface.co/docs/api-inference/"
						target="_blank"
						rel="noopener noreferrer">Hugging Face API documentation</a
					> for more details.
				</li>
				<li>
					Using Cloudinary: Images uploaded via ITTAI are hosted on Cloudinary. While this feature
					is designed for ease of use within ITTAI, we recommend not using our Cloudinary upload
					endpoint directly in your applications. For your image hosting needs, consider setting up
					your own Cloudinary account.
				</li>
			</ul>

			<p>
				Our vision with ITTAI is to foster a community where technology bridges gaps and enhances
				accessibility for all. By sharing these tools and knowledge, we hope to empower more
				creators and developers to build accessible and inclusive experiences. Let's work together
				to make the digital world more accessible, one image at a time.
			</p>
		</div>
	</section>
</main>

<style>
	.hidden {
		display: none;
	}

	fieldset {
		border: 1px solid black;
	}

	legend {
		border: 1px solid black;
		background: black;
		padding: 1rem;
		color: white;
	}

	input,
	button,
	label,
	fieldset,
	legend {
		font-family:
			system-ui,
			-apple-system,
			blinkmacsystemfont,
			'Segoe UI',
			roboto,
			oxygen,
			ubuntu,
			cantarell,
			'Open Sans',
			'Helvetica Neue',
			sans-serif !important;
		font-size: 19px !important;
	}

	input[type='radio'] {
		transform: scale(1.5);
	}

	#optionFields {
		display: flex;
		flex-direction: row;
	}

	#optionFields label {
		margin: 1rem 1rem 0px 0px;
		padding: 1rem;
		background: #ddd;
		border-radius: 2px;
		cursor: pointer;
	}

	#optionFields label.selected {
		background: #00ff93;
	}

	#optionFields label:hover,
	#optionFields label:focus {
		background: #00ff93;
	}

	div#uploadFields,
	div#urlFields {
		margin-top: 1rem;
	}

	div#urlFields label {
		text-decoration: underline;
		cursor: pointer;
	}

	div#uploadFields input {
		font-size: large;
		margin-top: 1rem;
		display: flex;
		flex-direction: column;
	}

	.file-upload-trigger {
		cursor: pointer;
		width: fit-content;
		margin-bottom: 1rem;
		text-decoration: underline;
	}

	.file-upload-trigger:hover,
	.file-upload-trigger:focus {
		background-color: #4c00ff;
		color: #fbff00;
		outline: 1px solid #4c00ff;
		outline-offset: 0px;
	}

	.file-name {
		margin-top: 0.5rem;
	}

	input[type='file'] {
		display: none !important;
	}

	div#urlFields * {
		display: flex;
		flex-direction: column;
	}

	div#urlFields label {
		width: fit-content;
	}

	div#urlFields label:hover,
	div#urlFields label:focus {
		background-color: #4c00ff;
		color: #fbff00;
		outline: 1px solid #4c00ff;
		outline-offset: 0px;
	}

	input#url {
		padding: 0.5rem;
		border: none;
		border: 1px solid black;
		margin-top: 1rem;
	}

	input#url {
		outline: 0;
	}

	input#url:focus-visible,
	input#url:focus,
	input#url:hover {
		outline: 0;
		outline-offset: 0px;
		background-color: black;
		border-bottom: 1px solid black;
		color: #fff;
	}

	button#submit {
		padding: 1rem;
		border-radius: 30px;
		background-color: #fff;
		color: #4c00ff;
		border: 1px solid #4c00ff;
	}

	button#submit:focus-visible,
	button#submit:focus,
	button#submit:hover {
		background-color: #4c00ff;
		color: #fbff00;
		border: 1px solid #4c00ff;
		cursor: pointer;
	}

	p#answer::first-letter {
		text-transform: capitalize;
	}

	p#answer {
		color: black;
		border: 1px solid;
		padding: 1rem;
	}
	p#error-message {
		color: red;
		border: 1px solid;
		padding: 1rem;
	}

	@media (max-width: 600px) {
		#optionFields {
			flex-direction: column;
		}
	}
</style>
