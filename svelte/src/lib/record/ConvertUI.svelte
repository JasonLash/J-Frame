<script>
    import { onMount } from 'svelte';
    import { currentFrameID } from '../../stores';

    export let blob;
    export let db;
    export let showFrameSaved;
    export let showRecordPage;

    let video;

    let linkDownlaod;

    onMount(async () => {
        //alert(blob.size)
        ScanVideo(blob);
	});

    const convertFrames = (frameData) => {
        let newBlob = new Blob(frameData, { type: "video/mjpeg" });
        linkDownlaod = URL.createObjectURL(newBlob);


        const objectStore = db.transaction(["frames"], "readwrite").objectStore("frames");
        const request = objectStore.get($currentFrameID);
        request.onerror = (event) => {
            console.log("Error uploading video to indexedDB")
        };
        request.onsuccess = (event) => {
            const data = event.target.result;
            data.videoFile = newBlob;
            const requestUpdate = objectStore.put(data);
            requestUpdate.onerror = (event) => {
                // Do something with the error
                showFrameSaved = false;
                showRecordPage = false;
                alert("error saving video")
                console.log("Data ERROR while loged")
            };
            requestUpdate.onsuccess = (event) => {
                // Success - the data is updated!
                showFrameSaved = true;
                showRecordPage = false;
                console.log("Data loged")
            };
        };

        // let formData = new FormData();
        // let newFile = new File([newBlob], "pleaseworkvideo.mjpeg")
        // formData.append("data", newFile);
        // fetch('/upload', {method: "POST", body: formData})

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
            if (currentTime > duration){
                convertFrames(frames);
                return;
            };


            setTimeout(() => {
                video.currentTime = currentTime;
                if(frameCounter % fpsIntervel == 0){
                    context.drawImage(video, 0, 0, 240, 320);
                    canvas.toBlob(function(blob){frames.push(blob);}, 'image/jpeg', 0.5);
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

</script>


<div class="blackout"></div>

<div class="bg">
    <div class="topAndBottom">
        <h2>Saving Video</h2>
        <h4>This might take a bit</h4>
        <video bind:this={video}></video>
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