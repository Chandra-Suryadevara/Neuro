const socket = io();

// Elements
const totalParticipants = document.getElementById('total-participants');
const complexCount = document.getElementById('complex-count');
const simpleCount = document.getElementById('simple-count');
const startBtn = document.getElementById('start-btn');
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const controlHint = document.getElementById('control-hint');
const completionRatio = document.getElementById('completion-ratio');
const progressFill = document.getElementById('progress-fill');
const sessionInfo = document.getElementById('session-info');
const sessionStatus = document.getElementById('session-status');
const resultsSection = document.getElementById('results-section');

let sessionData = {
    participantCount: 0,
    complexCount: 0,
    simpleCount: 0,
    sessionActive: false,
    sessionStarted: false,
    completedCount: 0
};

let complexChart = null;
let simpleChart = null;
let resultsData = {
    complex: { risky: 0, safe: 0 },
    simple: { risky: 0, safe: 0 }
};

// Connect as admin
socket.emit('admin-join');

// Update UI with session data
socket.on('session-update', (data) => {
    console.log('Session update:', data);
    sessionData = { ...sessionData, ...data };
    updateUI();
});

// Listen for participant completion
socket.on('participant-completed', (data) => {
    sessionData.completedCount = data.completed;
    updateProgress();
});

// Listen for all quizzes complete
socket.on('all-quizzes-complete', () => {
    sessionStatus.textContent = 'All Quizzes Complete!';
    controlHint.textContent = 'All participants have completed the quiz';

    // Request results data
    socket.emit('get-results');
});

// Listen for results data
socket.on('results-data', (data) => {
    console.log('Results data:', data);
    processResults(data);
    showResults();
});

// Start session
startBtn.addEventListener('click', () => {
    if (!sessionData.sessionStarted && sessionData.participantCount > 0) {
        socket.emit('start-session');
        startBtn.disabled = true;
        startBtn.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-text">Session Active</span>';
        controlHint.textContent = 'Experiment in progress...';
        statusBadge.classList.add('active');
        statusText.textContent = 'Active';
        sessionInfo.classList.remove('hidden');
    } else if (sessionData.participantCount === 0) {
        controlHint.textContent = 'Waiting for participants to join...';
        animateHint();
    }
});

// Update UI
function updateUI() {
    // Animate count changes
    animateCount(totalParticipants, sessionData.participantCount);
    animateCount(complexCount, sessionData.complexCount);
    animateCount(simpleCount, sessionData.simpleCount);

    // Update button state
    if (sessionData.sessionStarted) {
        startBtn.disabled = true;
        startBtn.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-text">Session Active</span>';
        statusBadge.classList.add('active');
        statusText.textContent = 'Active';
        sessionInfo.classList.remove('hidden');
    } else if (sessionData.participantCount > 0) {
        startBtn.disabled = false;
        controlHint.textContent = `Ready to start with ${sessionData.participantCount} participant${sessionData.participantCount > 1 ? 's' : ''}`;
    } else {
        startBtn.disabled = true;
        controlHint.textContent = 'Waiting for participants to join...';
    }

    updateProgress();
}

// Update progress
function updateProgress() {
    const total = sessionData.participantCount;
    const completed = sessionData.completedCount || 0;

    completionRatio.textContent = `${completed}/${total}`;

    if (total > 0) {
        const percentage = (completed / total) * 100;
        progressFill.style.width = percentage + '%';

        // If all completed, request results
        if (completed === total && total > 0 && sessionData.sessionStarted) {
            setTimeout(() => {
                socket.emit('get-results');
            }, 500);
        }
    } else {
        progressFill.style.width = '0%';
    }
}

// Process results
function processResults(results) {
    resultsData = {
        complex: { risky: 0, safe: 0 },
        simple: { risky: 0, safe: 0 }
    };

    results.forEach(result => {
        const group = result.group;
        const choice = result.finalChoice;

        if (group === 'complex') {
            if (choice === '100-risky') {
                resultsData.complex.risky++;
            } else {
                resultsData.complex.safe++;
            }
        } else if (group === 'simple') {
            if (choice === '100-risky') {
                resultsData.simple.risky++;
            } else {
                resultsData.simple.safe++;
            }
        }
    });

    updateCharts();
}

