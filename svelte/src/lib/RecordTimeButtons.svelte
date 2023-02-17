<script>
    export let currentTime;

    const changeTime = (newTime) =>{
        currentTime = newTime;
    }
</script>


<div class="btnCollection">

    {#if currentTime == 5}
        <div class="btnObj sBtnObj" style="border-radius: 12px 0px 0px 12px; background:#3C3C3C;">
            <h3 style="color:#C7C7C7;">5 s</h3>
        </div>

        <div on:click={() => changeTime(10)} class="btnObj sBtnObj" style="">
            <h3>10 s</h3>
        </div>

        <div on:click={() => changeTime(15)} class="btnObj sBtnObj" style="border-radius: 0px 12px 12px 0px;">
            <h3>15 s</h3>
        </div>
    {:else if currentTime == 10}
        <div on:click={() => changeTime(5)} class="btnObj" style="border-radius: 12px 0px 0px 12px;">
            <h3>5 s</h3>
        </div>

        <div class="btnObj" style="background:#3C3C3C;">
            <h3 style="color:#C7C7C7;">10 s</h3>
        </div>

        <div on:click={() => changeTime(15)} class="btnObj" style="border-radius: 0px 12px 12px 0px;">
            <h3>15 s</h3>
        </div>
    {:else}
        <div on:click={() => changeTime(5)} class="btnObj" style="border-radius: 12px 0px 0px 12px;">
            <h3>5 s</h3>
        </div>

        <div on:click={() => changeTime(10)} class="btnObj" style="">
            <h3>10 s</h3>
        </div>

        <div class="btnObj" style="border-radius: 0px 12px 12px 0px; background:#3C3C3C;">
            <h3 style="color:#C7C7C7;">15 s</h3>
        </div>

    {/if}
</div>


<style>
    .btnObj{
        background: #939393;
        border: 4px solid #3C3C3C;
        width: 30%;
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