<script>
	import Refresh from "./lib/Refresh.svelte";
	import FrameDetected from "./lib/FrameDetected.svelte";
	import FrameCollection from "./lib/FrameCollection.svelte";
    import RecordPage from "./lib/RecordPage.svelte";

	//State 
	let isNewFrame = true;
	let showFrameDetected = false;
	let showRecordPage = false;

	//fetch esp32 for its id #
	let frameID;

	//check saved array for id #
	let FramesData = [];

	const checkFrame = (postFrameID) => {
		if (postFrameID == "OFFLINE") return false;

		FramesData.forEach(frame => {
			if(postFrameID == frame.id){
				isNewFrame = false;
			}
		});

		if(isNewFrame){
			frameID = postFrameID;
			const transaction = db.transaction(["frames"], "readwrite");
			transaction.oncomplete = (event) => {
				console.log("Added new frame!");
			};

			transaction.onerror = (event) => {
				// Don't forget to handle errors!
				console.log("Error adding new frame")
			};

			const objectStore = transaction.objectStore("frames");

			let frameDataScheme = {
				id: postFrameID,
				videoFile : null
			}

			const request = objectStore.add(frameDataScheme);
			request.onsuccess = (event) => {
			};

			showFrameDetected = true;

			FramesData.push(frameDataScheme);
			FramesData = FramesData;
		}
	}

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
			}else{
				console.log(FramesData);
				checkFrame(FRAMEID);
			}
		};
    };

    request.onupgradeneeded = (event) => {
        db = event.target.result;
		db.createObjectStore("frames", { keyPath: "id" });
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