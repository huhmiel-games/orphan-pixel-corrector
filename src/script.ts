import { Task } from './Task';
import { TImage } from './types';

// Html elements
const saveImageBtn = document.getElementById('save-image') as HTMLButtonElement;
const imageElm = document.getElementById('image') as HTMLImageElement;
const imageCanvas = document.getElementById('image-canvas') as HTMLCanvasElement;
const leftPanel = document.getElementById('left-panel') as HTMLDivElement;
const rightPanel = document.getElementById('right-panel') as HTMLDivElement;
const fixedCanvas = document.getElementById('fixed-canvas') as HTMLCanvasElement;
const checkCanvas = document.getElementById('check-canvas') as HTMLCanvasElement;
const checkOnlyElm = document.getElementById('check-only') as HTMLInputElement;
const multipassElm = document.getElementById('multipass') as HTMLInputElement;
const consoleElm = document.getElementById('console') as HTMLPreElement;
const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement;
const redoBtn = document.getElementById('redo-btn') as HTMLButtonElement;

// Data
const image: TImage = {
    name: '',
    width: 0,
    height: 0,
    isLoaded: false,
    zoom: 1,
}

let checkOnly = true;
let multipass = false;
let pixelCorrectionCount: number = 0;
let noPixelCorrectionCount: number = 0;
let lastPixelCorrectionCount: number = 0;
const undos: Task[] = [];
const redos: Task[] = [];

let visibleModal: HTMLElement | null = null;
const navbarHeight = document.querySelector('nav')?.clientHeight || 58;

// Event listeners
(document.querySelectorAll('[id ^= "close-"]')).forEach(elm => elm.addEventListener('click', closeModal));
document.getElementById('open-image')?.addEventListener('change', openImage, false);
document.getElementById('about-btn')?.addEventListener('click', openModal, false);
document.addEventListener('wheel', onMouseWheel, { passive: false });
document.addEventListener('keydown', handleKeyPress);
document.addEventListener('click', pickColor);
checkOnlyElm.addEventListener('change', check);
multipassElm.addEventListener('change', setMultipass);
undoBtn.addEventListener('click', undo, false);
redoBtn.addEventListener('click', redo, false);
saveImageBtn.addEventListener('click', downloadTilesetAsImage, false);
leftPanel.addEventListener('scroll', handleRightScroll);
rightPanel.addEventListener('scroll', handleLeftScroll);
fixedCanvas.addEventListener('mousemove', handleCursor)

function handleLeftScroll()
{
    leftPanel.scroll(rightPanel.scrollLeft, rightPanel.scrollTop);
}

function handleRightScroll()
{
    rightPanel.scroll(leftPanel.scrollLeft, leftPanel.scrollTop);
}
function handleCursor(event)
{
    if (event.ctrlKey === true && fixedCanvas.classList.contains('pick-color'))
    {
        fixedCanvas.classList.replace('pick-color', 'edit-color');
    }
    else if (event.ctrlKey === false && fixedCanvas.classList.contains('edit-color'))
    {
        fixedCanvas.classList.replace('edit-color', 'pick-color');
    }
}

function openModal(event)
{
    event.preventDefault();
    const modal = document.getElementById(event.currentTarget.getAttribute('data-target')) as HTMLDialogElement;
    modal.open = true;
    visibleModal = modal;
}

function closeModal(event)
{
    visibleModal = null;
    event.preventDefault();
    const modal = document.getElementById(event.currentTarget.getAttribute('data-target')) as HTMLDialogElement;
    modal.open = false;
}

// Image canvas
function openImage(event)
{
    const imageFiles = event.target.files;
    const imageFilesLength = imageFiles.length;
    if (imageFilesLength > 0)
    {
        image.name = imageFiles.name;
        const imageSrc = URL.createObjectURL(imageFiles[0]);
        imageElm.src = imageSrc;
        imageElm.addEventListener('load', (e) =>
        {
            image.width = imageElm.naturalWidth;
            image.height = imageElm.naturalHeight;
            imageCanvas.classList.remove('none');
            drawImage(imageCanvas, imageElm);
            drawImage(fixedCanvas, imageElm);
            checkCanvas.width = image.width;
            checkCanvas.height = image.height;
            image.isLoaded = true;
            noPixelCorrectionCount = 0;
            checkOrphanPixels();
            showAlertResult();
        }, { once: true });
    }
}

