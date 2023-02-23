<script>
    import { fade } from 'svelte/transition';

    export let showFrameSaved;

    const closePopup = () =>{
        showFrameSaved= false;
    }
</script>

<div class="blackout"></div>

<div class="bg" transition:fade="{{duration: 200 }}">
    <h2>Successfully Saved Video!</h2>
    <button on:click={closePopup}>Close</button>
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
        margin: 0.5em 0;
    }

    button{
        margin: 1em auto;
    }

</style>