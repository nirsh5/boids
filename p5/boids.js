let flock = [];
const flockSize = 7;
let noiseOffset = 0;
let pg; // Graphics layer for lines
let currentRule = 'default'; // Default mode
let visualsAlpha = 0; // Fade-in for visual elements

function setup() {
    // Fixed dimensions matching other pages
    const cw = 1546;
    const ch = 1004;
    let canvas = createCanvas(cw, ch);
    canvas.parent('canvas-container');

    pg = createGraphics(cw, ch);
    strokeJoin(ROUND);
    noStroke();
    frameRate(40);

    // Initial spawn position - Off screen right (like 7birds.js)
    let startX = cw + 100;
    let startY = ch * 0.4;

    for (let i = 0; i < flockSize; i++) {
        flock.push({
            id: i,
            pos: createVector(startX + random(-50, 50), startY + random(-50, 50)),
            vel: createVector(random(-3, -5), random(-1, 1)), // Moving left initially
            acc: createVector(0, 0),
            maxSpeed: 3.5, // Standardized maxSpeed
            maxForce: 0.1, // Standardized maxForce
            size: 6,
            wingPhase: random(TWO_PI),
            smoothHeading: 0
        });
    }
}

let targetRule = 'default';
let fadeStep = 0.0; // 0 to 1 progress for easing
let fadeState = 'stable'; // 'stable', 'fading_out', 'fading_in'
let transitionStartTime = 0;

// Exposed function for HTML to call
function changeRule(ruleName) {
    let newRule = ruleName.toLowerCase();
    // Start Cross-Fade: Set target, allow draw loop to Fade Out -> Switch -> Fade In
    targetRule = newRule;
}

// Global mouse tracking from parent
let gMouseX = -1000;
let gMouseY = -1000;
let lastMsgTime = 0;

window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'GLOBAL_MOUSE_MOVE') {
        gMouseX = event.data.x;
        gMouseY = event.data.y;
        lastMsgTime = millis();
        // console.log("Boids received Global Mouse:", gMouseX, gMouseY);
    } else if (event.data === 'start-exit-transition') {
        // Trigger fade out
        targetRule = 'exit'; // Special rule for fading out
    }
});

