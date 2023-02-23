<script>
    export let bgColor;
</script>

<div class="center">
    <div class="big" style="background: {bgColor};">
        <div class="small"></div>
    </div>    
</div>

<style>
    .big{
        border: 17px solid #000000;
        border-radius: 28px;

        width: 12em;
        height: 16em;
    }

    .small{
        border: 13px solid #000000;
        border-radius: 15px;
        width: 8em;
        height: 10em;
        margin: 0 auto;
        margin-top: 1em;
    }
    .center{
        display: flex;
        justify-content: center;
        padding-top: 1em
    }
</style>