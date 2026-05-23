let amplitude = 0;
let targetAmplitude = 0;
let phase = 0;
let isStraight = true;

function setup() {
    // Matching the size of assets/sograim.svg approximately
    let canvas = createCanvas(64, 25);
    canvas.parent('soundwave-container');
}

function draw() {
    clear(); // Transparency

    amplitude = lerp(amplitude, targetAmplitude, 0.1);

    stroke(255); // White
    strokeWeight(1.1); // Thinner line for smaller scale
    noFill();
    strokeCap(ROUND);
    strokeJoin(ROUND);

    // Center it horizontally with more padding from brackets to shorten it
    let startX = 13;
    let endX = 50;

    beginShape();
    for (let x = startX; x <= endX; x++) {
        let n = map(x, startX, endX, -1, 1);

        // Falloff function for organic look
        let falloff = exp(-pow(n * 2.5, 2));

        let angle = map(x, startX, endX, 0, TWO_PI);

        // Vertical center (14.5) + sine wave
        let y = 14.5 + sin(angle + phase) * amplitude * falloff;

        vertex(x, y);
    }
    endShape();

    phase -= 0.15; // Slightly slower flow
}

// Toggle wave animation and audio on click (only within canvas)
function mousePressed() {
    // Check if mouse is within the canvas bounds
    if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
        isStraight = !isStraight;
        targetAmplitude = isStraight ? 0 : 5;

        // Control audio playback with fade
        let audio = document.getElementById('bg-audio');
        if (!audio) audio = window.top.document.getElementById('bg-audio');

        if (audio) {
            if (isStraight) {
                // Fade out
                fadeAudio(audio, audio.volume, 0, 500);
            } else {
                // Fade in
                if (audio.paused) {
                    audio.currentTime = 1; // Programmatic "cut" of the first second
                    audio.muted = false;   // vital: ensure we are not muted from autoplay logic
                    audio.play();

                    // Ensure looping also starts from 1s
                    if (!audio._hasLoopListener) {
                        audio.addEventListener('ended', () => {
                            audio.currentTime = 1;
                            audio.play();
                        });
                        audio._hasLoopListener = true;
                        audio.loop = false; // Disable native loop to use our custom 'ended' logic
                    }
                }
                // Determine if we need to unmute if it was already playing but muted
                if (audio.muted) audio.muted = false;

                fadeAudio(audio, audio.volume, 1, 500);
            }
        }
    }
}

// Smooth audio fade function
function fadeAudio(audio, startVol, endVol, duration) {
    let steps = 20;
    let stepTime = duration / steps;
    let volumeStep = (endVol - startVol) / steps;
    let currentStep = 0;

    let fadeInterval = setInterval(() => {
        currentStep++;
        audio.volume = Math.max(0, Math.min(1, startVol + (volumeStep * currentStep)));

        if (currentStep >= steps) {
            clearInterval(fadeInterval);
            audio.volume = endVol;
            if (endVol === 0) {
                audio.pause();
            }
        }
    }, stepTime);
}
