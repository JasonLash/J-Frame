<script>
    import { onMount } from 'svelte';
    import { currentFrameID } from '../stores';

    let convertLoadingBar;
    let currentTaskText = "Loading in video file...";
    export let blob;
    export let db;

    onMount(async () => {
        convertLoadingBar.style.width = "0%";

        extractFramesFromVideo(blob);
	});

    async function extractFramesFromVideo(videoBlob) {
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
            while ((video.duration === Infinity || isNaN(video.duration)) &&
                video.readyState < 2) 
            {
                await new Promise((r) => setTimeout(r, 1000));
                video.currentTime = 10000000 * Math.random();
            }
            let duration = video.duration;

            let canvas = document.createElement("canvas");
            let context = canvas.getContext("2d");
            let [w, h] = [video.videoWidth, video.videoHeight];
            canvas.width = 240;
            canvas.height = 320;

            let frames = [];
            let fps = 30;
            let interval = 1 / fps;
            let currentTime = 0;

            let totalFrames = Math.round(duration * fps);
            console.log(totalFrames);

            let frameCounter = 0;
            let currentFrame = 0;

            while (currentTime < duration) {
                video.currentTime = currentTime;
                //alert(currentFrame);
                await new Promise((r) => (seekResolve = r));

                if(frameCounter == 3){
                    context.drawImage(video, 0, 0, w, h);
                    let base64ImageData = canvas.toDataURL('image/jpeg', 0.9);
                    //console.log(base64ImageData);
                    frames.push(base64ImageToBlob(base64ImageData.slice(23)));
                    frameCounter = 0;
                }
  
                frameCounter++;
                currentFrame++;
                //console.log(currentFrame/totalFrames);
                currentTaskText = "Frame: " + currentFrame + " out of: " + totalFrames;
                convertLoadingBar.style.width = ((currentFrame/totalFrames) * 100) + "%";
                currentTime += interval;
            }
            resolve(frames);

            let newBlob = new Blob(frames, { type: "video/mjpeg" });
            console.log(newBlob);

            let formData = new FormData();
            let newFile = new File([newBlob], "pleaseworkvideo.mjpeg")
            formData.append("data", newFile);
            fetch('/upload', {method: "POST", body: formData})
            
            const objectStore = db.transaction(["frames"], "readwrite").objectStore("frames");
            const request = objectStore.get($currentFrameID);
            request.onerror = (event) => {
            // Handle errors!
                console.log("Error uploading video to indexedDB")
            };
            request.onsuccess = (event) => {
                // Get the old value that we want to update
                const data = event.target.result;

                // update the value(s) in the object that you want to change
                data.video = newBlob;

                // Put this updated object back into the database.
                const requestUpdate = objectStore.put(data);
                requestUpdate.onerror = (event) => {
                    // Do something with the error
                    console.log("Data ERROR while loged")
                };
                requestUpdate.onsuccess = (event) => {
                    // Success - the data is updated!
                    console.log("Data loged")
                };
            };

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

<div class="blackout"></div>

<div class="bg">
    <div class="topAndBottom">
        <h2>Saving Video</h2>
        <h4>This might take a bit</h4>
    </div>

    <div class="topAndBottom">
        <div class="loadingBG"> 
            <div bind:this={convertLoadingBar} class="loadingMain"></div>
        </div>
    
        <h4>{currentTaskText}</h4>
    </div>

    

</div>

<style>
    .topAndBottom{
        margin: 1rem auto;
        display: flex;
        justify-content: center;
        flex-direction: column;
        width: 90%;
    }


    h4{
        color: #C7C7C7;
        text-align: center;
        margin: 0.35rem auto;
    }

    .loadingBG{
        width: 100%;
        background: #757575;
        margin: 1rem auto;
        border-radius: 5px;
    }

    .loadingMain{
        height: 30px;
        background: #E9CA5D;
        border-radius: 5px;
    }

    .bg{
        margin: 0;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #222222;
        border: 7px solid #757575;
        border-radius: 23px;
        width: 90%;
        min-height: 10%;

        display: flex;
        flex-direction: column;
        justify-content: space-between;
        z-index: 6;

    }

    .blackout{
        z-index: 5;
        position: absolute;
        background: #000000aa;
        width: 100vw;
        height: 100vh;
    }

</style>