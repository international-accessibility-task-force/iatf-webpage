<script lang="ts">
	import Title from '$lib/components/Title.svelte';
	import Meta from '$lib/components/Meta.svelte';
	import Header from '$lib/components/Header.svelte';
</script>

<svelte:head>
	<Title title="Issue Tracker" />
	<Meta
		content="Use the IATF Issue Tracker to report and monitor accessibility issues across websites and apps. Help us make the digital world accessible for all."
	/>
</svelte:head>

<Header title="Issue Tracker" />

<main id="main">
	<section aria-label="Introduction">
		<h2>Welcome to the Issue Tracker</h2>
		<p>
			At the International Accessibility Task Force, we're committed to identifying and addressing
			accessibility challenges to create a more inclusive digital world. Our Issue Tracker serves as
			a centralized platform where community members can report and monitor the status of
			accessibility issues across various websites and applications.
		</p>
		<p>
			If you encounter a barrier that hinders accessibility or know of a site that could be
			improved, we encourage you to share your findings with us. Your reports are invaluable in our
			collective effort to enhance digital accessibility for everyone.
		</p>
		<p>
			To report an issue, please send us an email detailing your experience and any relevant links
			to <a href="mailto:internationalaccessibilitytaskforce@pm.me"
				>internationalaccessibilitytaskforce@pm.me</a
			>. Together, we can make a difference!
		</p>
	</section>

	<section aria-label="Open Issues">
		<h2>Open Issues</h2>
		<article>
			<h3>Issue 1: <a href="https://www.localguidesconnect.com/">Local Guides Connect</a></h3>
			<p>
				Local Guides Connect, a platform by Google, enables individuals to share insights and
				experiences about different locations. Unfortunately, this site lacks accessibility features
				for people with disabilities, notably missing alternative text for numerous images.
			</p>
			<h4>Issue Status</h4>
			<p>Reported to the Google Accessibility Team on February 17, 2024.</p>
			<h4>WCAG Requirement</h4>
			<p>
				According to WCAG guideline 1.1.1 Non-text Content (Level A), all images should have text
				alternatives. For a detailed explanation of this requirement, visit the <a
					href="https://www.w3.org/WAI/WCAG22/quickref/?versions=2.1&showtechniques=111#text-alternatives"
					>How to Meet WCAG (Quick Reference)</a
				> website.
			</p>
			<h4>IATF Alternative</h4>
			<p>
				To assist, we've developed ITTAI, an AI capable of describing images via URLs. This tool can
				help make the images on the website more accessible. Additionally, we're enhancing ITTAI to
				support direct image uploads for descriptions.
				<a href="/tools">Explore ITTAI</a>.
			</p>
		</article>
	</section>
	<section aria-label="Closed Issues">
		<h2>Closed Issues</h2>
		<p>There are no closed issues at the moment. Please, check back later.</p>
	</section>
</main>
