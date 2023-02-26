<script>
	import Refresh from "./lib/Refresh.svelte";
	import FrameDetected from "./lib/FrameDetected.svelte";
	import FrameSaved from "./lib/FrameSaved.svelte";
	import FrameCollection from "./lib/FrameCollection.svelte";
    import RecordPage from "./lib/RecordPage.svelte";
	import FrameUpload from "./lib/FrameUpload.svelte";
	
	import { FRAMEID } from './stores';

	//State 
	let isNewFrame = true;
	let showFrameDetected = false;
	let showFrameSaved = false;
	let showRecordPage = false;
	let showUpload = false;
	let savedVideoConnectedFrame = false;

	let FramesData = [];  

	let gotFrameID = false;
	let initializedDB = false;
	let videoFileToUpload;

	function getFrameData(){
		//Get frame ID
		console.log("Getting Frame ID")
		fetch('getFrameID')
		.then((response) => response.json())
		.then((data) => {
			console.log("Frame ID: " + data.frameID)
			FRAMEID.set(data.frameID);
			gotFrameID = true;
			if(initializedDB == true){
				checkFrame($FRAMEID);
			}
		})
		.catch((error) => {
			console.log("Could not connect to frame")
			FRAMEID.set("OFFLINE");
			//FRAMEID.set("001");
			// gotFrameID = true;
			// if(initializedDB == true){
			// 	checkFrame($FRAMEID);
			// }
			console.log($FRAMEID);
			
		});;
	}


	//getFrameData();

	$: if(showRecordPage == false || showUpload == false){
		getFrameData();
		if(initializedDB == true){
			checkDB();
		}
	}


	$: if(showFrameSaved == false){
		if(savedVideoConnectedFrame){
			showUpload = true;
		}
	}


	const checkFrame = (postFrameID) => {
		console.log(postFrameID);
		if (postFrameID == "OFFLINE") return false;

		FramesData.forEach(frame => {
			if(postFrameID == frame.id){
				isNewFrame = false;
			}
		});

		if(isNewFrame){
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
		}else {
			FramesData.every(f => {
				if(f.id == postFrameID){
					console.log(f.id == postFrameID)
					if(f.videoFile != null){
						savedVideoConnectedFrame = true;
						videoFileToUpload = f.videoFile;
					}
					return false;
				}
				return true;
			})
		}
	}

    const request = window.indexedDB.open("MyTestDatabase", 1);
    let db;


    request.onerror = (event) => {
        console.error("Why didn't you allow my web app to use IndexedDB?!");
    };

	request.onsuccess = (event) => {
		db = event.target.result;
		checkDB();
	};


	
	function checkDB(){
		FramesData = [];
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
				initializedDB = true;
				console.log(FramesData);
				if(gotFrameID == true){
					console.log("checking frame in indexdb")
					checkFrame($FRAMEID);
				}
			}
		};
	}


    request.onupgradeneeded = (event) => {
        db = event.target.result;
		db.createObjectStore("frames", { keyPath: "id" });
    };


	//if not found then show frame
	//if there is saved video, show upload window, else show new frame window
</script>

{#if !showRecordPage}

	{#if showFrameDetected}
		<FrameDetected bind:showFrameDetected={showFrameDetected}/>
	{:else if showFrameSaved}
		<FrameSaved  bind:showFrameSaved={showFrameSaved}/>
	{:else if showUpload}
		<FrameUpload  bind:showUpload={showUpload} bind:videoFileToUpload={videoFileToUpload} bind:db={db}/>
	{/if}

	<Refresh />
	<FrameCollection bind:FramesData={FramesData} bind:showRecordPage={showRecordPage}/>
{:else}
	<RecordPage bind:showRecordPage={showRecordPage} bind:db={db} bind:showFrameSaved={showFrameSaved}/>

{/if}