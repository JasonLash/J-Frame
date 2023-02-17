<script>
    import { currentFrameID } from '../stores';
    import CameraTypeButtons from "./CameraTypeButtons.svelte";
    import RecordTimeButtons from "./RecordTimeButtons.svelte";

    export let showRecordPage;

    let currentCameraType = "BACK";
    let currentTime = 5;

    const goBack = () =>{
        showRecordPage = false;
    }
</script>


<button class="backBtn" on:click={goBack}>Back</button>

<div class="center">
    <h3>Frame #{$currentFrameID}</h3>

    <video muted></video>

    <h4>Camera type</h4>

    <CameraTypeButtons bind:currentCameraType={currentCameraType}/>

    <h4 style="margin-top: 1rem;">Record Time</h4>

    <RecordTimeButtons bind:currentTime={currentTime}/>

    <button class="recordBtn"><h3>Record</h3></button>
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