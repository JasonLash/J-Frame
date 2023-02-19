<script>
    import { currentFrameID } from '../stores';
    import CameraTypeButtons from "./CameraTypeButtons.svelte";
    import RecordTimeButtons from "./RecordTimeButtons.svelte";
    import ConvertUI from "./ConvertUI.svelte";

    export let showRecordPage;

    let currentCameraType = "BACK";
    let currentTime = 5;
    let videoElement;
    var recorder;
    let isRecording = false;
    let recorededVideo = false;
    let showConvert = false;
    let blob;


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


    captureCamera(function(camera) {
        videoElement.muted = true;
        videoElement.volume = 0;
        videoElement.srcObject = camera;

        recorder = RecordRTC(camera, {
            type: 'video'
        });

        recorder.camera = camera;
    });
    
    function captureCamera(callback) {
        navigator.mediaDevices.getUserMedia({ audio: true, video: true  }).then(function(camera) {
            callback(camera);
        }).catch(function(error) {
            alert('Unable to capture your camera. Please check console logs.');
            console.error(error);
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
    <ConvertUI blob={blob}/>
{/if}


<button class="backBtn" on:click={goBack}>Back</button>

<div class="center">

    <h3>Frame #{$currentFrameID}</h3>
    <video bind:this={videoElement} muted autoplay playsinline loop></video>

    {#if !isRecording && !recorededVideo}
        <h4>Camera type</h4>
        <CameraTypeButtons bind:currentCameraType={currentCameraType}/>
        <h4 style="margin-top: 1rem;">Record Time</h4>
        <RecordTimeButtons bind:currentTime={currentTime}/>
        <button on:click={() => record(currentTime)} class="recordBtn"><h3>Record</h3></button>
    {:else if isRecording}
        <h3>Recording</h3>
    {:else if recorededVideo}
        <button on:click={convertVideo} class="saveBtn"><h3>Save Video</h3></button>
        <button on:click={deleteVideo} class="recordBtn"><h3>Delete Video</h3></button>
    {/if}
</div>


<style>

    .recordBtn{
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