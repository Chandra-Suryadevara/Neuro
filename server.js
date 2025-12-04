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

// Experiment logs (stores completed experiments)
let experimentLogs = [];
let currentExperimentId = 1;

// Generate complex math question (algebra, calculus)
function generateComplexQuestion() {
    const questionTypes = ['quadratic', 'derivative', 'algebraic', 'exponent', 'equation'];
    const type = questionTypes[Math.floor(Math.random() * questionTypes.length)];

    let question, answer, options;

    if (type === 'quadratic') {
        // Solve: x² + bx + c = 0, find x
        const a = Math.floor(Math.random() * 3) + 1;
        const b = Math.floor(Math.random() * 10) - 5;
        const c = Math.floor(Math.random() * 10) - 5;

        // Using quadratic formula: x = (-b ± √(b²-4ac)) / 2a
        const discriminant = b * b - 4 * a * c;

        if (discriminant >= 0) {
            const x1 = Math.round((-b + Math.sqrt(discriminant)) / (2 * a));
            const x2 = Math.round((-b - Math.sqrt(discriminant)) / (2 * a));
            answer = Math.max(x1, x2); // Take positive root
            question = `Solve for x: ${a}x² ${b >= 0 ? '+' : ''}${b}x ${c >= 0 ? '+' : ''}${c} = 0`;
        } else {
            // Fallback to simpler quadratic
            answer = 3;
            question = `Solve for x: x² - 9 = 0`;
        }

    } else if (type === 'derivative') {
        // Derivative of x^n
        const n = Math.floor(Math.random() * 5) + 2;
        const x = Math.floor(Math.random() * 4) + 1;
        answer = n * Math.pow(x, n - 1);
        question = `If f(x) = x^${n}, what is f'(${x})?`;

    } else if (type === 'algebraic') {
        // Solve: ax + b = c
        const a = Math.floor(Math.random() * 8) + 2;
        const b = Math.floor(Math.random() * 20) - 10;
        const c = Math.floor(Math.random() * 30) + 10;
        answer = Math.round((c - b) / a);
        question = `Solve for x: ${a}x ${b >= 0 ? '+' : ''}${b} = ${c}`;

    } else if (type === 'exponent') {
        // 2^x = value, solve for x
        const x = Math.floor(Math.random() * 6) + 2;
        const value = Math.pow(2, x);
        answer = x;
        question = `Solve for x: 2^x = ${value}`;

    } else {
        // System of equations simplified
        const x = Math.floor(Math.random() * 5) + 1;
        const y = Math.floor(Math.random() * 5) + 1;
        const sum = x + y;
        answer = x;
        question = `If x + y = ${sum} and y = ${y}, what is x?`;
    }

    // Generate 3 wrong answers close to the correct one
    options = [answer];
    const used = new Set([answer]);

    while (options.length < 4) {
        let wrong;
        if (Math.random() < 0.5) {
            wrong = answer + Math.floor(Math.random() * 8) - 4;
        } else {
            wrong = Math.round(answer * (0.5 + Math.random()));
        }

        if (!used.has(wrong) && wrong !== answer && wrong > -20 && wrong < 100) {
            options.push(wrong);
            used.add(wrong);
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
        if (!participant) {
            console.log('Submit answer - participant not found:', socket.id);
            return;
        }

        console.log(`Participant ${socket.id} submitted answer for question ${participant.currentQuestion + 1}`);

        // Record answer
        participant.answers.push({
            question: data.question,
            answer: data.answer,
            correct: data.correct,
            questionNumber: participant.currentQuestion + 1 // Store actual question number
        });

        participant.currentQuestion++;

        // Check if quiz complete (5 questions)
        if (participant.currentQuestion >= 5) {
            console.log(`Participant ${socket.id} completed quiz, sending final choice`);
            // Send final choice
            socket.emit('show-final-choice');

            // Check if all participants completed quiz
            setTimeout(() => {
                checkAllQuizzesComplete();
            }, 100); // Small delay to ensure state is consistent
        } else {
            console.log(`Sending question ${participant.currentQuestion + 1} to ${socket.id}`);
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

    // Admin resets session
    socket.on('reset-session', () => {
        console.log('Session reset by admin');

        // Save current experiment to logs if there are results
        if (sessionState.results.length > 0) {
            experimentLogs.push({
                experimentId: currentExperimentId++,
                timestamp: new Date().toISOString(),
                participantCount: sessionState.participants.size,
                complexGroupSize: sessionState.complexGroup.length,
                simpleGroupSize: sessionState.simpleGroup.length,
                results: sessionState.results
            });
        }

        // Disconnect all participants
        sessionState.participants.forEach((participant, socketId) => {
            const participantSocket = io.sockets.sockets.get(socketId);
            if (participantSocket) {
                participantSocket.emit('session-ended');
                participantSocket.disconnect(true);
            }
        });

        // Reset session state
        sessionState = {
            participants: new Map(),
            sessionActive: false,
            sessionStarted: false,
            complexGroup: [],
            simpleGroup: [],
            completedParticipants: new Set(),
            results: []
        };

        // Notify admin
        io.to('admin-room').emit('session-reset');
        io.to('admin-room').emit('session-update', {
            participantCount: 0,
            complexCount: 0,
            simpleCount: 0,
            sessionActive: false,
            sessionStarted: false
        });
    });

    // Admin stops experiment
    socket.on('stop-experiment', () => {
        console.log('Experiment stopped by admin');

        // Save partial results
        if (sessionState.results.length > 0 || sessionState.participants.size > 0) {
            experimentLogs.push({
                experimentId: currentExperimentId++,
                timestamp: new Date().toISOString(),
                status: 'stopped',
                participantCount: sessionState.participants.size,
                complexGroupSize: sessionState.complexGroup.length,
                simpleGroupSize: sessionState.simpleGroup.length,
                results: sessionState.results
            });
        }

        // Notify all participants
        io.emit('session-ended');

        // Reset session
        sessionState.participants.forEach((participant, socketId) => {
            const participantSocket = io.sockets.sockets.get(socketId);
            if (participantSocket) {
                participantSocket.disconnect(true);
            }
        });

        sessionState = {
            participants: new Map(),
            sessionActive: false,
            sessionStarted: false,
            complexGroup: [],
            simpleGroup: [],
            completedParticipants: new Set(),
            results: []
        };

        io.to('admin-room').emit('session-reset');
        io.to('admin-room').emit('session-update', {
            participantCount: 0,
            complexCount: 0,
            simpleCount: 0,
            sessionActive: false,
            sessionStarted: false
        });
    });

    // Admin requests experiment logs
    socket.on('get-logs', () => {
        io.to('admin-room').emit('experiment-logs', experimentLogs);
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
    if (!participant || !participant.group) {
        console.log('Cannot send question - invalid participant');
        return;
    }

    const questionData = participant.group === 'complex'
        ? generateComplexQuestion()
        : generateSimpleQuestion();

    console.log(`Sending question ${participant.currentQuestion + 1}/5 to ${socket.id} (${participant.group} group)`);

    socket.emit('question', {
        questionNumber: participant.currentQuestion + 1,
        totalQuestions: 5,
        question: questionData.question,
        options: questionData.options,
        correctAnswer: questionData.correctAnswer,
        group: participant.group
    });
}


// Helper: Check if all participants completed quiz
function checkAllQuizzesComplete() {
    const participants = Array.from(sessionState.participants.values());
    const total = participants.length;
    const completed = participants.filter(p => p.currentQuestion >= 5 || p.completed).length;

    console.log(`Quiz completion check: ${completed}/${total} participants completed`);

    const allComplete = participants.every(p => p.currentQuestion >= 5 || p.completed);

    if (allComplete && total > 0) {
        console.log('All participants completed quiz!');
        io.to('admin-room').emit('all-quizzes-complete');
    }
}

// Start server
server.listen(PORT, HOST, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Admin panel: /admin.html`);
    console.log(`Participant page: /`);
});
