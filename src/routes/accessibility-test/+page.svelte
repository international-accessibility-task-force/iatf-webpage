<script lang="ts">
	import Title from '$lib/components/Title.svelte';
	import Meta from '$lib/components/Meta.svelte';
	import Header from '$lib/components/Header.svelte';
</script>

<svelte:head>
	<Title title="Accessibility Test" />
	<Meta
		content="Get your app or website tested by real users with disabilities. The IATF offers unique accessibility testing services to ensure your product is universally accessible."
	/>
</svelte:head>

<Header title="Accessibility Test" />

<main id="main">
	<section>
		<section>
			<h2>Test Accessibility with IATF Users</h2>
			<p>
				While automated tools provide a baseline check, nothing compares to insights from real
				users. The International Accessibility Task Force (IATF) brings you a distinctive service:
				real-world accessibility testing by diverse individuals, each facing different challenges,
				and using a variety of assistive technologies. Our aim is to ensure your application is
				genuinely accessible to every user.
			</p>
			<p>
				<strong>Service Cost:</strong> $50 USD per testing hour. To safeguard user privacy, recording
				during test sessions is strictly prohibited.
			</p>
			<p>
				<strong>Process:</strong> Introduce your application to IATF's lead maintainers, highlighting
				specific accessibility features you wish to evaluate. We'll then curate a group of testers suited
				to your needs, coordinate the testing scope, and schedule. Following payment, our testers have
				one month to provide their feedback. This payment is forwarded to them as a gesture of gratitude
				for their critical contributions.
			</p>
			<h3>A Commitment to Openness and Non-Profit Service</h3>
			<p>
				As a non-profit, open-source endeavor, the IATF is deeply committed to fostering a world
				where digital access is universal. Our accessibility testing service is just one aspect of
				our broader mission, characterized by an unwavering commitment to inclusivity rather than
				profit. <b
					>Every cent of the $50 USD hourly fee is a direct contribution to our testers,
					acknowledging their essential role in promoting digital inclusivity</b
				>. With your support, we continue to advance towards a more accessible digital landscape for
				all.
			</p>
		</section>
	</section>
</main>
