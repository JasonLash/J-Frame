<script>
    import { currentFrameID } from '../stores';
    import { onMount } from 'svelte';
    
    import CameraTypeButtons from "./CameraTypeButtons.svelte";
    import RecordTimeButtons from "./RecordTimeButtons.svelte";
    import ConvertUI from "./ConvertUI.svelte";
    import FlipIcon from "./FlipIcon.svelte";
    export let showRecordPage;
    export let db;
    export let showFrameSaved;
    let isFrontCamera = true;
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
    $: if (isFrontCamera == true || isFrontCamera == false){
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
        if(isFrontCamera == true){
            camStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 320, height: 240 }});
        }else{
            camStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 320, height: 240, facingMode: { exact: "environment" }}});
        }
        
        
        recorder = new MediaRecorder(camStream);
        videoElement.muted = true;
        videoElement.volume = 0;
        videoElement.srcObject = camStream;
    }
    const startRecording = () => {
        recorededVideo = false;
        isRecording = true;
        recorder.addEventListener('dataavailable', function(e) {
            blobs_recorded.push(e.data);
        });
        recorder.start(100);
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
    const changeCamType = () =>{
        isFrontCamera = !isFrontCamera
    }
</script>

{#if showConvert}
    <ConvertUI blob={blob} bind:db={db} bind:showFrameSaved={showFrameSaved} bind:showRecordPage={showRecordPage}/>
{/if}


<button class="backBtn" on:click={goBack}>Back</button>

<div class="center">

    <h3>Frame #{$currentFrameID}</h3>
    <div class="vidHolder">

        {#if !recorededVideo}
            <button class="recordBtn"
                on:mousedown={startRecording} 
                on:mouseup={stopRecording} 
                on:touchstart={startRecording} 
                on:touchend={stopRecording} 
                on:touchcancel={stopRecording} >
                <div class="recordCenter"></div>
            </button>
        {/if}



        {#if !isRecording && !recorededVideo}
        <button class="flipBtn" on:click={changeCamType}>
            <FlipIcon />
        </button>
        {/if}

        <div class="videoMask">
            <video bind:this={videoElement} muted autoplay playsinline loop></video>
        </div>
        
    </div>
    
    {#if recorededVideo}
        <div class="bottomBtns">
            <button on:click={deleteVideo} class="redBtn"><h3>Retake</h3></button>
            <button on:click={convertVideo} class="saveBtn"><h3 style="color: #484848;">Save</h3></button>
        </div>

    {/if}
</div>


<style>
    .bottomBtns{
        margin-top: 1rem;
        display: flex;
        flex-direction: row;
        justify-content: space-between;
    }
    .vidHolder{
        margin: auto;
        display: flex;
        justify-content: center;
    }
    .recordCenter{
        background: #fff;
        width: 4.5rem;
        min-height: 4.5rem;
        border-radius: 100%;
    }
    .recordBtn{
        position: absolute;
        z-index: 4;
        margin-top: 23rem;
        width: 5rem;
        height: 4rem;
        border: 3px solid #ffffff;
        background: none;
        border-radius: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }
    .flipBtn{
        position: absolute;
        z-index: 4;
        margin-top: 24rem;
        margin-left: 15rem;
        width: 3.5rem;
        height: 2.5rem;
        background: #242424a4;
        border: 0px;
        border-radius: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }
    .redBtn{
        background: #939393;
        width: 40%;
    }
    .saveBtn{
        background: #E9CA5D;
        width: 40%;
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
        margin-top:1rem;
        margin-left:1rem;
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
        background: red;
        border-radius: 15px;
    }
</style>