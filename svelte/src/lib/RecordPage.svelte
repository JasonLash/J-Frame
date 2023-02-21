<script>
    import { currentFrameID } from '../stores';
    import { onMount } from 'svelte';
    
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
            //navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 320, height: 240 }  }).then(function(camera) {
            navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 240, height: 320 }  }).then(function(camera) {
                callback(camera);
            }).catch(function(error) {
                alert('Unable to capture your camera. Please check console logs.');
                console.error(error);
            });
        }

    }

    function stopRecordingCallback() {
        recorededVideo = true;
        isRecording = false;
        videoElement.src = videoElement.srcObject = null;
        videoElement.muted = false;
        videoElement.volume = 1;
        videoElement.src = URL.createObjectURL(recorder.getBlob());
        blob = recorder.getBlob()

        let frames = extractFramesFromVideo(blob, 30);

        console.log(frames);
        
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

    
    async function extractFramesFromVideo(videoBlob, fps) {
        return new Promise(async (resolve) => {
            // fully download it first (no buffering):
            let videoObjectUrl = URL.createObjectURL(videoBlob);
            let video = document.createElement("video");

            let seekResolve;
            video.addEventListener("seeked", async function () {
            if (seekResolve) seekResolve();
            });

            video.src = videoObjectUrl;

            // workaround chromium metadata bug (https://stackoverflow.com/q/38062864/993683)
            while (
            (video.duration === Infinity || isNaN(video.duration)) &&
            video.readyState < 2
            ) {
            await new Promise((r) => setTimeout(r, 1000));
            video.currentTime = 10000000 * Math.random();
            }
            let duration = video.duration;

            let canvas = document.createElement("canvas");
            let context = canvas.getContext("2d");
            let [w, h] = [video.videoWidth, video.videoHeight];
            canvas.width = w;
            canvas.height = h;

            let frames = [];
            let interval = 1 / fps;
            let currentTime = 0;

            let currentFrame = 0;

            while (currentTime < duration) {
                video.currentTime = currentTime;
                await new Promise((r) => (seekResolve = r));

                if(currentFrame == 3){
                    context.drawImage(video, 0, 0, w, h);
                    let base64ImageData = canvas.toDataURL('image/jpeg', 0.75);
                    //console.log(base64ImageData);
                    frames.push(base64ImageToBlob(base64ImageData.slice(23)));
                    currentFrame = 0;
                }
  
                currentFrame++;
                currentTime += interval;
            }
            resolve(frames);

            let newBlob = new Blob(frames, { type: "video/mjpeg" });
            console.log(newBlob);
            downloadLink = URL.createObjectURL(newBlob);
        });
    }

    function base64ImageToBlob(b64) {
        var imageContent = atob(b64);
        var buffer = new ArrayBuffer(imageContent.length);
        var view = new Uint8Array(buffer);

        for(var n = 0; n < imageContent.length; n++) {
            view[n] = imageContent.charCodeAt(n);
        }

        return buffer;
    }




</script>

{#if showConvert}
    <ConvertUI blob={blob}/>
{/if}


<button class="backBtn" on:click={goBack}>Back</button>

<div class="center">

    <h3>Frame #{$currentFrameID}</h3>
    <div class="vidHolder">
        <button on:click={() => record(currentTime)} class="recordBtn"><h3>Record</h3></button>
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

    <a href={downloadLink}>DOWNLOAD!!!!!</a>
</div>


<style>

    .vidHolder{
        margin: auto;
        display: flex;
        justify-content: center;
    }

    .recordBtn{
        position: absolute;
        z-index: 10;
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