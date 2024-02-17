<script lang="ts">
	import Meta from '$lib/components/Meta.svelte';

	import type { PageData } from '../$types';

	export let data: PageData & { title: string; summary: string; date: string; content: string };
</script>

<svelte:head>
	<title>{data.title} - News - IATF</title>
	<Meta content={data.summary} />
</svelte:head>

<header>
	<h1>{data.title} - News</h1>
	<p class="news-date"><em>Posted at:</em> {data.date}</p>
</header>

<main id="main">
	<section>
		<h2>{data.title}</h2>
		<div>{@html data.content}</div>
	</section>
</main>
