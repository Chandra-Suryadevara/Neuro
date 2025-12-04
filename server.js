const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Session state
let sessionState = {
    participants: new Map(), // socketId -> participant data
    sessionActive: false,
    sessionStarted: false,
    complexGroup: [],
    simpleGroup: [],
    completedParticipants: new Set(),
    results: []
};

// Generate complex math question (4 options)
function generateComplexQuestion() {
    const operations = ['+', '-', '*'];
    const op = operations[Math.floor(Math.random() * operations.length)];

    let num1, num2, answer;

    if (op === '*') {
        num1 = Math.floor(Math.random() * 12) + 2;
        num2 = Math.floor(Math.random() * 12) + 2;
        answer = num1 * num2;
    } else if (op === '+') {
        num1 = Math.floor(Math.random() * 50) + 10;
        num2 = Math.floor(Math.random() * 50) + 10;
        answer = num1 + num2;
    } else {
        num1 = Math.floor(Math.random() * 50) + 20;
        num2 = Math.floor(Math.random() * 20) + 1;
        answer = num1 - num2;
    }

    const question = `${num1} ${op} ${num2}`;

    // Generate 3 wrong answers
    const options = [answer];
    while (options.length < 4) {
        let wrong;
        if (op === '*') {
            wrong = answer + Math.floor(Math.random() * 20) - 10;
        } else {
            wrong = answer + Math.floor(Math.random() * 10) - 5;
        }
        if (wrong !== answer && wrong > 0 && !options.includes(wrong)) {
            options.push(wrong);
        }
    }

    // Shuffle options
    for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
    }

    return {
        question,
        options,
        correctAnswer: answer
    };
}

// Generate simple addition question (single digit)
function generateSimpleQuestion() {
    const num1 = Math.floor(Math.random() * 9) + 1;
    const num2 = Math.floor(Math.random() * 9) + 1;
    const answer = num1 + num2;
    const question = `${num1} + ${num2}`;

    // Generate 3 obviously wrong answers
    const options = [answer];
    const wrongValues = [answer - 5, answer + 3, answer + 7].filter(v => v > 0 && v !== answer);
    options.push(...wrongValues.slice(0, 3));

    // Put correct answer first (obviously correct position)
    const shuffled = [answer];
    const remaining = options.filter(o => o !== answer);
    for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
    shuffled.push(...remaining);

    return {
        question,
        options: shuffled,
        correctAnswer: answer
    };
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    // Admin connection
    socket.on('admin-join', () => {
        console.log('Admin joined:', socket.id);
        socket.join('admin-room');

        // Send current state
        socket.emit('session-update', {
            participantCount: sessionState.participants.size,
            complexCount: sessionState.complexGroup.length,
            simpleCount: sessionState.simpleGroup.length,
            sessionActive: sessionState.sessionActive,
            sessionStarted: sessionState.sessionStarted
        });
    });

    // Participant connection
    socket.on('participant-join', () => {
        console.log('Participant joined:', socket.id);

        // Add participant to session
        sessionState.participants.set(socket.id, {
            id: socket.id,
            group: null,
            currentQuestion: 0,
            answers: [],
            finalChoice: null,
            completed: false
        });

        // Notify admin of new participant
        io.to('admin-room').emit('session-update', {
            participantCount: sessionState.participants.size,
            complexCount: sessionState.complexGroup.length,
            simpleCount: sessionState.simpleGroup.length,
            sessionActive: sessionState.sessionActive,
            sessionStarted: sessionState.sessionStarted
        });

        // If session already started, assign to group immediately
        if (sessionState.sessionStarted) {
            assignParticipantToGroup(socket);
        } else {
            socket.emit('waiting', { message: 'Waiting for session to start...' });
        }
    });

    // Admin starts session
    socket.on('start-session', () => {
        console.log('Session started by admin');
        sessionState.sessionActive = true;
        sessionState.sessionStarted = true;

        // Assign all participants to groups
        const participantIds = Array.from(sessionState.participants.keys());

        // Shuffle and split 50/50
        for (let i = participantIds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [participantIds[i], participantIds[j]] = [participantIds[j], participantIds[i]];
        }

        const midpoint = Math.floor(participantIds.length / 2);
        sessionState.complexGroup = participantIds.slice(0, midpoint);
        sessionState.simpleGroup = participantIds.slice(midpoint);

        // Assign groups and send first question
        sessionState.complexGroup.forEach(id => {
            const participant = sessionState.participants.get(id);
            if (participant) {
                participant.group = 'complex';
                const socket = io.sockets.sockets.get(id);
                if (socket) {
                    sendQuestion(socket, participant);
                }
            }
        });

        sessionState.simpleGroup.forEach(id => {
            const participant = sessionState.participants.get(id);
            if (participant) {
                participant.group = 'simple';
                const socket = io.sockets.sockets.get(id);
                if (socket) {
                    sendQuestion(socket, participant);
                }
            }
        });

        // Notify admin
        io.to('admin-room').emit('session-update', {
            participantCount: sessionState.participants.size,
            complexCount: sessionState.complexGroup.length,
            simpleCount: sessionState.simpleGroup.length,
            sessionActive: sessionState.sessionActive,
            sessionStarted: sessionState.sessionStarted
        });
    });

    // Participant submits answer
    socket.on('submit-answer', (data) => {
        const participant = sessionState.participants.get(socket.id);
        if (!participant) return;

        // Record answer
        participant.answers.push({
            question: data.question,
            answer: data.answer,
            correct: data.correct,
            questionNumber: participant.currentQuestion
        });

        participant.currentQuestion++;

        // Check if quiz complete (10 questions)
        if (participant.currentQuestion >= 10) {
            // Send final choice
            socket.emit('show-final-choice');

            // Check if all participants completed quiz
            checkAllQuizzesComplete();
        } else {
            // Send next question
            sendQuestion(socket, participant);
        }
    });

    // Participant makes final choice
    socket.on('submit-final-choice', (data) => {
        const participant = sessionState.participants.get(socket.id);
        if (!participant) return;

        participant.finalChoice = data.choice;
        participant.completed = true;
        sessionState.completedParticipants.add(socket.id);

        // Store result
        sessionState.results.push({
            id: socket.id,
            group: participant.group,
            answers: participant.answers,
            finalChoice: data.choice
        });

        socket.emit('experiment-complete');

        // Update admin
        io.to('admin-room').emit('participant-completed', {
            completed: sessionState.completedParticipants.size,
            total: sessionState.participants.size
        });
    });

    // Admin requests results
    socket.on('get-results', () => {
        // Send results data to admin
        io.to('admin-room').emit('results-data', sessionState.results);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('Disconnected:', socket.id);

        if (sessionState.participants.has(socket.id)) {
            sessionState.participants.delete(socket.id);
            sessionState.complexGroup = sessionState.complexGroup.filter(id => id !== socket.id);
            sessionState.simpleGroup = sessionState.simpleGroup.filter(id => id !== socket.id);

            // Notify admin
            io.to('admin-room').emit('session-update', {
                participantCount: sessionState.participants.size,
                complexCount: sessionState.complexGroup.length,
                simpleCount: sessionState.simpleGroup.length,
                sessionActive: sessionState.sessionActive,
                sessionStarted: sessionState.sessionStarted
            });
        }
    });
});

