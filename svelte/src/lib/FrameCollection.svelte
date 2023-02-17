<script>
    import HomeFrame from "./HomeFrame.svelte";

    export let savedFrameIDs;
</script>


<div class="frameCollection">
    {#each savedFrameIDs as frameID}
        <HomeFrame frameID={frameID} />
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