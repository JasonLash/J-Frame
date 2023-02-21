<script>
	import Refresh from "./lib/Refresh.svelte";
	import FrameDetected from "./lib/FrameDetected.svelte";
	import FrameCollection from "./lib/FrameCollection.svelte";
	import { onMount } from 'svelte';
    import RecordPage from "./lib/RecordPage.svelte";



	//fetch esp32 for its id #
	const frameID = "000";

	//check saved array for id #
	let FramesData = [];

	let isNewFrame = true;
	let frameDetected = false;

	let showFrameDetected = false;

	let showRecordPage = false;

	//temp put yes
	//showFrameDetected = true;


	onMount(async () => {
		// FramesData.forEach(id => {
		// 	if(frameID == id){
		// 		isNewFrame = false;
		// 	}
		// });
	});

	// let frameData = [
    //     { id: "001", videoFile: null},
    //     { id: "002", videoFile: null}
    // ];

    const request = window.indexedDB.open("MyTestDatabase", 1);
    let db;
    request.onerror = (event) => {
        console.error("Why didn't you allow my web app to use IndexedDB?!");
    };
    request.onsuccess = (event) => {
        db = event.target.result;
        const transaction = db.transaction(["frames"]);
        const objectStore = transaction.objectStore("frames");
		objectStore.openCursor().onsuccess = (event) => {
			const cursor = event.target.result;
			if (cursor) {
				//console.log(`Frame ID: ${cursor.key}`);
				FramesData.push(cursor.value);
				FramesData = FramesData;
				cursor.continue();
			}
		};

		console.log(FramesData);
        // const request2 = objectStore.get("001");
        // request2.onerror = (event) => {
        //     console.log("SETSEESTSTES ERROR")
        // };
        // request2.onsuccess = (event) => {
        //     console.log(event.target.result);
        // };
    };

    // This event is only implemented in recent browsers
    request.onupgradeneeded = (event) => {
        // Save the IDBDatabase interface
        db = event.target.result;
		db.createObjectStore("frames", { keyPath: "id" });
        //let objectStore = db.createObjectStore("frames", { keyPath: "id" });
        // objectStore.transaction.oncomplete = (event) => {
        //     // Store values in the newly created objectStore.
        //     const frameObjectStore = db.transaction("frames", "readwrite").objectStore("frames");
        //     frameData.forEach((frame) => {
        //         frameObjectStore.add(frame);
        //     });
        // };
    };


	//if not found then show frame
	//if there is saved video, show upload window, else show new frame window
</script>

{#if !showRecordPage}

	{#if showFrameDetected}
		<FrameDetected frameID={frameID} bind:showFrameDetected={showFrameDetected}/>
	{/if}

	<Refresh />
	<FrameCollection bind:FramesData={FramesData} bind:showRecordPage={showRecordPage}/>
{:else}
	<RecordPage bind:showRecordPage={showRecordPage} bind:db={db}/>

{/if}