// Helper: Assign participant to group (for late joiners)
function assignParticipantToGroup(socket) {
    const participant = sessionState.participants.get(socket.id);
    if (!participant) return;

    // Assign to smaller group for balance
    if (sessionState.complexGroup.length <= sessionState.simpleGroup.length) {
        sessionState.complexGroup.push(socket.id);
        participant.group = 'complex';
    } else {
        sessionState.simpleGroup.push(socket.id);
        participant.group = 'simple';
    }

    sendQuestion(socket, participant);

    // Update admin
    io.to('admin-room').emit('session-update', {
        participantCount: sessionState.participants.size,
        complexCount: sessionState.complexGroup.length,
        simpleCount: sessionState.simpleGroup.length,
        sessionActive: sessionState.sessionActive,
        sessionStarted: sessionState.sessionStarted
    });
}

// Helper: Send question to participant
function sendQuestion(socket, participant) {
    const questionData = participant.group === 'complex'
        ? generateComplexQuestion()
        : generateSimpleQuestion();

    socket.emit('question', {
        questionNumber: participant.currentQuestion + 1,
        totalQuestions: 10,
        question: questionData.question,
        options: questionData.options,
        correctAnswer: questionData.correctAnswer,
        group: participant.group
    });
}


// Helper: Check if all participants completed quiz
function checkAllQuizzesComplete() {
    const allComplete = Array.from(sessionState.participants.values())
        .every(p => p.currentQuestion >= 10 || p.completed);

    if (allComplete) {
        io.to('admin-room').emit('all-quizzes-complete');
    }
}

// Start server
server.listen(PORT, HOST, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Admin panel: /admin.html`);
    console.log(`Participant page: /`);
});