function showAlertResult()
{
    const date = new Date().toLocaleString();
    const codeElm = document.createElement('code');

    codeElm.innerText = `${date}
${pixelCorrectionCount} pixels found.
${noPixelCorrectionCount} pixels found without viable correction.
-------------------
`;
    consoleElm.insertBefore(codeElm, consoleElm.children[0]);
}

function reset()
{
    const ctx = imageCanvas.getContext('2d');
    const ctx2 = fixedCanvas.getContext('2d');
    if (!ctx || !ctx2) return;
    ctx.clearRect(0, 0, image.width, image.height);
    ctx2.clearRect(0, 0, image.width, image.height);
    drawImage(imageCanvas, imageElm);
    drawImage(fixedCanvas, imageElm);
    pixelCorrectionCount = 0;
    noPixelCorrectionCount = 0;
    lastPixelCorrectionCount = 0;
}

function checkOrphanPixels()
{
    const ctx = imageCanvas.getContext('2d');
    const ctx2 = fixedCanvas.getContext('2d');
    const ctx3 = checkCanvas.getContext('2d');
    if (!ctx || !ctx2 || !ctx3) return;

    const width = image.width;
    const height = image.height;

    const hexColor = (document.getElementById('check-color') as HTMLInputElement).value;
    const rgbColor = hexToRGB(hexColor);

    for (let y = 0; y < height; y += 1)
    {
        for (let x = 0; x < width; x += 1)
        {
            const checkedPixel = ctx.getImageData(x, y, 1, 1);
            const checkedPixelColor = `${checkedPixel.data[0]}-${checkedPixel.data[1]}-${checkedPixel.data[2]}-${checkedPixel.data[3]}`;

            // no action if checked pixel color is transparent
            if (checkedPixelColor === '0-0-0-0') continue;

            const neighboringColors = getNeighboringColors(ctx, x, y);

            if (neighboringColors.includes(checkedPixelColor)) continue;

            const mainColor = getMainColor(neighboringColors);

            if (checkOnly === true)
            {
                checkedPixel.data[0] = rgbColor[0];
                checkedPixel.data[1] = rgbColor[1];
                checkedPixel.data[2] = rgbColor[2];
                checkedPixel.data[3] = 255;
                ctx3.putImageData(checkedPixel, x, y);
                // no pixel correction found
                if (!mainColor) noPixelCorrectionCount += 1;
            }
            if (neighboringColors.length > 0)
            {
                // no pixel correction found
                if (!mainColor)
                {
                    noPixelCorrectionCount += 1;
                    continue;
                }

                const rgba = mainColor.split('-');
                checkedPixel.data[0] = +rgba[0];
                checkedPixel.data[1] = +rgba[1];
                checkedPixel.data[2] = +rgba[2];
                checkedPixel.data[3] = +rgba[3];
                pixelCorrectionCount += 1;
                ctx2.putImageData(checkedPixel, x, y);
            }
        }
    }

    if (multipass && lastPixelCorrectionCount !== noPixelCorrectionCount)
    {
        lastPixelCorrectionCount = noPixelCorrectionCount;
        noPixelCorrectionCount = 0;
        const data = ctx2.getImageData(0, 0, width, height);
        ctx.putImageData(data, 0, 0);
        checkOrphanPixels();
    }
}

function getNeighboringColors(ctx: CanvasRenderingContext2D, pixelX: number, pixelY: number): string[]
{
    const pixels = ctx.getImageData(pixelX - 1, pixelY - 1, 3, 3).data;

    let colors: string[] = [];
    for (let i = 0; i < pixels.length; i += 4)
    {
        const pixelColor = `${pixels[i]}-${pixels[i + 1]}-${pixels[i + 2]}-${pixels[i + 3]}`;
        colors.push(pixelColor)
    }

    // remove the checked pixel
    colors.splice(4, 1);

    // remove transparent pixels
    const colorWithoutTransparent = colors.filter(color => color !== '0-0-0-0');

    return colorWithoutTransparent;
}

