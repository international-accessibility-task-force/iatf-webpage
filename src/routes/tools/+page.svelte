<script lang="ts">
	import Title from '$lib/components/Title.svelte';
	import Meta from '$lib/components/Meta.svelte';
	import Header from '$lib/components/Header.svelte';

	let url = '';
	let answer = ''; // Initialize answer as an empty string.
	let errorMessage = ''; // Initialize errorMessage as an empty string.

	async function getDescription(url: string): Promise<string> {
		const response = await fetch('/api/huggingface', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ url })
		});

		if (!response.ok) {
			// Parse the JSON body to retrieve the backend's error message
			const errorData = await response.json();
			// Throw an error with the backend's message if available, or a generic message if not
			throw new Error(errorData.error || `An error occurred: ${response.statusText}`);
		}

		const data = await response.json();

		return data[0].generated_text || 'No description found.';
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		answer = ''; // Reset answer
		errorMessage = ''; // Reset the error message at the start of each submission

		try {
			const description = await getDescription(url);
			const str = description.substring(0, description.length - 1);
			answer = `${str}.`;
		} catch (error: any) {
			console.error(error);
			// Display a more user-friendly message or use the error message from the backend.
			errorMessage = error.message || 'Failed to fetch description. Please try again.';
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
			when you can't see it yourself. All you have to do is give ITTAI the web address (URL) of the
			picture, and it will give you the words to picture it in your mind.
		</p>
		<p>Easy Steps tu Use ITTAI:</p>
		<ol>
			<li>
				Put in the Picture Address: There's a box below where you can type or paste the picture's
				web address.
			</li>
			<li>
				Get the Picture in Words: After you hit "Get Description," ITTAI will work its magic and
				tell you about the picture in simple words.
			</li>
		</ol>
		<p>
			Just a heads-up, ITTAI does its best, but sometimes it might get things a bit mixed up, so
			it's good to double-check important stuff.
		</p>
		<form on:submit|preventDefault={handleSubmit}>
			<label for="url">Introduce web address URL</label>
			<input type="text" id="url" bind:value={url} required />
			<input type="submit" id="submit" value="Get Description" />
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
	<section id="note-for-developers">
		<h2>A Kind Note to Our Tech-Savvy Friends</h2>
		<div>
			<p>
				ITTAI is a special helper made for everyone, shining a light on pictures for those who might
				not see them. It's powered by clever technology from a generous creator named ydshieh over
				at Hugging Face, and guess what? It's shared freely.
			</p>
			<p>Thinking of Using the Model? Here’s What You Need to Know:</p>
			<ul>
				<li>
					Roll Up Your Sleeves: Interested in deploying the model on your own? ydshieh has provided
					detailed instructions on Hugging Face. Access the instructions
					<a href="https://huggingface.co/ydshieh/vit-gpt2-coco-en">on the model card website</a> to
					learn how you can set up the model in your environment.
				</li>
				<li>
					Direct API Use: If you prefer direct interaction with the model via API, Hugging Face
					offers a comprehensive guide. Find out how to utilize the API by checking the
					<a href="https://huggingface.co/docs/api-inference/">Hugging Face API documentation</a>.
				</li>
			</ul>

			<p>
				We believe in a world where sharing makes everything better. So, let's make sure ITTAI can
				help as many people as possible, especially those who need it most!
			</p>
		</div>
	</section>
</main>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 1rem;
		border: 1px solid black;
	}

	label {
		text-decoration: underline;
		cursor: pointer;
	}

	input#url {
		padding: 0.5rem;
		font-size: larger;
		border: none;
		border-bottom: 1px solid black;
	}

	input#url {
		outline: 0;
	}

	input#url:focus-visible,
	input#url:focus,
	input#url:hover {
		outline: 0;
		outline-offset: 0px;
		border-bottom: 1px solid black;
		background-color: black;
		color: white;
	}

	input#submit {
		font-size: larger;
		padding: 1rem;
		width: fit-content;
		border-radius: 30px;
		background-color: white;
		color: black;
		border: 1px solid black;
	}

	input#submit:focus-visible,
	input#submit:focus,
	input#submit:hover {
		background-color: #4c00ff;
		color: #fbff00;
		border: 1px solid #4c00ff;
		outline: 0;
		outline-offset: 0px;
	}

	input#submit:hover {
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
</style>
