let bird;
let noiseOffset = 0;
let textTriggered = false;

function setup() {
    // Using fixed dimensions from index.html screen-container
    const cw = 1546;
    const ch = 1004;
    let canvas = createCanvas(cw, ch);
    canvas.parent('canvas-container');

    noStroke();
    frameRate(40); // קצב יציב וטבעי

    // Starting off-screen to the right for a natural entry
    bird = {
        pos: createVector(cw + 40, ch * 0.4),
        vel: createVector(random(-3, -5), random(-0.5, 0.5)), // Match 7birds velocity
        acc: createVector(0, 0),
        maxSpeed: 2, // Match 7birds maxSpeed
        maxForce: 0.08,
        size: 6,
        wingPhase: random(TWO_PI)
    };
}

// Animation Start Control
let animationStarted = false;

// Global mouse tracking from parent
let gMouseX = -1000;
let gMouseY = -1000;
let lastMsgTime = 0;

window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'GLOBAL_MOUSE_MOVE') {
        gMouseX = event.data.x;
        gMouseY = event.data.y;
        lastMsgTime = millis();
    }
    if (event.data === 'start-animation') {
        animationStarted = true;
    }
});

function draw() {
    clear(); // Use clear() for transparency

    if (!animationStarted) {
        // Optional: Draw static bird if needed, but it's off-screen so no need
        return;
    }

    let mx = mouseX;
    let my = mouseY;
    if (millis() - lastMsgTime < 500) {
        mx = gMouseX;
        my = gMouseY;
    }

    let mouse = createVector(mx, my);
    let d = p5.Vector.dist(mouse, bird.pos);
    noiseOffset += 0.005;

    // 1. לכידות למרכז השמיים המותרים
    let skyCenter = createVector(width * 0.625, (height * 0.25 + height * 0.58) / 2);
    let coh = p5.Vector.sub(skyCenter, bird.pos);
    coh.setMag(0.03);
    bird.acc.add(coh);

    // 2. זרמי אוויר
    let n = noise(bird.pos.x * 0.005, bird.pos.y * 0.005, noiseOffset);
    let flowAngle = n * TWO_PI * 2;
    let flow = p5.Vector.fromAngle(flowAngle);
    flow.mult(0.12);
    bird.acc.add(flow);

    // 3. בריחה מהעכבר
    if (d < 150) {
        let flee = p5.Vector.sub(bird.pos, mouse);
        let force = map(d, 0, 150, 1.2, 0);
        flee.setMag(force);
        bird.acc.add(flee);
    }

    // הגבלת שטח
    bird.acc.add(stayInRestrictedArea(bird));

    // עדכון פיזיקלי
    bird.vel.add(bird.acc);
    bird.vel.limit(bird.maxSpeed);
    bird.pos.add(bird.vel);
    bird.acc.mult(0);

    // Detect when bird enters the visible screen area
    // Trigger earlier (at width - 50) so typewriter starts when bird is more visible
    if (!textTriggered && bird.pos.x < width - 50) {
        textTriggered = true;
        // Send message to current window (INDIVIDUAL.html) to trigger typewriter
        window.postMessage('bird-entered-screen', '*');
    }

    drawBird(bird);
}

function stayInRestrictedArea(b) {
    let minX = width * 0.45;  // 45% from left (avoids text)
    let maxX = width * 0.80;  // 20% from right
    let minY = height * 0.25; // Lowered top margin to 25% height
    let maxY = height * 0.58; // Bottom margin same as others

    let steer = createVector(0, 0);
    if (b.pos.x < minX) steer.x = b.maxForce * 3;
    else if (b.pos.x > maxX) steer.x = -b.maxForce * 3;
    if (b.pos.y < minY) steer.y = b.maxForce * 3;
    else if (b.pos.y > maxY) steer.y = -b.maxForce * 3;

    return steer;
}

function drawBird(b) {
    push();
    translate(b.pos.x, b.pos.y);
    rotate(b.vel.heading());

    // Applying blur and opacity directly to the bird
    drawingContext.filter = 'blur(0.75px)';
    fill(0, 139); // Match alpha 139 from other pages

    let flap = sin(frameCount * 0.22 + b.wingPhase);
    let wingLen = b.size * 1.0;
    let wingWidth = b.size * 0.6;
    let wingAngle = map(flap, -1, 1, -0.1, 1.3);

    // גוף הזרזיר
    beginShape();
    vertex(b.size * 0.6, 0);
    bezierVertex(b.size * 0.3, -b.size * 0.5, -b.size * 0.2, -b.size * 0.5, -b.size * 0.5, 0);
    vertex(-b.size * 0.9, 0); // שפיץ הטוסיק
    bezierVertex(-b.size * 0.2, b.size * 0.5, b.size * 0.3, b.size * 0.5, b.size * 0.6, 0);
    endShape(CLOSE);

    let wingXOffset = b.size * 0.15;

    for (let side of [-1, 1]) {
        push();
        translate(wingXOffset, 0);
        rotate(wingAngle * side);
        beginShape();
        vertex(0, 0);
        bezierVertex(wingWidth, side * wingLen * 0.3, wingWidth * 0.7, side * wingLen, 0, side * wingLen);
        bezierVertex(-wingWidth * 0.4, side * wingLen * 0.5, 0, 0, 0, 0);
        endShape(CLOSE);
        pop();
    }
    pop();

    // Reset filter
    drawingContext.filter = 'none';
}

function windowResized() {
    // No resizing for fixed frame
}
