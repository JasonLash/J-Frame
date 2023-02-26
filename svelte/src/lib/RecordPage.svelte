<script>
    import { currentFrameID } from '../stores';
    import { onMount } from 'svelte';
    
    import CameraTypeButtons from "./CameraTypeButtons.svelte";
    import RecordTimeButtons from "./RecordTimeButtons.svelte";
    import ConvertUI from "./ConvertUI.svelte";

    export let showRecordPage;
    export let db;
    export let showFrameSaved;

    let currentCameraType = "FRONT";
    let currentTime = 5;
    let videoElement;
    let isRecording = false;
    let recorededVideo = false;
    let showConvert = false;
    let blob;
    let downloadLink;
    let cameraAccess = false;


    onMount(async () => {
        cameraAccess = false;
        askForCameraPermission().then((e) =>{
            cameraAccess = true;
        }).catch(function(error) {
            alert('Unable to capture your camera. Please check console logs.');
            console.error(error);
        });;
	});

    $: if (currentCameraType == "FRONT" || currentCameraType == "BACK"){
        askForCameraPermission();
    }

    const deleteVideo = () =>{
        recorededVideo = false;
        isRecording = false;

        askForCameraPermission();
    }

    const convertVideo = () =>{
        showConvert = true;
    }

    const goBack = () =>{
        showRecordPage = false;
    }

    //new video stuff
    let camStream = null;
    let recorder = null;
    let blobs_recorded = [];

    async function askForCameraPermission(){
        if(currentCameraType == "FRONT"){
            camStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 320, height: 240 }});
        }else{
            camStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 320, height: 240, facingMode: { exact: "environment" }}});
        }
        
        
        recorder = new MediaRecorder(camStream);

        videoElement.muted = true;
        videoElement.volume = 0;
        videoElement.srcObject = camStream;
    }

    const startRecording = (time) => {
        recorededVideo = false;
        isRecording = true;

        

        recorder.addEventListener('dataavailable', function(e) {
            blobs_recorded.push(e.data);
        });

        recorder.start(100);

        setTimeout(function() {
            stopRecording();
        }, time * 1000);

    }


    const stopRecording = () => {
        recorededVideo = true;
        isRecording = false;

        recorder.stop(); 
        camStream.getTracks().forEach(track => track.stop());
        videoElement.src = videoElement.srcObject = null;

        blob = new Blob(blobs_recorded, { type: recorder.mimeType });
        let videoLink = URL.createObjectURL(blob);
        //alert(videoLink)
        videoElement.src = videoLink;
        downloadLink = videoLink;

        console.log(blobs_recorded);
        console.log(blob);
    }

</script>

{#if showConvert}
    <ConvertUI blob={blob} bind:db={db} bind:showFrameSaved={showFrameSaved} bind:showRecordPage={showRecordPage}/>
{/if}


<button class="backBtn" on:click={goBack}>Back</button>

<div class="center">

    <h3>Frame #{$currentFrameID}</h3>
    <div class="vidHolder">
        {#if !isRecording && !recorededVideo && cameraAccess}
            <button on:click={() => startRecording(currentTime)} class="recordBtn"><h3>Record</h3></button>
        {/if}
        <div class="videoMask">
            <video bind:this={videoElement} muted autoplay playsinline loop></video>
        </div>
        
    </div>
    

    {#if !isRecording && !recorededVideo}
        <h4>Camera type</h4>
        <CameraTypeButtons bind:currentCameraType={currentCameraType}/>
        <h4 style="margin-top: 1rem;">Record Time</h4>
        <RecordTimeButtons bind:currentTime={currentTime}/>
        
    {:else if isRecording}
        <h3>Recording</h3>
    {:else if recorededVideo}
        <button on:click={convertVideo} class="saveBtn"><h3>Save Video</h3></button>
        <button on:click={deleteVideo} class="redBtn"><h3>Delete Video</h3></button>
    {/if}
</div>


<style>

    .vidHolder{
        margin: auto;
        display: flex;
        justify-content: center;
    }

    .recordBtn{
        position: absolute;
        z-index: 4;
        margin-top: 25rem;
        width: 80%;
        background: #97504B;
    }

    .redBtn{
        margin-top: 2rem;
        background: #97504B;
    }

    .saveBtn{
        margin-top: 2rem;
        background: #E9CA5D;
    }

    .center{
        display: flex;
        flex-direction: column;
        justify-content: center;
    }

    h4{
        color: #C7C7C7;
        text-align: center;
        margin: 0.35rem auto;
    }

    h3{
        margin: 0.25em auto;
    }

    .backBtn{
        width: 30%;
    }

    h3{
        color: #fff;
        text-align: center;
    }

    .videoMask{
        border-radius: 10px;
    }

    video{
        width: 22rem;
        height: 30rem;
        margin: auto;
        
    }
</style>