<script>
    import { currentFrameID } from '../stores';
    import CameraTypeButtons from "./CameraTypeButtons.svelte";
    import RecordTimeButtons from "./RecordTimeButtons.svelte";

    export let showRecordPage;

    let currentCameraType = "BACK";
    let currentTime = 5;
    let videoElement;
    var recorder;
    let isRecording = false;

    const goBack = () =>{
        showRecordPage = false;
    }


    //video stuff
    

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

    const record = (time) =>{
        if(isRecording) return;
        isRecording = true;

        recorder.startRecording();

        var timeOutTime = time * 1000;
        setTimeout(function() {
            recorder.stopRecording(stopRecordingCallback);
        }, timeOutTime);
    }

    function stopRecordingCallback() {
        videoElement.src = videoElement.srcObject = null;
        videoElement.muted = false;
        videoElement.volume = 1;
        videoElement.src = URL.createObjectURL(recorder.getBlob());
        let blob = recorder.getBlob()

        console.log(recorder.getBlob());
        
        recorder.camera.stop();
        recorder.destroy();
        recorder = null;
    }


    
</script>


<button class="backBtn" on:click={goBack}>Back</button>

<div class="center">
    <h3>Frame #{$currentFrameID}</h3>
    <video bind:this={videoElement} muted autoplay playsinline loop></video>
    <h4>Camera type</h4>
    <CameraTypeButtons bind:currentCameraType={currentCameraType}/>
    <h4 style="margin-top: 1rem;">Record Time</h4>
    <RecordTimeButtons bind:currentTime={currentTime}/>
    <button on:click={() => record(2)} class="recordBtn"><h3>Record</h3></button>
</div>


<style>

    .recordBtn{
        margin-top: 2rem;
        background: #97504B;
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