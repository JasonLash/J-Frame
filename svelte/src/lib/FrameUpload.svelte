<script>
    import FrameIcon from "./FrameIcon.svelte";
    import { fade } from 'svelte/transition';
    import { FRAMEID } from '../stores';

    export let showUpload;
    export let videoFileToUpload;
    export let db;
    let uploadLoadingBar;
    let showUploading = false;
    let doneUpload = false;

    const closePopup = () =>{
        showUpload= false;
    }

    const uploadToFrame  = async () => {
        showUploading = true;
        let formData = new FormData();
        let newFile = new File([videoFileToUpload], "frameVideo.mjpeg")
        formData.append("data", newFile);
        // fetch('/upload', {method: "POST", body: formData})

        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/upload", true);

        xhr.upload.addEventListener("progress", (event) => {
            console.log(event);
            if (event.lengthComputable) {
                console.log("upload progress:", ((event.loaded / event.total) * 100));
                uploadLoadingBar.style.width = ((event.loaded / event.total) * 100) + "%";
            }
        });
        
        xhr.onreadystatechange = function() {
            if (xhr.readyState == 4 && xhr.status == 200) 
            {
                console.log(xhr.statusText);
                const request = db.transaction(["frames"], "readwrite").objectStore("frames").delete($FRAMEID);
                request.onsuccess = (event) => {
                // It's gone!
                };

                doneUpload = true;
                showUploading = false;
            }
        }

        //xhr.setRequestHeader("Content-Type", "application/octet-stream");
        xhr.send(formData);

    }


</script>

<div class="blackout"></div>


    <div class="bg" transition:fade="{{duration: 200 }}">
        {#if !showUploading && !doneUpload}
            <h2>Upload To Frame</h2>

            <FrameIcon bgColor={"#E9CA5D"}/>

            <h2 style="color:#BABABA;">#{$FRAMEID}</h2>
            <button on:click={uploadToFrame} class="uploadBTN">Upload</button>
            <button on:click={closePopup}>Cancel</button>
        {:else if showUploading && !doneUpload}
            <h2>Uploading...</h2>
            <div class="bar">
                <div class="loadingBG"> 
                    <div bind:this={uploadLoadingBar} class="loadingMain"></div>
                </div>
            </div>

        {:else if !showUploading && doneUpload}
            <h2>Upload Successful!</h2>
            <button on:click={closePopup}>Close</button>
        {/if}
    </div>



<style>
    .bar{
        display: flex;
        justify-content: center;
        flex-direction: column;
        width: 100%;
    }

    .loadingBG{
        width: 90%;
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
        justify-content: center;

    }

    .blackout{
        position: absolute;
        background: #000000aa;
        width: 100%;
        height: 100%;
    }

    h2{
        text-align: center;
        color: #fff;
        padding-top: 0.5em;
    }

    button{
        margin: 0.75em auto;
    }

    .uploadBTN{
        background: #E9CA5D;
        color:#222222;
    }

</style>