function getMainColor(arr: string[]): string | undefined
{
    // https://stackoverflow.com/a/42882983
    const obj = arr.reduce((acc, value) =>
    {
        // define the property if not defined
        acc[value] = acc[value] || 0;
        // increment the count
        acc[value]++;
        // return the object reference
        return acc;
        // set initial value as an empty object
    }, {});

    // reduce into a single value which holds the highest value
    const mainColor = Object.keys(obj).reduce((acc, value) => obj[value] > obj[acc] ? value : acc);
    const colorCount = arr.filter(color => color === mainColor);

    if (colorCount.length <= 1)
    {
        return undefined;
    }

    return mainColor;
}

function check()
{
    checkOnly = !checkOnly;
    if (image.isLoaded)
    {
        checkCanvas.style.display = checkOnly ? 'block' : 'none';
        // reset();
        // checkOrphanPixels();
        // showAlertResult();
    }
}

function setMultipass()
{
    multipass = !multipass;
    if (image.isLoaded)
    {
        reset();
        checkOrphanPixels();
        showAlertResult();
    }
}

function downloadTilesetAsImage()
{
    const fixedImage = fixedCanvas.toDataURL('image/png');
    const xhr = new XMLHttpRequest();
    xhr.responseType = 'blob';
    xhr.onload = function ()
    {
        let a = document.createElement('a');
        a.href = window.URL.createObjectURL(xhr.response);
        a.download = image.name;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
    };
    xhr.open('GET', fixedImage);
    xhr.send();
}

// Zoom
function onMouseWheel(event)
{
    if (event.ctrlKey) event.preventDefault();

    // zoom image
    if (event.ctrlKey && image.isLoaded)
    {
        let scrollX: number = 0;
        let scrollY: number = 0;
        // const zoomFactor = 1/image.width * 100;
        const zoomFactor = 1;

        if (event.wheelDelta > 0)
        {
            if (image.zoom === 64) return;
            image.zoom = clamp(image.zoom + zoomFactor, 0, 64);
            scrollX = (event.offsetX - event.clientX / 2) * 2;
            scrollY = (event.offsetY - (event.clientY - navbarHeight) / 2) * 2;

        }
        else if (event.wheelDelta < 0)
        {
            if (image.zoom < 0.02) return;
            image.zoom -= zoomFactor;
            scrollX = (event.offsetX - event.clientX * 2) / 2;
            scrollY = (event.offsetY - (event.clientY - navbarHeight) * 2) / 2;
        }

        imageCanvas.style.width = image.width * image.zoom + 'px';
        imageCanvas.style.height = image.height * image.zoom + 'px';
        fixedCanvas.style.width = image.width * image.zoom + 'px';
        fixedCanvas.style.height = image.height * image.zoom + 'px';
        checkCanvas.style.width = image.width * image.zoom + 'px';
        checkCanvas.style.height = image.height * image.zoom + 'px';
        leftPanel.scroll(scrollX, scrollY);
        rightPanel.scroll(scrollX, scrollY);
    }
}

// Key press
function handleKeyPress(event: KeyboardEvent)
{
    if (event.ctrlKey && event.key === 'z' && undos.length)
    {
        event.preventDefault();
        undo();
        return;
    }

    if (event.ctrlKey && event.key === 'y' && redos.length)
    {
        event.preventDefault();
        redo();
        return;
    }

    if (event.ctrlKey && event.key === 's' && image.isLoaded)
    {
        event.preventDefault();
        downloadTilesetAsImage();
        return;
    }
}

// Utils
function drawImage(canvas: HTMLCanvasElement, img: HTMLImageElement, x = 0, y = 0)
{
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, x, y);
}

function clamp(number: number, min: number, max: number)
{
    return Math.max(min, Math.min(number, max));
}

function hexToRGB(hex: string)
{
    hex = hex.toUpperCase();

    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    return [r, g, b];
}

