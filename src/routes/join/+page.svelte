<script lang="ts">
	import Title from '$lib/components/Title.svelte';
	import Meta from '$lib/components/Meta.svelte';
	import Header from '$lib/components/Header.svelte';

	import { base } from '$app/paths';
</script>

<svelte:head>
	<Title title="Join" />
	<Meta
		content="Join the International Accessibility Task Force community. Whether you're a developer or a user, contribute towards a universally accessible web."
	/>
</svelte:head>

<Header title="Join" />

<main id="main">
	<section aria-label="Introduction">
		<h2>Becoming a Part of Our Community</h2>

		<p>
			Joining the International Accessibility Task Force (IATF) means becoming part of a passionate
			group dedicated to making technology accessible for everyone. Here's how you can get involved:
		</p>

		<ul>
			<li>
				<strong>Google Group:</strong> Share ideas and get updates. Open to everyone. Join us on our
				<a href="https://groups.google.com/g/internationalaccessibilitytaskforce">Google group</a>.
			</li>
			<li>
				<strong>Discord Server:</strong> A lively place for discussions. While open to all, server
				membership is required to view conversations. We share key updates and decisions on
				<a href="{base}/blog">our news webpage</a>
				to keep everyone aligned. Connect with us on our
				<a href="https://discord.gg/D8brSJSpaZ">Discord server</a>.
			</li>
			<li>
				<strong>GitHub Organization:</strong> Contribute to or initiate projects. Open for all to
				join. Collaborate with us on our
				<a href="https://github.com/international-accessibility-task-force">GitHub organization</a>.
			</li>
		</ul>

		<p>
			If these platforms don't suit you or you have specific inquiries, feel free to reach out via
			email at: <a href="mailto:internationalaccessibilitytaskforce@pm.me"
				>internationalaccessibilitytaskforce@pm.me</a
			>.
		</p>
	</section>

	<section aria-label="Community Users">
		<h2>IATF Users: The Heart of Our Mission</h2>

		<p>
			As an IATF User, you play a vital role. This group includes individuals who rely on assistive
			technologies for their daily activities, such as screen readers, and covers a wide range of
			needs including but not limited to:
		</p>
		<ul>
			<li>Blindness and low vision</li>
			<li>Deafness and hearing loss</li>
			<li>Limited mobility</li>
			<li>Speech disabilities</li>
			<li>Photosensitivity</li>
			<li>Cognitive limitations</li>
			<li>Senior citizens</li>
			<li>Those with multiple disabilities</li>
		</ul>

		<p>
			If you use assistive technologies for any reason, we believe you can offer valuable insights
			and contributions to our community.
		</p>
	</section>

	<section id="note-for-developers" aria-label="Community Developers">
		<h2>IATF Developers: Building Accessible Solutions</h2>
		<div>
			<p>
				IATF Developers are the backbone of our technical endeavors, turning user requests into
				real, open-source solutions. All software developed is under the GPL License, ensuring it
				remains free and accessible for the entire community.
			</p>

			<p><strong>Join Us Today</strong></p>

			<p>
				Whether as a User or Developer, your involvement can significantly impact making
				technologies more accessible. We're excited to welcome you to our Discord, Google Group, or
				GitHub community. Together, we can drive change and create a more inclusive digital world.
			</p>
		</div>
	</section>
</main>
