<script>
    export let currentCameraType;

    const changeCamType = (camType) =>{
        currentCameraType = camType
    }
</script>


<div class="btnCollection">

    {#if currentCameraType == "FRONT"}
        <div class="btnObj" style="border-radius: 12px 0px 0px 12px; background:#3C3C3C;">
            <h3 style="color:#C7C7C7;">Front</h3>
        </div>

        <div on:click={() => changeCamType("BACK")}  class="btnObj" style="border-radius: 0px 12px 12px 0px;">
            <h3>Back</h3>
        </div>
    {:else}
        <div on:click={() => changeCamType("FRONT")}  class="btnObj" style="border-radius: 12px 0px 0px 12px;">
            <h3>Front</h3>
        </div>

        <div class="btnObj" style="border-radius: 0px 12px 12px 0px; background:#3C3C3C;">
            <h3 style="color:#C7C7C7;">Back</h3>
        </div>
    {/if}
</div>


<style>
    .btnObj{
        background: #939393;
        border: 4px solid #3C3C3C;
        width: 45%;
    }   

    .btnCollection{
        display: flex;
        flex-direction: row;
        justify-content: center;
    }
    
    h3{
        margin: 0.25em auto;
    }
</style>