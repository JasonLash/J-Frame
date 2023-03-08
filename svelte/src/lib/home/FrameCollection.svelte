<script>
    import HomeFrame from "./HomeFrame.svelte";

    export let FramesData;
    export let showRecordPage;
</script>


<div class="frameCollection">
    {#each FramesData as frameData}
        <HomeFrame frameData={frameData} bind:showRecordPage={showRecordPage}/>
    {/each}
</div>

<style>
    .frameCollection{
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        justify-content: space-around;
    }
</style>