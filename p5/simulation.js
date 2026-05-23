let boids = [];
const COUNT = 1600;
let noiseOffset = 0;
let zOffset = 0;
let target;
let predator;
let foods = [];
let currentState = "murmuration";

function setup() {
    // Fixed dimensions for the project frame 1546x1004
    const cw = 1546;
    const ch = 1004;
    let canvas = createCanvas(cw, ch);
    canvas.parent('canvas-container');

    frameRate(40);
    noStroke();

    target = createVector(width / 2, height * 0.3);
    predator = createVector(0, 0);

    for (let i = 0; i < 3; i++) {
        foods.push(createVector(random(width), random(height * 0.7)));
    }

    // כניסה דרמטית מהפינה
    // כניסה דרמטית מימין (כמו ב-7birds.js)
    let startX = width + 500; // Increased from 400 to 500 to start further off-screen as requested
    let startY = height * 0.4;
    for (let i = 0; i < COUNT; i++) {
        // Organic Spawn Shape (Circle) to avoid "boxy" edges
        let offset = p5.Vector.random2D().mult(random(250)); // Radius 250 cloud
        let b = new Boid(startX + offset.x, startY + offset.y);
        b.vel = createVector(random(-3, -6), random(-2, 2)); // Moving left intially
        boids.push(b);
    }
}

// Global function to change state from HTML buttons
function changeSimulationMode(mode) {
    currentState = mode.toLowerCase();
}

// Global mouse tracking
let gMouseX = -1000;
let gMouseY = -1000;
let lastMsgTime = 0;

window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'GLOBAL_MOUSE_MOVE') {
        gMouseX = event.data.x;
        gMouseY = event.data.y;
        lastMsgTime = millis();
    }
});

let virtualMouse = null; // Add global for virtual mouse

function draw() {
    clear(); // Use clear() for transparency

    // Determine effective mouse position
    let mx = mouseX;
    let my = mouseY;
    if (millis() - lastMsgTime < 500) {
        mx = gMouseX;
        my = gMouseY;
    }


    zOffset += 0.0015;

    if (currentState === "reflect") {
        // Virtual Mouse Logic (Match opening.js)
        if (!virtualMouse) virtualMouse = createVector(mx, my);

        virtualMouse.y -= 12; // Speed up
        virtualMouse.x += sin(frameCount * 0.1) * 2; // Zigzag
        target.set(virtualMouse); // Boids will seek this
    } else if (currentState === "foraging") {
        if (frameCount % 300 === 0) {
            foods[floor(random(foods.length))] = createVector(random(width * 0.2, width * 0.8), random(height * 0.2, height * 0.7));
        }
    } else if (currentState === "roosting") {
        noiseOffset += 0.002;
    } else {
        noiseOffset += 0.004;
        // תנועת יעד אוטונומית בלבד
        let tx = noise(noiseOffset * 0.5) * width;
        let ty = noise(noiseOffset * 0.5 + 1000) * (height * 0.8);
        target.set(tx, ty);

        if (currentState === "predator") {
            let px = noise(noiseOffset * 0.8 + 2000) * width;
            let py = noise(noiseOffset * 0.8 + 3000) * height;
            predator.set(px, py);
        }
    }

    let flockCleared = false;
    let avgPos = createVector(0, 0);
    if (currentState !== "split") {
        let lowestY = -Infinity;
        for (let b of boids) {
            avgPos.add(b.pos);
            if (b.pos.y > lowestY) lowestY = b.pos.y;
        }
        avgPos.div(boids.length);

        // Check clearance for Reflect mode
        if (currentState === "reflect" && !flockCleared) {
            // If the LOWEST boid is above the screen (with margin)
            if (lowestY < -50) {
                window.parent.postMessage('flock-cleared', '*');
                flockCleared = true;
            }
        }
    }

    for (let b of boids) {
        b.applyBehaviors(avgPos, target, foods, predator, boids);
        b.update();
        b.show();
    }

    // Calculate Vector from UI Triangle Position to Target
    // Triangle is centered visually at:
    // X: 220px (footer left) + 45px (half circle) = 265px
    // Y: Bottom 44px (footer) + 45px (half circle) = 89px from bottom
    let origin = createVector(265, height - 89);

    // Calculate Approximate Center of Mass (Sampling every 10th boid for speed)
    let avgX = 0, avgY = 0, count = 0;
    let step = 10;
    for (let i = 0; i < boids.length; i += step) {
        avgX += boids[i].pos.x;
        avgY += boids[i].pos.y;
        count++;
    }

    let trackingPos;
    if (count > 0) {
        trackingPos = createVector(avgX / count, avgY / count);
    } else {
        trackingPos = origin.copy(); // Fallback
    }

    let dir = p5.Vector.sub(trackingPos, origin);

    // Update Triangle Rotation in UI
    if (!window.cachedNavSVG) {
        window.cachedNavSVG = document.querySelector ? document.querySelector('.circle-decoration svg') : null;
    }
    const navSVG = window.cachedNavSVG;
    if (navSVG) {
        // P5 0 is Right. SVG Points Up.
        // We want P5 0 (Right) -> SVG 90deg.
        let targetAngle = degrees(dir.heading()) + 90;

        // Normalize to -180 to 180 to handle wrapping correctly around 0 (Up)
        while (targetAngle > 180) targetAngle -= 360;
        while (targetAngle < -180) targetAngle += 360;

        // Clamp to prevent pointing explicitly down/backwards
        // Widened to 80 deg (almost full 180 semi-circle) for better tracking
        targetAngle = constrain(targetAngle, -80, 80);

        // --- Spring Physics Implementation for "Bouncy/Alive" feel ---

        // Initialize state on the element if missing
        if (typeof navSVG.currentAngle === 'undefined') {
            navSVG.currentAngle = parseFloat(navSVG.dataset.angle || 0);
            navSVG.angleVelocity = 0;
        }

        // Calculate distance to target (shortest path)
        let diff = targetAngle - navSVG.currentAngle;
        while (diff < -180) diff += 360;
        while (diff > 180) diff -= 360;

        // Spring Constants
        const springStrength = 0.2; // How "stiff" the spring is (higher = snappier)
        const damping = 0.75;       // How much it slows down (lower = more bounce/oscillation)

        // Physics Step
        let force = diff * springStrength;
        navSVG.angleVelocity += force;
        navSVG.angleVelocity *= damping; // Drag/Resistance
        navSVG.currentAngle += navSVG.angleVelocity;

        // Apply rotation AND the translation offset needed for proper pivot centering
        navSVG.style.transform = `translateY(-3px) rotate(${navSVG.currentAngle}deg)`;
        navSVG.dataset.angle = navSVG.currentAngle;
    }
}

