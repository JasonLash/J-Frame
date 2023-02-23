<script>
    import { onMount } from 'svelte';
    import { currentFrameID } from '../stores';

    let convertLoadingBar;
    let currentTaskText = "Loading in video file...";
    export let blob;
    export let db;

    let video;

    let linkDownlaod;

    onMount(async () => {
        convertLoadingBar.style.width = "0%";


        // let frames = extractFramesFromVideo(blob); 
        // frames.then(function(results){
        //     convertFrames(results)
        //     console.log(results);
        // });

        ScanVideo(blob);
	});

    // async function extractFramesFromVideo(videBlob) {
    //     return new Promise(async (resolve) => {
    //         let videoObjectUrl = URL.createObjectURL(videBlob);
    //         let video = document.createElement("video");
    //         video.autoplay = true;
    //         video.playsInline = true;
    //         video.muted = true;
    //         video.load();
            
    //         while ((video.duration === Infinity || isNaN(video.duration)) && video.readyState < 2) 
    //         {
    //             await new Promise((r) => setTimeout(r, 1000));
    //             video.currentTime = 10000000 * Math.random();
    //         }
            

    //         let seekResolve;
    //         video.addEventListener('seeked', async function() {
    //             if(seekResolve) seekResolve();
    //         });

    //         video.addEventListener('loadeddata', async function() {
    //             let canvas = document.createElement('canvas');
    //             let context = canvas.getContext('2d');
    //             let [w, h] = [240, 320]
    //             canvas.width = 240;
    //             canvas.height = 320;



    //             let frames = [];
    //             let fps = 30;
    //             let wantedFPS = 10;
    //             let fpsIntervel = fps / wantedFPS;
    //             let interval = 1 / fps;
    //             let currentTime = 0;
    //             let duration = video.duration;
    //             let frameCounter = 0;

    //             let totalFrames = Math.round(duration * fps);

    //             while(currentTime < duration) {
    //                 video.currentTime = currentTime;
    //                 await new Promise(r => seekResolve=r);
                    
    //                 // if(frameCounter % fpsIntervel == 0){
    //                 //     context.drawImage(video, 0, 0, w, h);
    //                 //     let base64ImageData = canvas.toDataURL('image/jpeg', 0.9);
    //                 //     frames.push(base64ImageToBlob(base64ImageData.slice(23)));
    //                 // }
                    
    //                 console.log(duration);
    //                 frameCounter++;
    //                 // // currentTaskText = "Frame: " + frameCounter + " out of: " + totalFrames;
    //                 // //convertLoadingBar.style.width = ((currentFrame/totalFrames) * 100) + "%";
    //                 // //alert(frameCounter);
    //                 currentTime += interval;
    //             }
    //             //alert("done");
    //             resolve(frames);

    //             // let newBlob = new Blob(frames, { type: "video/mjpeg" });
    //             // //console.log(newBlob);

    //             // linkDownlaod = URL.createObjectURL(newBlob);

    //             // let formData = new FormData();
    //             // let newFile = new File([newBlob], "pleaseworkvideo.mjpeg")
    //             // formData.append("data", newFile);
    //             // fetch('/upload', {method: "POST", body: formData})
    //         });

    //         // set video src *after* listening to events in case it loads so fast
    //         // that the events occur before we were listening.
            
    //         video.src = videoObjectUrl; 
    //     });
    //     }






    const convertFrames = (frameData) => {
        let newFrameData = [];
        //newFrameData = frameData;
        // frameData.forEach(f => {
        //     newFrameData.push(base64ImageToBlob(f.slice(23)));
        // });

        // frameData.forEach(f => {
        //     newFrameData.push(base64ImageToBlob(f.slice(23)));
        // });

        let newBlob = new Blob(frameData, { type: "video/mjpeg" });
        linkDownlaod = URL.createObjectURL(newBlob);

        // console.log(newBlob);

        let formData = new FormData();
        let newFile = new File([newBlob], "pleaseworkvideo.mjpeg")
        formData.append("data", newFile);
        fetch('/upload', {method: "POST", body: formData})

        // return newFrameData;
    }

    const ScanVideo = (videoBlob) => {
        let videoObjectUrl = URL.createObjectURL(videoBlob);
        //const video = document.createElement("video");
        let canvas = document.createElement("canvas");
        let context = canvas.getContext("2d");

        let fps = 30;
        let interval = 1 / fps;
        let currentTime = 0;

        canvas.width = 240;
        canvas.height = 320;

        video.src = videoObjectUrl;
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        video.controls = false;
        video.load();

        let duration;

        let frames = [];
        let frameCounter = 0;
        let wantedFPS = 10;
        let fpsIntervel = fps / wantedFPS;

        video.addEventListener('seeked', (event) => {
            //console.log('Video found the playback position it was looking for.');
            if (currentTime > duration){
                convertFrames(frames);
                return;
            };

            setTimeout(() => {
                video.currentTime = currentTime;

                if(frameCounter % fpsIntervel == 0){
                    context.drawImage(video, 0, 0, 240, 320);
                    //let base64ImageData = canvas.toDataURL('image/jpeg', 0.1);
                    canvas.toBlob(function(blob){frames.push(blob);}, 'image/jpeg', 0.4);
                }

                frameCounter++;
                console.log(currentTime);
                currentTime += interval;
            }, "100")



        });

        video.addEventListener('loadeddata', function() { 
            duration = video.duration;
            console.log(duration);
            video.currentTime = currentTime;
        });

        video.addEventListener('durationchange', function() { 
            duration = video.duration;
        });
    }

    // async function extractFramesFromVideo(videoBlob) {
    //     return new Promise(async (resolve) => {
    //         // fully download it first (no buffering):
    //         let videoObjectUrl = URL.createObjectURL(videoBlob);
    //         const video = document.createElement("video");
    //         video.autoplay = true;
    //         video.playsInline = true;
    //         video.muted = true;

    //         let seekResolve;
    //         video.addEventListener("seeked", async function () {
    //             if (seekResolve) seekResolve();
    //         });


    //         video.src = videoObjectUrl;
    //         video.load();

    //         // workaround chromium metadata bug (https://stackoverflow.com/q/38062864/993683)
    //         while ((video.duration === Infinity || isNaN(video.duration)) && video.readyState < 2) 
    //         {
    //             await new Promise((r) => setTimeout(r, 1000));
    //             video.currentTime = 10000000 * Math.random();
    //         }
    //         let duration = video.duration;

    //         let canvas = document.createElement("canvas");
    //         let context = canvas.getContext("2d");
    //         let [w, h] = [video.videoWidth, video.videoHeight];
    //         canvas.width = 240;
    //         canvas.height = 320;

    //         let frames = [];
    //         let fps = 30;
    //         let wantedFPS = 10;
    //         let fpsIntervel = fps / wantedFPS;
    //         let interval = 1 / fps;
    //         let currentTime = 0;

    //         //let totalFrames = Math.round(duration * fps);

    //         let frameCounter = 0;
    //         //let currentFrame = 0;

    //         while (currentTime < duration) {
    //             video.currentTime = currentTime;
    //             await new Promise((r) => (seekResolve = r));

    //             if(frameCounter % fpsIntervel == 0){
    //                 context.drawImage(video, 0, 0, w, h);
    //                 let base64ImageData = canvas.toDataURL('image/jpeg', 0.1);
    //                 frames.push(base64ImageData);
    //             }

    //             //alert(frameCounter)
  
    //             frameCounter++;
    //             //currentFrame++;
    //             //console.log(currentFrame/totalFrames);
    //             //currentTaskText = "Frame: " + currentFrame + " out of: " + totalFrames;
    //             //convertLoadingBar.style.width = ((currentFrame/totalFrames) * 100) + "%";
    //             currentTime += interval;
    //         }
    //         //convertFrames(frames);

    //         resolve(frames);
            

            
    //         // const objectStore = db.transaction(["frames"], "readwrite").objectStore("frames");
    //         // const request = objectStore.get($currentFrameID);
    //         // request.onerror = (event) => {
    //         //     console.log("Error uploading video to indexedDB")
    //         // };
    //         // request.onsuccess = (event) => {
    //         //     const data = event.target.result;
    //         //     data.videoFile = newBlob;

    //         //     const requestUpdate = objectStore.put(data);
    //         //     requestUpdate.onerror = (event) => {
    //         //         // Do something with the error
    //         //         console.log("Data ERROR while loged")
    //         //     };
    //         //     requestUpdate.onsuccess = (event) => {
    //         //         // Success - the data is updated!
    //         //         console.log("Data loged")
    //         //     };
    //         // };

    //     });
    // }

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
        <video bind:this={video}></video>
        <a href={linkDownlaod}>DOWNLOADNOW</a>
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