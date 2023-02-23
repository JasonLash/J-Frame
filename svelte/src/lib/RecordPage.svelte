<script>
    import { currentFrameID } from '../stores';
    import { onMount } from 'svelte';
    
    import CameraTypeButtons from "./CameraTypeButtons.svelte";
    import RecordTimeButtons from "./RecordTimeButtons.svelte";
    import ConvertUI from "./ConvertUI.svelte";

    export let showRecordPage;
    export let db;

    let currentCameraType = "BACK";
    let currentTime = 5;
    let videoElement;
    var recorder;
    let isRecording = false;
    let recorededVideo = false;
    let showConvert = false;
    let blob;
    let downloadLink;


    const goBack = () =>{
        showRecordPage = false;
    }


    //video stuff
    
    const record = (time) =>{
        if(isRecording) return;
        isRecording = true;

        recorder.startRecording();

        var timeOutTime = time * 1000;
        setTimeout(function() {
            recorder.stopRecording(stopRecordingCallback);
        }, timeOutTime);
    }

    onMount(async () => {
        captureCamera(function(camera) {
            videoElement.muted = true;
            videoElement.volume = 0;
            videoElement.srcObject = camera;

            recorder = RecordRTC(camera, {
                type: 'video'
            });

            recorder.camera = camera;
        });
	});



    
    function captureCamera(callback) {
        if(currentCameraType == "FRONT"){
            navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 320, height: 240, facingMode: { exact: "environment" } }  }).then(function(camera) {
                callback(camera);
            }).catch(function(error) {
                alert('Unable to capture your camera. Please check console logs.');
                console.error(error);
            });
        }else{
            navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 320, height: 240 }  }).then(function(camera) {
            //navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 240, height: 320 }  }).then(function(camera) {
                callback(camera);
            }).catch(function(error) {
                alert('Unable to capture your camera. Please check console logs.');
                console.error(error);
            });
        }

    }

    $: if (currentCameraType == "FRONT" || currentCameraType == "BACK"){
        captureCamera(function(camera) {
            videoElement.muted = true;
            videoElement.volume = 0;
            videoElement.srcObject = camera;

            recorder = RecordRTC(camera, {
                type: 'video'
            });

            recorder.camera = camera;
        });
    }

    function stopRecordingCallback() {
        recorededVideo = true;
        isRecording = false;
        videoElement.src = videoElement.srcObject = null;
        videoElement.muted = false;
        videoElement.volume = 1;
        videoElement.src = URL.createObjectURL(recorder.getBlob());
        blob = recorder.getBlob()

        // let frames = extractFramesFromVideo(blob, 30);

        // console.log(frames);
        
        recorder.camera.stop();
        recorder.destroy();
        recorder = null;
    }

    const deleteVideo = () =>{
        recorededVideo = false;
        isRecording = false;

        captureCamera(function(camera) {
            videoElement.muted = true;
            videoElement.volume = 0;
            videoElement.srcObject = camera;

            recorder = RecordRTC(camera, {
                type: 'video'
            });

            recorder.camera = camera;
        });

    }

    const convertVideo = () =>{
        showConvert = true;
    }

</script>

{#if showConvert}
    <ConvertUI blob={blob} bind:db={db}/>
{/if}


<button class="backBtn" on:click={goBack}>Back</button>

<div class="center">

    <h3>Frame #{$currentFrameID}</h3>
    <div class="vidHolder">
        {#if !isRecording && !recorededVideo}
            <button on:click={() => record(currentTime)} class="recordBtn"><h3>Record</h3></button>
        {/if}
        <video bind:this={videoElement} muted autoplay playsinline loop></video>
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

    video{
        background: red;
        width: 22rem;
        height: 30rem;
        margin: auto;
    }
</style>