class Boid {
    constructor(x, y) {
        this.pos = createVector(x, y);
        this.vel = p5.Vector.random2D().mult(random(2, 4));
        this.acc = createVector(0, 0);
        this.maxSpeed = 4.5;
        this.maxForce = 0.25;
        this.size = 6; // Match opening.js
        this.wingPhase = random(TWO_PI);
    }

    applyBehaviors(avgPos, target, foodSources, predator, others) {
        // Reset to default limits to prevent state leak from modes like "roosting"
        this.maxSpeed = 4.5;
        this.maxForce = 0.25;

        if (currentState === "roosting") {
            this.maxSpeed = 2.5;
            let anchor = createVector(width / 2 + sin(noiseOffset) * 100, height / 2);
            this.acc.add(p5.Vector.sub(avgPos, this.pos).mult(0.0006));
            this.acc.add(p5.Vector.sub(anchor, this.pos).mult(0.0004));
            this.separation(others, 75, 0.22);
            this.applyBoundaries();
        } else if (currentState === "reflect") {
            // Match opening.js logic EXACTLY
            this.maxSpeed = 5.5; // Match opening.js
            this.maxForce = 0.25;

            // 1. Seek Virtual Mouse (target is updated to virtualMouse in draw)
            let attraction = p5.Vector.sub(target, this.pos);
            let steerToTarget = p5.Vector.sub(attraction, this.vel);
            steerToTarget.limit(0.15);
            this.acc.add(steerToTarget);

            // 2. Cohesion
            let coh = p5.Vector.sub(avgPos, this.pos);
            coh.mult(0.0006);
            this.acc.add(coh);

            // 3. Separation (Custom inline to match opening.js 1:1)
            for (let i = 0; i < 4; i++) {
                let other = others[floor(random(others.length))];
                let dSq = (this.pos.x - other.pos.x) ** 2 + (this.pos.y - other.pos.y) ** 2;
                if (other !== this && dSq < 3600) { // 60px radius
                    let diff = p5.Vector.sub(this.pos, other.pos);
                    diff.setMag(0.15); // Constant push
                    this.acc.add(diff);
                }
            }

            // 4. Flow Noise
            let n = noise(this.pos.x * 0.002, this.pos.y * 0.002, zOffset); // Uses global zOffset
            let flow = p5.Vector.fromAngle(n * TWO_PI * 4).mult(0.15);
            this.acc.add(flow);

            // NO BOUNDARIES applied here
        } else if (currentState === "split") {
            this.localCohesion(others);
            this.standardExtras(others);
            this.acc.add(p5.Vector.sub(p5.Vector.sub(target, this.pos), this.vel).limit(0.1));

            this.acc.add(p5.Vector.sub(p5.Vector.sub(target, this.pos), this.vel).limit(0.1));
            this.applyBoundaries();
        } else {
            // Autonomous target seeking
            let steer = p5.Vector.sub(p5.Vector.sub(target, this.pos), this.vel);
            steer.limit(0.15);
            this.acc.add(steer);

            if (currentState === "foraging") {
                let closestFood = foodSources[0], minDist = Infinity;
                for (let f of foodSources) {
                    let d = p5.Vector.dist(this.pos, f);
                    if (d < minDist) { minDist = d; closestFood = f; }
                }
                this.acc.add(p5.Vector.sub(p5.Vector.sub(closestFood, this.pos), this.vel).limit(0.2));
            }

            if (currentState === "predator" && p5.Vector.dist(this.pos, predator) < 120) {
                let flee = p5.Vector.sub(this.pos, predator);
                flee.setMag(this.maxSpeed * 2);
                this.acc.add(p5.Vector.sub(flee, this.vel).limit(0.5));
            }

            this.acc.add(p5.Vector.sub(avgPos, this.pos).mult(0.0006));
            this.standardExtras(others);
            this.applyBoundaries();
        }
    }

