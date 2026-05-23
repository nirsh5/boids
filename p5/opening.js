let boids = [];
const COUNT = 1600;
let noiseOffset = 0;
let zOffset = 0;
let smoothMouse;

// Exit Animation State
let isExiting = false;
let virtualMouse;
let transitionSignaled = false;

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
    // Listen for logo appearance signal from OPENING.html
    if (event.data === 'logo-appeared') {
        animationStarted = true;
    }
});

function setup() {
    // Fixed dimensions for the project frame 1546x1004
    const cw = 1546;
    const ch = 1004;
    let canvas = createCanvas(cw, ch);
    canvas.parent('canvas-container');

    frameRate(40);
    noStroke();

    smoothMouse = createVector(mouseX, mouseY);
    virtualMouse = createVector(mouseX, mouseY);

    // כניסה דרמטית מהפינה השמאלית עליונה מחוץ למסך (מרחק 300)
    let startX = -300;
    let startY = -300;

    for (let i = 0; i < COUNT; i++) {
        let b = new Boid(startX + random(-100, 100), startY + random(-100, 100));
        // מכוון אותן פנימה לכיוון המסך (ימינה ולמטה)
        b.vel = createVector(random(3, 6), random(3, 6));
        boids.push(b);
    }
}

function draw() {
    clear(); // Use clear instead of background(255) for layering

    // Don't animate until logo has appeared
    if (!animationStarted && !isExiting) {
        // Draw static birds in their initial positions
        for (let b of boids) {
            b.show();
        }
        return;
    }

    noiseOffset += 0.004;
    zOffset += 0.0015;

    let targetPoint;

    if (isExiting) {
        // מנתק מהעכבר הפיזי ומדמה תנועת עכבר כלפי מעלה מחוץ למסך
        virtualMouse.y -= 12; // מהירות העלייה למעלה
        // הוספת "זגזוג" קל כדי שזה ייראה טבעי
        virtualMouse.x += sin(frameCount * 0.1) * 2;
        targetPoint = virtualMouse;
    } else {
        let mx = mouseX;
        let my = mouseY;
        if (millis() - lastMsgTime < 500) {
            mx = gMouseX;
            my = gMouseY;
        }
        targetPoint = createVector(mx, my);
        virtualMouse.set(mx, my); // מעדכן את נקודת ההתחלה של היציאה
    }

    // מעקב עכבר מהיר ותגובתי
    smoothMouse = p5.Vector.lerp(smoothMouse, targetPoint, 0.15);

    // חישוב ממוצע הלהקה ללכידות חזקה
    let avgPos = createVector(0, 0);
    for (let b of boids) avgPos.add(b.pos);
    avgPos.div(boids.length);

    for (let b of boids) {
        b.applyBehaviors(avgPos, smoothMouse, boids);
        b.update();
        b.show();
    }

    // בדיקה אם הלהקה יצאה לגמרי מהמסך
    if (isExiting && !transitionSignaled) {
        let lowestY = -Infinity;
        for (let b of boids) {
            if (b.pos.y > lowestY) lowestY = b.pos.y;
        }

        // אם הציפור הנמוכה ביותר כבר מעל קצה המסך (מגע עם הקצה)
        if (lowestY < 10) {
            window.postMessage('flock-cleared', '*');
            transitionSignaled = true;
        }
    }
}

// פונקציה חיצונית להפעלת האנימציה
function triggerExit() {
    isExiting = true;
}

class Boid {
    constructor(x, y) {
        this.pos = createVector(x, y);
        this.vel = p5.Vector.random2D().mult(random(2, 4));
        this.acc = createVector(0, 0);
        this.maxSpeed = 4.5; // Match simulation.js
        this.maxForce = 0.25;
        this.size = 6;
        this.wingPhase = random(TWO_PI);
    }

    applyBehaviors(avgPos, target, others) {
        // 1. מעקב עכבר חזק
        let attraction = p5.Vector.sub(target, this.pos);
        let steerToTarget = p5.Vector.sub(attraction, this.vel);
        steerToTarget.limit(0.15);
        this.acc.add(steerToTarget);

        // 2. לכידות (Cohesion) - הלב של המרמוריישן
        let coh = p5.Vector.sub(avgPos, this.pos);
        coh.mult(0.0006);
        this.acc.add(coh);

        // 3. הפרדה (Separation) מותאמת לגודל החדש
        for (let i = 0; i < 4; i++) {
            let other = others[floor(random(others.length))];
            let dSq = (this.pos.x - other.pos.x) ** 2 + (this.pos.y - other.pos.y) ** 2;
            if (other !== this && dSq < 4900) { // Match simulation.js (70px radius)
                let diff = p5.Vector.sub(this.pos, other.pos);
                diff.setMag(0.18); // Match simulation.js
                this.acc.add(diff);
            }
        }

        // 4. רעש זרימה אורגני
        let n = noise(this.pos.x * 0.002, this.pos.y * 0.002, zOffset);
        let flow = p5.Vector.fromAngle(n * TWO_PI * 4).mult(0.15);
        this.acc.add(flow);

        // גבולות רכים - בתנאי שאיננו במצב יציאה
        if (!isExiting) {
            this.acc.add(this.softBoundaries());
        }
    }

    softBoundaries() {
        let steer = createVector(0, 0);
        let edgeOut = 140;
        let margin = 100;
        let strength = this.maxForce * 1.5;

        let leftWall = -edgeOut;
        let rightWall = width + edgeOut;
        let topWall = -edgeOut;
        let bottomWall = height + edgeOut;

        if (this.pos.x < leftWall + margin) {
            steer.x = map(this.pos.x, leftWall, leftWall + margin, strength, 0);
        } else if (this.pos.x > rightWall - margin) {
            steer.x = map(this.pos.x, rightWall - margin, rightWall, 0, -strength);
        }

        if (this.pos.y < topWall + margin) {
            steer.y = map(this.pos.y, topWall, topWall + margin, strength, 0);
        } else if (this.pos.y > bottomWall - margin) {
            steer.y = map(this.pos.y, bottomWall - margin, bottomWall, 0, -strength);
        }

        return steer;
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

function windowResized() {
    // Fixed size 1546x1004
}