// Update charts
function updateCharts() {
    const complexTotal = resultsData.complex.risky + resultsData.complex.safe;
    const simpleTotal = resultsData.simple.risky + resultsData.simple.safe;

    // Calculate percentages
    const complexRiskyPct = complexTotal > 0 ? (resultsData.complex.risky / complexTotal * 100).toFixed(1) : 0;
    const complexSafePct = complexTotal > 0 ? (resultsData.complex.safe / complexTotal * 100).toFixed(1) : 0;
    const simpleRiskyPct = simpleTotal > 0 ? (resultsData.simple.risky / simpleTotal * 100).toFixed(1) : 0;
    const simpleSafePct = simpleTotal > 0 ? (resultsData.simple.safe / simpleTotal * 100).toFixed(1) : 0;

    // Update stats
    document.getElementById('complex-risky').textContent = `${complexRiskyPct}%`;
    document.getElementById('complex-safe').textContent = `${complexSafePct}%`;
    document.getElementById('simple-risky').textContent = `${simpleRiskyPct}%`;
    document.getElementById('simple-safe').textContent = `${simpleSafePct}%`;

    // Create/update complex chart
    const complexCtx = document.getElementById('complex-chart').getContext('2d');
    if (complexChart) {
        complexChart.destroy();
    }

    complexChart = new Chart(complexCtx, {
        type: 'doughnut',
        data: {
            labels: ['Risky ($100 - 20%)', 'Safe ($20 - 100%)'],
            datasets: [{
                data: [resultsData.complex.risky, resultsData.complex.safe],
                backgroundColor: [
                    'rgba(244, 92, 67, 0.8)',
                    'rgba(56, 239, 125, 0.8)'
                ],
                borderColor: [
                    'rgba(244, 92, 67, 1)',
                    'rgba(56, 239, 125, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#ffffff',
                        padding: 15,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });

    // Create/update simple chart
    const simpleCtx = document.getElementById('simple-chart').getContext('2d');
    if (simpleChart) {
        simpleChart.destroy();
    }

    simpleChart = new Chart(simpleCtx, {
        type: 'doughnut',
        data: {
            labels: ['Risky ($100 - 20%)', 'Safe ($20 - 100%)'],
            datasets: [{
                data: [resultsData.simple.risky, resultsData.simple.safe],
                backgroundColor: [
                    'rgba(244, 92, 67, 0.8)',
                    'rgba(56, 239, 125, 0.8)'
                ],
                borderColor: [
                    'rgba(244, 92, 67, 1)',
                    'rgba(56, 239, 125, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#ffffff',
                        padding: 15,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Show results
function showResults() {
    resultsSection.classList.remove('hidden');
    setTimeout(() => {
        resultsSection.classList.add('visible');
    }, 100);
}

// Animate count
function animateCount(element, newValue) {
    const currentValue = parseInt(element.textContent) || 0;
    if (currentValue !== newValue) {
        element.style.animation = 'none';
        setTimeout(() => {
            element.textContent = newValue;
            element.style.animation = 'countUp 0.5s ease';
        }, 10);
    }
}

// Animate hint
function animateHint() {
    controlHint.style.animation = 'none';
    setTimeout(() => {
        controlHint.style.animation = 'shake 0.5s ease';
    }, 10);
}

// Add shake animation to CSS dynamically
const style = document.createElement('style');
style.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-5px); }
        75% { transform: translateX(5px); }
    }
`;
document.head.appendChild(style);

// Handle disconnection
socket.on('disconnect', () => {
    console.log('Disconnected from server');
    statusText.textContent = 'Disconnected';
    statusBadge.classList.remove('active');
});

socket.on('connect', () => {
    console.log('Connected to server');
    statusText.textContent = sessionData.sessionActive ? 'Active' : 'Ready';
});
