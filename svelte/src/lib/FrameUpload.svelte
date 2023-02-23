<script>
    import FrameIcon from "./FrameIcon.svelte";
    import { fade } from 'svelte/transition';
    import { FRAMEID } from '../stores';

    export let showUpload;
    export let videoFileToUpload;

    const closePopup = () =>{
        showUpload= false;
    }

    const uploadToFrame = () => {
        let formData = new FormData();
        let newFile = new File([videoFileToUpload], "pleaseworkvideo.mjpeg")
        formData.append("data", newFile);
        fetch('/upload', {method: "POST", body: formData})
    }


</script>

<div class="blackout"></div>

<div class="bg" transition:fade="{{duration: 200 }}">
    <h2>Upload To Frame</h2>

    <FrameIcon bgColor={"#E9CA5D"}/>

    <h2 style="color:#BABABA;">#{$FRAMEID}</h2>
    <button on:click={uploadToFrame} class="uploadBTN">Upload</button>
    <button on:click={closePopup}>Cancel</button>
</div>

<style>
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
        min-height: 50%;

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