function draw() {
    clear(); // Transparent background

    let mouse;
    // Use global mouse if recent message received (within 200ms)
    // Otherwise use local mouseX (when overlay is closed)
    if (millis() - lastMsgTime < 500) {
        mouse = createVector(gMouseX, gMouseY);
    } else {
        mouse = createVector(mouseX, mouseY);
    }
    let centerOfMass = createVector(0, 0);
    for (let b of flock) centerOfMass.add(b.pos);
    centerOfMass.div(flock.length);

    noiseOffset += 0.005;

    // --- PHYSICS LOOP ---
    for (let b of flock) {
        // Base weights (tune per mode below if needed)
        let sepWeight = 3.5;
        let aliWeight = 1.2;
        let cohWeight = 0.06; // Weak base cohesion

        // Distance limits
        let sepDist = 75;
        // Adjust for Cohesion mode like original file
        // Mode Specific Physics Adjustments
        if (currentRule === 'default') {
            // 7birds.js values
            sepDist = 45;
            sepWeight = 2.5;
            aliWeight = 1.3;
            cohWeight = 1.0;
            // Note: 7birds uses a different cohesion algorithm standard, 
            // but we can approximate or use the standard one with high weight?
            // 7birds cohesion is: sum positions, div count, seek target.
            // Our standard cohesion is essentially that.
            // But 7birds also has "globalCoh" to center 0.04 weight.
        } else if (currentRule === 'cohesion') {
            sepDist = 80;
            sepWeight = 4.5;
            aliWeight = 1.0;
        }

        let sep = separation(b, flock, sepDist);
        let ali = alignment(b, flock, (currentRule === 'default' ? 130 : 100)); // 130 for 7birds

        // Cohesion Logic Variation
        let coh = createVector(0, 0);
        if (currentRule === 'cohesion') {
            // Complex cohesion from cohesion.js
            let distToCenter = p5.Vector.dist(b.pos, centerOfMass);
            coh = p5.Vector.sub(centerOfMass, b.pos);

            if (distToCenter < 40) {
                // Formatting "don't run over" force
                coh.setMag(0.15).mult(-1);
            } else if (distToCenter > 0) {
                let cohMag = (b.id <= 3) ? 0.12 : 0.04;
                coh.setMag(cohMag);
            }
        } else if (currentRule === 'default') {
            // 7birds style cohesion
            coh = cohesion(b, flock, 130); // Use standard cohesion function
            // Plus global center pull
            let globalCoh = p5.Vector.sub(centerOfMass, b.pos);
            globalCoh.setMag(0.04);
            b.acc.add(globalCoh);
        } else {
            // Simple cohesion for other modes (keep them loosely grouped)
            coh = p5.Vector.sub(centerOfMass, b.pos);
            if (coh.mag() > 0) {
                let cohMag = (b.id === 0) ? 0.15 : 0.06;
                coh.setMag(cohMag);
            }
        }

        let n = noise(b.pos.x * 0.005, b.pos.y * 0.005, noiseOffset);
        let flow = p5.Vector.fromAngle(n * TWO_PI * 2).mult(0.12);
        if (currentRule === 'default') flow.mult(1.25); // 0.15 in 7birds vs 0.12 here

        let flee = createVector(0, 0);
        let fleeDist = (currentRule === 'default') ? 160 : 130;
        if (p5.Vector.dist(mouse, b.pos) < fleeDist) {
            flee = p5.Vector.sub(b.pos, mouse).setMag(1.2);
            if (currentRule === 'default') flee.setMag(1.4);
        }

        // Apply weights
        sep.mult(sepWeight);
        ali.mult(aliWeight);
        // Cohesion already scaled in logic above for 'cohesion' mode, or standard scaling:
        // Actually the cohesion.js logic sets magnitude directly, so separate mult not needed there.
        // For standard mode, we didn't mult yet.
        // Let's rely on setMag in the logic blocks for Cohesion.
        if (currentRule !== 'cohesion' && currentRule !== 'default') {
            // For standard separation/alignment modes (simple cohesion)
            // We didn't scale coh vector yet
            coh.mult(cohWeight);
        }
        if (currentRule === 'default') {
            coh.mult(1.0);
        }

        b.acc.add(sep);
        b.acc.add(ali);
        b.acc.add(coh); // Add directly as it was setMag'd
        b.acc.add(flow);
        b.acc.add(flee);
        b.acc.add(stayInRestrictedArea(b));

        b.vel.add(b.acc);
        let maxS = b.maxSpeed;
        if (currentRule === 'default') maxS = 2.0; // 7birds speed
        b.vel.limit(maxS);
        b.pos.add(b.vel);
        b.acc.mult(0);

        // Smooth heading for display
        let targetHeading = b.vel.heading();
        let diff = targetHeading - b.smoothHeading;
        while (diff < -PI) diff += TWO_PI;
        while (diff > PI) diff -= TWO_PI;
        b.smoothHeading += diff * 0.12;

        b.wingPhase += 0.1; // Flap speed
    }

    // --- VISUALIZATION LAYERS ---

    // --- TIME-BASED FADE LOGIC ---
    let currentTime = millis();

    // Initialize transition if needed
    if (currentRule !== targetRule && fadeState === 'stable') {
        fadeState = 'fading_out';
        transitionStartTime = currentTime;
    }

    if (fadeState === 'fading_out') {
        let duration = 500;
        let elapsed = currentTime - transitionStartTime;
        let t = constrain(elapsed / duration, 0, 1);
        fadeStep = 1.0 - t;

        if (t >= 1.0) {
            currentRule = targetRule;
            fadeStep = 0;
            if (currentRule !== 'exit') {
                fadeState = 'fading_in';
                transitionStartTime = currentTime;
            } else {
                fadeState = 'stable';
            }
        }
    } else if (fadeState === 'fading_in') {
        let duration = 500;
        let elapsed = currentTime - transitionStartTime;
        let t = constrain(elapsed / duration, 0, 1);
        fadeStep = t;

        if (t >= 1.0) {
            fadeStep = 1.0;
            fadeState = 'stable';
        }
    } else {
        // Stable
        fadeStep = (currentRule === 'exit') ? 0 : 1.0;
    }

    // Apply SmoothStep Easing (t * t * (3 - 2 * t)) for non-linear feel (User Request)
    let t = fadeStep;
    let smoothStep = t * t * (3 - 2 * t);
    visualsAlpha = smoothStep * 255;

    // Derived Alpha for White Bird (starts at 0.1s/20%, ends at 1.0s/100%)
    // Map t from [0.2, 1] to [0, 1]
    let wbT = constrain(map(t, 0.2, 1.0, 0, 1), 0, 1);
    let wbSmooth = wbT * wbT * (3 - 2 * wbT);
    let whiteBirdAlpha = wbSmooth * 255;

    // If exiting, force visualsAlpha to fade out regardless of rule
    if (targetRule === 'exit') {
        // fadeStep is decreasing above, so visualsAlpha will go to 0
    }

    // 1. Lines Layer (PGGraphics)
    pg.clear();

    if (currentRule !== 'default') {
        if (currentRule === 'separation') {
            // Separation Lines: Connect Leader (0) to neighbors 1,2,3
            for (let i = 1; i <= 3; i++) {
                pg.stroke(255, visualsAlpha);
                pg.strokeWeight(0.7);
                pg.line(flock[0].pos.x, flock[0].pos.y, flock[i].pos.x, flock[i].pos.y);
                eraseFromPoint(pg, flock[0]);
                eraseFromPoint(pg, flock[i]);
            }
        } else if (currentRule === 'cohesion') {
            // Cohesion Lines: Connect all to Center of Mass
            for (let b of flock) {
                // Skip last 2 for "detached" look from original
                if (b.id >= flockSize - 2) continue;

                pg.stroke(255, visualsAlpha);
                pg.strokeWeight(0.7);

                pg.line(centerOfMass.x, centerOfMass.y, b.pos.x, b.pos.y);
                eraseFromPoint(pg, b);
            }
        }
    }
    // Alignment has no "connecting" lines in the PG layer, it uses local drawing for vectors

    image(pg, 0, 0);

    // 2. Boid Drawing Layer
    if (currentRule === 'default') {
        // Simple drawing for default mode (like 7birds)
        for (let b of flock) {
            push();
            translate(b.pos.x, b.pos.y);
            rotate(b.smoothHeading);

            // Just the bird (no halo, no lines)
            // But 7birds has 0,139 opacity fill. 
            // My drawBlackBirdCore does that.

            // Just draw the core bird
            pop();
            drawBlackBirdCore(b);
        }
    } else if (currentRule === 'separation') {
        // Leader Highlight
        let leader = flock[0];
        // User Request: Bird UNDER triangle (draw first)
        drawBlackBirdCore(leader);

        push();
        translate(leader.pos.x, leader.pos.y);
        rotate(leader.smoothHeading);
        // Use whiteBirdAlpha for Leader (id=0)
        fill(255, map(whiteBirdAlpha, 0, 255, 0, 76.5)); stroke(255, whiteBirdAlpha); strokeWeight(1.2);
        drawTriangleShape(this, leader.size);
        pop();
        // (drawBlackBirdCore removed from here)

        // (Halo removed to match Cohesion style)

        // Others
        for (let i = 1; i < flock.length; i++) {
            let b = flock[i];
            push();
            translate(b.pos.x, b.pos.y);
            rotate(b.smoothHeading);
            noFill(); stroke(255, visualsAlpha); strokeWeight(0.8);
            drawTriangleShape(this, b.size);
            pop();
            drawBlackBirdCore(b);
        }

    } else if (currentRule === 'alignment') {
        // Draw all with Heading Lines

        let leader = flock[0];
        // Leader
        // User Request: Bird UNDER triangle
        drawBlackBirdCore(leader);

        push();
        translate(leader.pos.x, leader.pos.y);
        rotate(leader.smoothHeading);
        stroke(255, whiteBirdAlpha); strokeWeight(1.2);
        drawLeadingLine(leader.size, 4); // The vector line
        fill(255, map(whiteBirdAlpha, 0, 255, 0, 76.5));
        drawTriangleShape(this, leader.size);
        pop();
        // (drawBlackBirdCore removed from here)

        // (Halo removed to match Cohesion style)

        // Others
        for (let i = 1; i < flock.length; i++) {
            let b = flock[i];
            push();
            translate(b.pos.x, b.pos.y);
            rotate(b.smoothHeading);
            stroke(255, visualsAlpha); strokeWeight(0.8);
            drawLeadingLine(b.size, 4); // The vector line
            noFill();
            drawTriangleShape(this, b.size);
            pop();
            drawBlackBirdCore(b);
        }

    } else if (currentRule === 'cohesion') {
        // Similar to Separation but with Cohesion styling (Leader bold, others thin)
        for (let b of flock) {
            // User Request: For brightest triangle (id==0), bird should be UNDER (drawn first).
            if (b.id === 0) drawBlackBirdCore(b);

            push();
            translate(b.pos.x, b.pos.y);
            rotate(b.smoothHeading);

            if (b.id === 0) {
                fill(255, map(whiteBirdAlpha, 0, 255, 0, 76.5)); stroke(255, whiteBirdAlpha); strokeWeight(1.2);
            } else {
                noFill(); stroke(255, visualsAlpha); strokeWeight(0.8);
            }

            drawTriangleShape(this, b.size);
            pop();

            // For others, bird stays ON TOP (drawn last)
            if (b.id !== 0) drawBlackBirdCore(b);
        }
    }
}

