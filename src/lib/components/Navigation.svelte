<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import { derived } from 'svelte/store';

	const routes = [
		{ path: '/', name: 'Manifesto' },
		{ path: '/tools', name: 'Tools' },
		{ path: '/join', name: 'Join' },
		{ path: '/issue-tracker', name: 'Issue Tracker' },
		{ path: '/transparency', name: 'Transparency' },
		{ path: '/accessibility-test', name: 'Accessibility Test' },
		{ path: '/blog', name: 'News' }
	];

	const currentPath = derived(page, ($page) => $page.url.pathname);

	/*
	function isActive(linkPath: string) {
		return $currentPath === linkPath ? 'active' : '';
	}
	*/

	// Make isActive a reactive statement that depends on currentPath
	// This way, isActive will be recalculated whenever currentPath changes
	$: isActive = (linkPath: string) => {
		return $currentPath === base + linkPath ? 'active' : '';
	};
</script>

<nav aria-label="Main menu" id="main-menu">
	<ul>
		{#each routes as { path, name }}
			<li>
				<a
					href="{base}{path}"
					class={isActive(path)}
					aria-current={isActive(path) ? 'page' : undefined}
				>
					{name}
				</a>
			</li>
		{/each}
	</ul>
</nav>
