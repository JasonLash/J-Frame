<script>
    import { currentFrameID, FRAMEID } from '../../stores';
    export let frameData;
    export let showRecordPage;
    
    const clickedFrame = () =>{
        currentFrameID.set(frameData.id)
        showRecordPage = true;
        console.log(frameData);
    }
</script>

<div class="frameObject" on:click={clickedFrame}>
    {#if frameData.id == $FRAMEID && frameData.videoFile == null}
        <div class="outline">
            <div class="big">
                <div class="small"></div>
            </div> 
        </div>

    {:else if frameData.id == $FRAMEID && frameData.videoFile != null}
        <div class="outline">
            <div class="big" style="background: #E9CA5D;">
                <div class="small"></div>
            </div>  
        </div>
    {:else if frameData.videoFile != null}
        <div class="big" style="background: #E9CA5D;">
            <div class="small"></div>
        </div> 
    {:else}
        <div class="big">
            <div class="small"></div>
        </div> 

    {/if}
    
    <h3>#{frameData.id}</h3>
</div>


<style>

    .outline{
        background: #5D6AE8;
        
        border-radius: 14px;

        width: 6.5em;
        height: 8.5em;
        display: flex;
        justify-content: center;
    }


    .big{
        margin: auto;
        background: #BEBEBE;
        border: 10px solid #000000;
        
        border-radius: 14px;

        width: 6em;
        height: 8em;
    }


    .small{
        border: 7px solid #000000;
        border-radius: 9px;
        width: 4em;
        height: 5em;
        margin: 0 auto;
        margin-top: 0.5em;
    }

    .frameObject{
        margin: 1em auto;
    }

    h3{
        text-align: center;
        color:  #bbbbbb;
        letter-spacing: .05rem;
        margin-top: 0.3em;
    }
</style>