// --- HELPERS ---

function separation(b, group, dist) {
    let steer = createVector(0, 0);
    let count = 0;
    for (let other of group) {
        let d = p5.Vector.dist(b.pos, other.pos);
        if (other !== b && d < dist) {
            let diff = p5.Vector.sub(b.pos, other.pos);
            diff.normalize().div(d); steer.add(diff); count++;
        }
    }
    if (count > 0) steer.div(count).setMag(b.maxSpeed).sub(b.vel).limit(b.maxForce);
    return steer;
}

function alignment(b, group, dist) {
    let sum = createVector(0, 0);
    let count = 0;
    for (let other of group) {
        let d = p5.Vector.dist(b.pos, other.pos);
        if (other !== b && d < dist) { sum.add(other.vel); count++; }
    }
    if (count > 0) {
        sum.div(count).setMag(b.maxSpeed).sub(b.vel).limit(b.maxForce);
        return sum;
    }
    return createVector(0, 0);
}

function cohesion(b, group, dist) {
    let sum = createVector(0, 0);
    let count = 0;
    for (let other of group) {
        let d = p5.Vector.dist(b.pos, other.pos);
        if (other !== b && d < dist) { sum.add(other.pos); count++; }
    }
    if (count > 0) {
        sum.div(count);
        let desired = p5.Vector.sub(sum, b.pos).setMag(b.maxSpeed);
        return p5.Vector.sub(desired, b.vel).limit(b.maxForce);
    }
    return createVector(0, 0);
}