    separation(others, distLimit, strength) {
        let sep = createVector(0, 0);
        for (let i = 0; i < 4; i++) {
            let other = others[floor(random(others.length))];
            let dSq = (this.pos.x - other.pos.x) ** 2 + (this.pos.y - other.pos.y) ** 2;
            if (other !== this && dSq < distLimit * distLimit) {
                let diff = p5.Vector.sub(this.pos, other.pos);
                diff.setMag(strength);
                sep.add(diff);
            }
        }
        this.acc.add(sep);
    }

    localCohesion(others) {
        let localAvg = createVector(0, 0), count = 0;
        for (let i = 0; i < 8; i++) {
            let other = others[floor(random(others.length))];
            if (other !== this && p5.Vector.dist(this.pos, other.pos) < 120) {
                localAvg.add(other.pos); count++;
            }
        }
        if (count > 0) {
            localAvg.div(count);
            this.acc.add(p5.Vector.sub(localAvg, this.pos).mult(0.0008));
        }
    }

    standardExtras(others) {
        this.separation(others, 70, 0.18);
        let n = noise(this.pos.x * 0.002, this.pos.y * 0.002, zOffset);
        let flow = p5.Vector.fromAngle(n * TWO_PI * 4).mult(0.15);
        this.acc.add(flow);
    }

    applyBoundaries() {
        let edgeOut = 140;
        let margin = 100;
        let strength = this.maxForce * 1.5;

        // Pre-calculate limits
        let leftWall = -edgeOut;
        let rightWall = width + edgeOut;
        let topWall = -edgeOut;
        let bottomWall = height - 200;

        // Apply force directly to acc to avoid creating new Vectors
        if (this.pos.x < leftWall + margin) {
            this.acc.x += map(this.pos.x, leftWall, leftWall + margin, strength, 0);
        } else if (this.pos.x > rightWall - margin) {
            this.acc.x += map(this.pos.x, rightWall - margin, rightWall, 0, -strength);
        }

        if (this.pos.y < topWall + margin) {
            this.acc.y += map(this.pos.y, topWall, topWall + margin, strength, 0);
        } else if (this.pos.y > bottomWall - margin) {
            this.acc.y += map(this.pos.y, bottomWall - margin, bottomWall, 0, -strength);
        }
    }

    update() {
        this.vel.add(this.acc);
        this.vel.limit(this.maxSpeed);
        this.pos.add(this.vel);
        this.acc.mult(0);
    }

    show() {
        push();
        translate(this.pos.x, this.pos.y);
        rotate(this.vel.heading());

        fill(0, 139);

        let flap = sin(frameCount * 0.22 + this.wingPhase);
        let wingLen = this.size * 1.0;
        let wingWidth = this.size * 0.6;
        let wingAngle = map(flap, -1, 1, -0.1, 1.3);

        // גוף הזרזיר המפורט
        beginShape();
        vertex(this.size * 0.6, 0);
        bezierVertex(this.size * 0.3, -this.size * 0.5, -this.size * 0.2, -this.size * 0.5, -this.size * 0.5, 0);
        vertex(-this.size * 0.9, 0); // Tail tip
        bezierVertex(-this.size * 0.2, this.size * 0.5, this.size * 0.3, this.size * 0.5, this.size * 0.6, 0);
        endShape(CLOSE);

        // כנפיים
        let wingXOffset = this.size * 0.15;
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
    }
}