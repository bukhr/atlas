<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';

	import { themeStore } from '$lib/stores/theme.svelte';
	import { initGA } from '$lib/analytics';
	import type { LayoutData } from './$types';

	let { data, children } = $props<{ data: LayoutData; children: any }>();

	onMount(() => {
		themeStore.initialize();
		initGA();
	});
</script>

<svelte:head>
	<link rel="icon" href="/favicon.png" />
	<title>Atlas</title>
	<meta name="description" content="Atlas — Hierarchical viewer for Google Drive shared folders" />
</svelte:head>

{@render children()}
