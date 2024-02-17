<script lang="ts">
	import Title from '$lib/components/Title.svelte';
	import Meta from '$lib/components/Meta.svelte';
	import Header from '$lib/components/Header.svelte';

	import type { PageData } from './$types';

	export let data: PageData;
</script>

<svelte:head>
	<Title title="News" />
	<Meta
		content="Catch up on the latest news from the International Accessibility Task Force. From new tools to community updates, stay informed about our accessibility efforts."
	/>
</svelte:head>

<Header title="News" />

<main id="main">
	<section>
		<h2>Latest News</h2>
		{#if data.posts.length > 0}
			{#each data.posts as post (post.metadata.id)}
				<article>
					<h3 class="news-title">{post.metadata.title}</h3>
					<p class="news-date"><em>Posted at:</em> {post.metadata.date}</p>
					<p><em>Posted by</em>: The Admin Team (TAT) 🤗</p>
					<p><em>Summary:</em> {post.metadata.summary}</p>
					<a href={`blog/${post.metadata.slug}`}>Read the full new: {post.metadata.title}</a>
				</article>
			{/each}
		{:else}
			<p>No news at the moment. Check back later for updates!</p>
		{/if}
	</section>
</main>
