<script lang="ts">
	import Title from '$lib/components/Title.svelte';
	import Meta from '$lib/components/Meta.svelte';
	import Header from '$lib/components/Header.svelte';
</script>

<svelte:head>
	<Title title="Transparency" />
	<Meta
		content="Read the International Accessibility Task Force's annual transparency reports. Learn about our finances and our commitment to an accessible digital world."
	/>
</svelte:head>

<Header title="Transparency" />

<main id="main">
	<section>
		<h2>Transparency Report</h2>
		<p>
			Transparency is at the heart of our operations. Here, we share our annual financial
			statements, reflecting our commitment to running a lean and open association. Since 2022, our
			expenses have primarily focused on our domain name. Initially, we hosted our website on GitHub
			Pages for its efficiency and cost-effectiveness. In 2024, we embraced a change by switching to
			Vercel's free tier, seeking to enhance our site's performance and accessibility.
		</p>
		<p>
			Our domain remains registered through Namecheap, underscoring our continuous effort to
			maintain affordability while ensuring our online presence.
		</p>
		<article aria-label="Financial Statement for 2024">
			<h3>2024</h3>
			<p>
				Switched to Vercel's free tier for website hosting. No additional expenses were incurred.
			</p>
		</article>
		<article aria-label="Financial Statement for 2023">
			<h3>2023</h3>
			<p>Expense: $14.76 (Namecheap) funded by @mugiwarafx</p>
		</article>
		<article aria-label="Financial Statement for 2022">
			<h3>2022</h3>
			<p>Expense: $7.76 (Namecheap) funded by @mugiwarafx</p>
		</article>
	</section>
</main>