function RGBAToHexA(rgba: number[], forceRemoveAlpha = false)
{
    return "#" +
        rgba.map((number: { toString: (arg0: number) => any; }) => number.toString(16)) // Converts numbers to hex
            .map((string: string | any[]) => string.length === 1 ? "0" + string : string) // Adds 0 when length of one number is 1
            .join("")
}

function pickColor(event: MouseEvent)
{
    // @ts-expect-error
    if (event.target.id === 'image-canvas')
    {
        const ctx = imageCanvas.getContext('2d');
        if (!ctx) return;

        const x = event.offsetX / image.zoom;
        const y = event.offsetY / image.zoom;

        const pixel = ctx.getImageData(x, y, 1, 1);
        const data = pixel.data;
        const hex = RGBAToHexA([data[0], data[1], data[2]]);

        (document.getElementById('check-color') as HTMLInputElement).value = hex
    }

    // @ts-expect-error
    if (event.target.id === 'fixed-canvas' && event.ctrlKey === false)
    {
        const ctx = fixedCanvas.getContext('2d');
        if (!ctx) return;

        const x = event.offsetX / image.zoom;
        const y = event.offsetY / image.zoom;

        const pixel = ctx.getImageData(x, y, 1, 1);
        const data = pixel.data;
        const hex = RGBAToHexA([data[0], data[1], data[2]]);

        (document.getElementById('check-color') as HTMLInputElement).value = hex
    }

    // @ts-expect-error
    if (event.target.id === 'fixed-canvas' && event.ctrlKey === true)
    {
        const x = Math.floor(event.offsetX / image.zoom);
        const y = Math.floor(event.offsetY / image.zoom);
        pasteColor(x, y);
    }
}

function pasteColor(x: number, y: number)
{
    const ctx = fixedCanvas.getContext('2d');
    if (!ctx) return;

    const hexColor = (document.getElementById('check-color') as HTMLInputElement).value;
    const rgbColor = hexToRGB(hexColor);

    const previousData = ctx.getImageData(x, y, 1, 1);
    addUndotask(previousData, x, y, 1, 1);

    const checkedPixel = ctx.getImageData(x, y, 1, 1);
    checkedPixel.data[0] = rgbColor[0];
    checkedPixel.data[1] = rgbColor[1];
    checkedPixel.data[2] = rgbColor[2];
    checkedPixel.data[3] = 255;

    ctx.putImageData(checkedPixel, x, y);
}

function addUndotask(data: ImageData, x: number, y: number, width: number, height: number)
{
    const undo = new Task(data, x, y, width, height);
    undos.push(undo);
    undoBtn.disabled = false;
}

function addRedotask(data: ImageData, x: number, y: number, width: number, height: number)
{
    const redo = new Task(data, x, y, width, height);
    redos.push(redo);
    redoBtn.disabled = false;
}

function undo()
{
    const lastTask = undos.at(-1);
    if (!lastTask) return;

    const ctx = fixedCanvas.getContext("2d");
    if (!ctx) return;

    const redoData = ctx.getImageData(lastTask.x, lastTask.y, 1, 1);
    addRedotask(redoData, lastTask.x, lastTask.y, lastTask.width, lastTask.height)

    ctx.clearRect(lastTask.x, lastTask.y, 1, 1);
    ctx.putImageData(lastTask.data, lastTask.x, lastTask.y);
    undos.pop();

    if (undos.length === 0)
    {
        undoBtn.disabled = true;
    }
}

function redo()
{
    const lastTask = redos.at(-1);
    if (!lastTask) return;

    const ctx = fixedCanvas.getContext("2d");
    if (!ctx) return;

    const undoData = ctx.getImageData(lastTask.x, lastTask.y, lastTask.width, lastTask.height);
    addUndotask(undoData, lastTask.x, lastTask.y, lastTask.width, lastTask.height);

    ctx.clearRect(lastTask.x, lastTask.y, 1, 1);
    ctx.putImageData(lastTask.data, lastTask.x, lastTask.y);
    redos.pop();

    if (redos.length === 0)
    {
        redoBtn.disabled = true;
    }
}
