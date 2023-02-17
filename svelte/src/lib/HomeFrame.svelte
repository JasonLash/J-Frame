<script>

    export let frameID;

    const clickedFrame = () =>{
        console.log(frameID);
    }
</script>

<div class="frameObject" on:click={clickedFrame}>
    <div class="big">
        <div class="small"></div>
    </div>    
    
    <h3>#{frameID}</h3>
</div>


<style>
    .big{
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
        margin-top: 0.25em;
    }
</style>