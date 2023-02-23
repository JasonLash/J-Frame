let frames = [];
let frameCounter = 0;

const convertVideo = async(videoBlob) => {
    let canvas = document.createElement("canvas");
    let ctx = canvas.getContext("2d");
    if (HTMLVideoElement.prototype.requestVideoFrameCallback) {
        let stopped = false;
        const video = await getVideoElement(videoBlob);
        const drawingLoop = async(timestamp, frame) => {
            const bitmap = await createImageBitmap(video);
            //const index = frames.length;
            //frames.push(bitmap);
            //select.append(new Option("Frame #" + (index + 1), index));

            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            ctx.drawImage(bitmap, 0, 0);

            let base64ImageData = canvas.toDataURL('image/jpeg', 0.9);
            //console.log(base64ImageData);
            frames.push(base64ImageToBlob(base64ImageData.slice(23)));
            frameCounter++;

            if (!video.ended && !stopped) {
                video.requestVideoFrameCallback(drawingLoop);
            } else {
                select.disabled = false;
            }
        };

        video.requestVideoFrameCallback(drawingLoop);
    } else {
        alert("your browser doesn't support this API yet");
    }
};

async function getVideoElement(videoBlob) {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  let videoObjectUrl = URL.createObjectURL(videoBlob);
  video.src = videoObjectUrl;
  //document.body.append(video);
  await video.play();
  return video;
}