<script lang="ts">
	import Skip from '$lib/components/Skip.svelte';
	import Navigation from '$lib/components/Navigation.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import './styles.css';
</script>

<Skip />
<Navigation />
<slot />
<Footer />
