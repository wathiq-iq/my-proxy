// Pong Game.js

const canvas = document.getElementById('pong');
const context = canvas.getContext('2d');

// Create the pong paddle
const paddleWidth = 10;
const paddleHeight = 100;
const player = { x: 0, y: canvas.height / 2 - paddleHeight / 2, width: paddleWidth, height: paddleHeight, color: '#00f' };
const computer = { x: canvas.width - paddleWidth, y: canvas.height / 2 - paddleHeight / 2, width: paddleWidth, height: paddleHeight, color: '#f00' };

// Create the pong ball
const ballSize = 10;
const ball = { x: canvas.width / 2 - ballSize / 2, y: canvas.height / 2 - ballSize / 2, size: ballSize, speed: 5, dx: 5, dy: 5 };

let playerScore = 0;
let computerScore = 0;

// Draw everything
function draw() {
    // Clear the canvas
    context.clearRect(0, 0, canvas.width, canvas.height);

    // Draw paddles
    context.fillStyle = player.color;
    context.fillRect(player.x, player.y, player.width, player.height);
    context.fillStyle = computer.color;
    context.fillRect(computer.x, computer.y, computer.width, computer.height);

    // Draw ball
    context.fillStyle = '#fff';
    context.fillRect(ball.x, ball.y, ball.size, ball.size);

    // Draw scores
    context.font = '20px Arial';
    context.fillText(playerScore, canvas.width / 4, 20);
    context.fillText(computerScore, 3 * canvas.width / 4, 20);
}

// Update game logic
function update() {
    // Move the ball
    ball.x += ball.dx;
    ball.y += ball.dy;

    // Wall collision detection
    if (ball.y + ball.size > canvas.height || ball.y < 0) {
        ball.dy *= -1;
    }

    // Paddle collision detection
    if (ball.x < player.x + player.width && ball.y + ball.size > player.y && ball.y < player.y + player.height) {
        ball.dx *= -1;
    }
    if (ball.x + ball.size > computer.x && ball.y + ball.size > computer.y && ball.y < computer.y + computer.height) {
        ball.dx *= -1;
    }

    // Score update
    if (ball.x < 0) {
        computerScore++;
        resetBall();
    } else if (ball.x + ball.size > canvas.width) {
        playerScore++;
        resetBall();
    }

    // Computer AI
    if (computer.y < ball.y) {
        computer.y += 4;
    } else {
        computer.y -= 4;
    }
}

// Reset ball to center
function resetBall() {
    ball.x = canvas.width / 2 - ball.size / 2;
    ball.y = canvas.height / 2 - ball.size / 2;
    ball.dx *= -1;
}

// Game loop
function gameLoop() {
    draw();
    update();
    requestAnimationFrame(gameLoop);
}

document.addEventListener('mousemove', (event) => {
    const mouseY = event.clientY - canvas.getBoundingClientRect().top;
    if (mouseY >= 0 && mouseY <= canvas.height - player.height) {
        player.y = mouseY;
    }
});

// Start the game
requestAnimationFrame(gameLoop);