function stayInRestrictedArea(b) {
    let steer = createVector(0, 0);
    let minX = width * 0.45;  // 45% from left
    let maxX = width * 0.80;  // 20% from right
    let minY = height * 0.25;
    let maxY = height * 0.58;
    if (b.pos.x < minX) steer.x = b.maxForce * 3;
    else if (b.pos.x > maxX) steer.x = -b.maxForce * 3;
    if (b.pos.y < minY) steer.y = b.maxForce * 3;
    else if (b.pos.y > maxY) steer.y = -b.maxForce * 3;
    return steer;
}

// Visual Helpers
function drawBlackBirdCore(b) {
    push();
    translate(b.pos.x, b.pos.y);
    rotate(b.smoothHeading);

    drawingContext.filter = 'blur(0.75px)'; // Removed to fix flickering/performance
    noStroke(); fill(0, 139);

    let flap = sin(frameCount * 0.22 + b.wingPhase);
    let wingLen = b.size * 1.0;
    let wingWidth = b.size * 0.6;
    let wingAngle = map(flap, -1, 1, -0.1, 1.3);

    beginShape();
    vertex(b.size * 0.6, 0);
    bezierVertex(b.size * 0.3, -b.size * 0.5, -b.size * 0.2, -b.size * 0.5, -b.size * 0.5, 0);
    vertex(-b.size * 0.9, 0);
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
    drawingContext.filter = 'none';
}

function drawTriangleShape(target, size) {
    // Map SVG (Upright, 20x25) to P5 (Right-facing, scaled by size)
    // Scale factors derived from original h = size*8, w = size*6
    const sX = (size * 8) / 25; // Scale height
    const sY = (size * 6) / 20; // Scale width

    // Pivot roughly at y=18 in SVG to match center of mass alignment
    const pivotY = 18;

    // Transform helper
    const tx = (bx) => (pivotY - bx) * sX;
    const ty = (by) => (by - 10) * sY;

    target.beginShape();

    // Start at Top-Left of Tip Curve (P1)
    target.vertex(tx(0.736), ty(9.076));

    // Tip Curve
    target.bezierVertex(
        tx(0.088), ty(9.319),
        tx(0.088), ty(10.237),
        tx(0.736), ty(10.480)
    );

    // Line to Bottom Right (P2 implied)
    target.vertex(tx(24.097), ty(19.259));

    // Bottom Right Curve
    target.bezierVertex(
        tx(24.588), ty(19.443),
        tx(25.111), ty(19.080),
        tx(25.111), ty(18.557)
    );

    // Line to Bottom Left (P3 implied)
    target.vertex(tx(25.111), ty(1.001));

    // Bottom Left Curve
    target.bezierVertex(
        tx(25.111), ty(0.477),
        tx(24.588), ty(0.115),
        tx(24.097), ty(0.299)
    );

    // Close shape (matches P1)
    target.endShape(CLOSE);
}

function drawLeadingLine(size, lengthMultiplier) {
    let h = size * 8;
    let tailOffset = -h * 0.3;
    let headX = h + tailOffset;
    let lineLen = size * lengthMultiplier;
    line(headX, 0, headX + lineLen, 0);
}

function eraseFromPoint(targetLayer, b) {
    targetLayer.push();
    targetLayer.translate(b.pos.x, b.pos.y);
    targetLayer.rotate(b.smoothHeading);
    targetLayer.erase();
    drawTriangleShape(targetLayer, b.size);
    targetLayer.noErase();
    targetLayer.pop();
}

function windowResized() { }
