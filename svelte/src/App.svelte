<script>
	import Refresh from "./lib/Refresh.svelte";
	import FrameDetected from "./lib/FrameDetected.svelte";
	import FrameCollection from "./lib/FrameCollection.svelte";
	import { onMount } from 'svelte';



	//fetch esp32 for its id #
	const frameID = "000";

	//check saved array for id #
	let savedFrameIDs = ["001", "002", "003", "004"];

	let isNewFrame = true;
	let frameDetected = false;

	let showFrameDetected = false;

	//temp put yes
	//showFrameDetected = true;


	onMount(async () => {
		savedFrameIDs.forEach(id => {
			if(frameID == id){
				isNewFrame = false;
			}
		});
	});


	//if not found then show frame
	//if there is saved video, show upload window, else show new frame window
</script>

{#if showFrameDetected}
	<FrameDetected frameID={frameID} bind:showFrameDetected={showFrameDetected}/>
{/if}

<Refresh />
<FrameCollection bind:savedFrameIDs={savedFrameIDs}/>

