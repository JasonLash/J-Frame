<script>

    const refreshPage = () =>{
        window.location.href = '/';
    }
    

</script>


<h1>Frames</h1>

<div class="center">
    <button on:click={refreshPage}>Refresh</button>
</div>






<style>
    h1{
        text-align: center;
        color: #fff;
        padding-top: 1rem;
    }

    .center{
        padding-top: 1em;
        display: flex;
        justify-content: center;
    }

</style>