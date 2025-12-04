const socket = io();

let currentQuestion = null;
let timeLeft = 5;
let timerInterval = null;
let participantGroup = null;

// Screen elements
const waitingScreen = document.getElementById('waiting-screen');
const quizScreen = document.getElementById('quiz-screen');
const choiceScreen = document.getElementById('choice-screen');
const completeScreen = document.getElementById('complete-screen');

// Quiz elements
const questionNumber = document.getElementById('question-number');
const questionText = document.getElementById('question-text');
const optionsContainer = document.getElementById('options-container');
const timerElement = document.getElementById('timer');
const progressBar = document.getElementById('progress-bar');
const feedback = document.getElementById('feedback');
const quizContent = document.querySelector('.quiz-content');

// Connect to server
socket.emit('participant-join');

// Listen for waiting state
socket.on('waiting', (data) => {
    showScreen('waiting');
});

// Listen for questions
socket.on('question', (data) => {
    currentQuestion = data;
    participantGroup = data.group;
    displayQuestion(data);
    showScreen('quiz');
    startTimer();
});

// Listen for final choice
socket.on('show-final-choice', () => {
    showScreen('choice');
    setupChoiceButtons();
});

// Listen for experiment complete
socket.on('experiment-complete', () => {
    showScreen('complete');
});

// Show specific screen
function showScreen(screenName) {
    const screens = [waitingScreen, quizScreen, choiceScreen, completeScreen];
    screens.forEach(screen => screen.classList.remove('active'));

    setTimeout(() => {
        switch (screenName) {
            case 'waiting':
                waitingScreen.classList.add('active');
                break;
            case 'quiz':
                quizScreen.classList.add('active');
                break;
            case 'choice':
                choiceScreen.classList.add('active');
                break;
            case 'complete':
                completeScreen.classList.add('active');
                break;
        }
    }, 100);
}

// Display question
function displayQuestion(data) {
    // Update question number
    questionNumber.textContent = `Question ${data.questionNumber}/${data.totalQuestions}`;

    // Update progress bar
    const progress = (data.questionNumber / data.totalQuestions) * 100;
    progressBar.style.width = progress + '%';

    // Update question text
    questionText.textContent = data.question;

    // Clear previous options
    optionsContainer.innerHTML = '';

    // Create option buttons
    data.options.forEach((option, index) => {
        const button = document.createElement('button');
        button.className = 'option-btn';
        button.textContent = option;
        button.onclick = () => selectAnswer(option, data.correctAnswer);
        optionsContainer.appendChild(button);
    });

    // Reset timer
    timeLeft = 5;
    updateTimerDisplay();
}

// Start timer
function startTimer() {
    if (timerInterval) clearInterval(timerInterval);

    timeLeft = 5;
    updateTimerDisplay();

    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();

        if (timeLeft <= 2) {
            timerElement.classList.add('urgent');
        }

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            // Auto-submit with no answer
            submitAnswer(null, false);
        }
    }, 1000);
}

// Update timer display
function updateTimerDisplay() {
    timerElement.textContent = timeLeft + 's';
    if (timeLeft > 2) {
        timerElement.classList.remove('urgent');
    }
}

// Select answer
function selectAnswer(selectedAnswer, correctAnswer) {
    if (!currentQuestion) return;

    // Clear timer
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    // Check if correct
    const isCorrect = selectedAnswer === correctAnswer;

    // Visual feedback
    const buttons = optionsContainer.querySelectorAll('.option-btn');
    buttons.forEach(btn => {
        btn.disabled = true;
        if (btn.textContent == selectedAnswer) {
            btn.classList.add(isCorrect ? 'correct' : 'wrong');
        }
    });

    // Show feedback for wrong answers (complex group only)
    if (!isCorrect && participantGroup === 'complex') {
        showWrongFeedback();
    }

    // Submit answer after brief delay
    setTimeout(() => {
        submitAnswer(selectedAnswer, isCorrect);
    }, 1000);
}

// Show wrong answer feedback
function showWrongFeedback() {
    // Flash red
    quizContent.classList.add('flash-red');

    // Show angry emoji
    feedback.classList.remove('hidden');
    feedback.classList.add('show');

    // Remove after animation
    setTimeout(() => {
        quizContent.classList.remove('flash-red');
        feedback.classList.remove('show');
        setTimeout(() => {
            feedback.classList.add('hidden');
        }, 100);
    }, 800);
}

// Submit answer
function submitAnswer(answer, correct) {
    socket.emit('submit-answer', {
        question: currentQuestion.question,
        answer: answer,
        correct: correct
    });
}

// Setup choice buttons
function setupChoiceButtons() {
    const choiceButtons = document.querySelectorAll('.choice-btn');
    choiceButtons.forEach(btn => {
        btn.onclick = () => {
            const choice = btn.dataset.choice;
            submitFinalChoice(choice);

            // Disable buttons
            choiceButtons.forEach(b => b.disabled = true);
        };
    });
}

// Submit final choice
function submitFinalChoice(choice) {
    socket.emit('submit-final-choice', {
        choice: choice
    });
}

// Handle disconnection
socket.on('disconnect', () => {
    console.log('Disconnected from server');
});

socket.on('connect', () => {
    console.log('Connected to server');
});
