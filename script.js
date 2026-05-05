document.addEventListener('DOMContentLoaded', () => {
    // --- Audio System (Web Audio API) ---
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    let soundEnabled = JSON.parse(localStorage.getItem('blockBlast_soundEnabled') ?? 'true');
    
    function playTone(freq, type, duration, vol) {
        if (!soundEnabled) return;
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    }

    const soundEffects = {
        place: () => playTone(300, 'sine', 0.1, 0.2),
        clear: () => {
            playTone(600, 'sine', 0.2, 0.3);
            setTimeout(() => playTone(800, 'sine', 0.3, 0.3), 50);
        },
        combo: (level) => {
            const baseFreq = 400 + (level * 100);
            playTone(baseFreq, 'triangle', 0.3, 0.4);
            setTimeout(() => playTone(baseFreq * 1.5, 'triangle', 0.4, 0.4), 100);
        },
        invalid: () => playTone(150, 'sawtooth', 0.2, 0.2),
        gameOver: () => {
            playTone(200, 'sawtooth', 0.5, 0.3);
            setTimeout(() => playTone(150, 'sawtooth', 0.8, 0.3), 250);
        }
    };

    // --- Firebase Initialization ---
    const firebaseConfig = {
      apiKey: "AIzaSyDY1pFZWWE8rOWvr_tvDriHItFdRlEyDtA",
      authDomain: "block-blast-62952.firebaseapp.com",
      projectId: "block-blast-62952",
      storageBucket: "block-blast-62952.firebasestorage.app",
      messagingSenderId: "1069191628611",
      appId: "1:1069191628611:web:a9a31ccc366233d9b551f6",
      measurementId: "G-3GZ7M8BBG6"
    };
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    let currentUser = null;

    // --- Game Variables ---
    const gridSize = 8;
    let grid = Array(gridSize).fill().map(() => Array(gridSize).fill(null));
    let score = 0;
    let combo = 0;
    let bestScore = parseInt(localStorage.getItem('blockBlast_bestScore')) || 0;
    let leaderboard = JSON.parse(localStorage.getItem('blockBlast_leaderboard')) || [];
    let currentPieces = [null, null, null];
    let gameOver = false;

    // --- DOM Elements ---
    // UI Screens
    const mainMenu = document.getElementById('main-menu');
    const gameContainer = document.getElementById('game-container');
    
    // Main Menu Elements
    const menuBestScoreDisplay = document.getElementById('menu-best-score-value');
    const btnPlay = document.getElementById('btn-play');
    const btnLeaderboard = document.getElementById('btn-leaderboard');
    const btnTutorial = document.getElementById('btn-tutorial');
    const btnFeedback = document.getElementById('btn-feedback');
    const btnSettings = document.getElementById('btn-settings');
    const btnGoogleLogin = document.getElementById('btn-google-login');
    const btnEmailLogin = document.getElementById('btn-email-login');
    const userInfoContainer = document.getElementById('user-info');
    const userAvatar = document.getElementById('user-avatar');
    const userName = document.getElementById('user-name');
    const btnLogout = document.getElementById('btn-logout');
    const btnEditNickname = document.getElementById('btn-edit-nickname');
    
    // Auth Modal Elements
    const authModal = document.getElementById('auth-modal');
    const authEmail = document.getElementById('auth-email');
    const authPassword = document.getElementById('auth-password');
    const btnAuthLogin = document.getElementById('btn-auth-login');
    const btnAuthSignup = document.getElementById('btn-auth-signup');
    
    // Nickname Modal Elements
    const nicknameModal = document.getElementById('nickname-modal');
    const nicknameInput = document.getElementById('nickname-input');
    const btnSaveNickname = document.getElementById('btn-save-nickname');
    
    // Game Elements
    const gridContainer = document.getElementById('grid-container');
    const piecesContainer = document.getElementById('pieces-container');
    const dragLayer = document.getElementById('drag-layer');
    const scoreDisplay = document.getElementById('score');
    const bestScoreDisplay = document.getElementById('best-score');
    const comboDisplay = document.getElementById('combo-display');
    const btnBackMenu = document.getElementById('btn-back-menu');
    
    // Modals
    const gameOverScreen = document.getElementById('game-over-screen');
    const settingsModal = document.getElementById('settings-modal');
    const leaderboardModal = document.getElementById('leaderboard-modal');
    const tutorialModal = document.getElementById('tutorial-modal');
    const feedbackModal = document.getElementById('feedback-modal');
    const feedbackList = document.getElementById('feedback-list');
    const feedbackInput = document.getElementById('feedback-input');
    const btnSubmitFeedback = document.getElementById('btn-submit-feedback');
    const closeBtns = document.querySelectorAll('.close-modal');
    
    const finalScoreDisplay = document.getElementById('final-score-value');
    const restartBtn = document.getElementById('restart-btn');
    const gameOverMenuBtn = document.getElementById('game-over-menu-btn');
    const leaderboardList = document.getElementById('leaderboard-list');
    
    const toggleSound = document.getElementById('toggle-sound');
    const btnResetData = document.getElementById('btn-reset-data');

    const gridCells = [];

    // --- Piece Definitions ---
    const SHAPES = [
        // 1x1
        { shape: [[1]], colorClass: 'color-cyan' },
        // 2x2
        { shape: [[1,1],[1,1]], colorClass: 'color-purple' },
        // 3x3
        { shape: [[1,1,1],[1,1,1],[1,1,1]], colorClass: 'color-yellow' },
        // L shapes (small)
        { shape: [[1,0],[1,1]], colorClass: 'color-green' },
        { shape: [[0,1],[1,1]], colorClass: 'color-green' },
        { shape: [[1,1],[1,0]], colorClass: 'color-green' },
        { shape: [[1,1],[0,1]], colorClass: 'color-green' },
        // Lines
        { shape: [[1,1]], colorClass: 'color-red' },
        { shape: [[1],[1]], colorClass: 'color-red' },
        { shape: [[1,1,1]], colorClass: 'color-blue' },
        { shape: [[1],[1],[1]], colorClass: 'color-blue' },
        { shape: [[1,1,1,1]], colorClass: 'color-orange' },
        { shape: [[1],[1],[1],[1]], colorClass: 'color-orange' },
        // L shapes (big)
        { shape: [[1,0,0],[1,0,0],[1,1,1]], colorClass: 'color-purple' },
        { shape: [[1,1,1],[1,0,0],[1,0,0]], colorClass: 'color-purple' }
    ];

    // --- Initialization & UI Routing ---
    function init() {
        menuBestScoreDisplay.textContent = bestScore;
        bestScoreDisplay.textContent = bestScore;
        toggleSound.checked = soundEnabled;
        
        const saved = localStorage.getItem('blockBlast_gameState');
        btnPlay.textContent = saved ? 'CONTINUE' : 'PLAY';
        
        createGrid();
        updateLeaderboardUI();
    }

    function showMenu() {
        gameContainer.classList.add('hidden');
        mainMenu.classList.remove('hidden');
        
        menuBestScoreDisplay.textContent = bestScore;
        const saved = localStorage.getItem('blockBlast_gameState');
        btnPlay.textContent = saved ? 'CONTINUE' : 'PLAY';
    }

    function startGame() {
        mainMenu.classList.add('hidden');
        gameContainer.classList.remove('hidden');
        
        const hasSavedGame = loadProgress();
        if (!hasSavedGame) {
            // New game
            gameOver = false;
            score = 0;
            combo = 0;
            scoreDisplay.textContent = '0';
            comboDisplay.style.opacity = 0;
            grid = Array(gridSize).fill().map(() => Array(gridSize).fill(null));
            currentPieces = [null, null, null];
            drawGrid();
            generatePieces();
        } else {
            // Continued game
            gameOver = false;
            drawGrid();
            renderPieces();
            updateScore(0);
            checkGameOver();
        }
    }

    function createGrid() {
        gridContainer.innerHTML = '';
        gridCells.length = 0;
        for (let r = 0; r < gridSize; r++) {
            gridCells[r] = [];
            for (let c = 0; c < gridSize; c++) {
                const cell = document.createElement('div');
                cell.classList.add('cell');
                cell.dataset.row = r;
                cell.dataset.col = c;
                gridContainer.appendChild(cell);
                gridCells[r][c] = cell;
            }
        }
    }

    function drawGrid() {
        for (let r = 0; r < gridSize; r++) {
            for (let c = 0; c < gridSize; c++) {
                const cell = gridCells[r][c];
                cell.className = 'cell'; // reset
                if (grid[r][c]) {
                    cell.classList.add('filled', grid[r][c]);
                }
            }
        }
    }

    function generatePieces() {
        // Find all shapes that can currently be placed on the board
        const fittingShapes = [];
        for (let shapeData of SHAPES) {
            let canFit = false;
            for (let r = 0; r < gridSize; r++) {
                for (let c = 0; c < gridSize; c++) {
                    if (canPlace(shapeData, r, c)) {
                        canFit = true;
                        break;
                    }
                }
                if (canFit) break;
            }
            if (canFit) fittingShapes.push(shapeData);
        }

        // If no shape in the game can fit, just give random ones (will Game Over immediately)
        if (fittingShapes.length === 0) {
            for (let i = 0; i < 3; i++) {
                currentPieces[i] = SHAPES[Math.floor(Math.random() * SHAPES.length)];
            }
        } else {
            // Generate pieces until at least one of them is in fittingShapes
            let hasFitting = false;
            do {
                hasFitting = false;
                for (let i = 0; i < 3; i++) {
                    const randomShape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
                    currentPieces[i] = randomShape;
                    if (fittingShapes.includes(randomShape)) {
                        hasFitting = true;
                    }
                }
            } while (!hasFitting);
        }

        renderPieces();
        saveProgress();
        checkGameOver();
    }

    function renderPieces() {
        piecesContainer.innerHTML = '';
        for (let i = 0; i < 3; i++) {
            const pieceData = currentPieces[i];
            const wrapper = document.createElement('div');
            wrapper.classList.add('piece-wrapper');
            if (pieceData) {
                const pieceEl = createPieceElement(pieceData);
                pieceEl.dataset.index = i;
                makeDraggable(pieceEl, pieceData, i);
                wrapper.appendChild(pieceEl);
            }
            piecesContainer.appendChild(wrapper);
        }
    }

    function createPieceElement(pieceData) {
        const el = document.createElement('div');
        el.classList.add('piece');
        const rows = pieceData.shape.length;
        const cols = pieceData.shape[0].length;
        
        // Base block size for UI container
        const blockSize = 24; 
        el.style.gridTemplateColumns = `repeat(${cols}, ${blockSize}px)`;
        el.style.gridTemplateRows = `repeat(${rows}, ${blockSize}px)`;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (pieceData.shape[r][c]) {
                    const block = document.createElement('div');
                    block.classList.add('piece-block', pieceData.colorClass);
                    block.style.gridRow = r + 1;
                    block.style.gridColumn = c + 1;
                    el.appendChild(block);
                }
            }
        }
        return el;
    }

    // --- Drag and Drop Logic ---
    function makeDraggable(element, pieceData, index) {
        let isDragging = false;
        let clone = null;
        let cellWidth = 0; // Will be calculated based on current grid

        const onDown = (e) => {
            if (e.button !== 0 && e.type === 'mousedown') return;
            e.preventDefault();
            if(gameOver) return;
            
            isDragging = true;
            
            // Get current grid cell size dynamically for scaling the dragged piece
            const firstCellRect = gridCells[0][0].getBoundingClientRect();
            cellWidth = firstCellRect.width;

            // Create clone for dragging
            clone = element.cloneNode(true);
            
            // Apply scale to match board cells
            const rows = pieceData.shape.length;
            const cols = pieceData.shape[0].length;
            clone.style.gridTemplateColumns = `repeat(${cols}, ${cellWidth}px)`;
            clone.style.gridTemplateRows = `repeat(${rows}, ${cellWidth}px)`;
            clone.style.gap = '4px'; // Match grid gap
            
            clone.style.position = 'absolute';
            clone.style.margin = '0';
            clone.style.pointerEvents = 'none'; // let events pass through
            
            dragLayer.appendChild(clone);
            element.classList.add('dragging');

            document.addEventListener('mousemove', onMove, { passive: false });
            document.addEventListener('mouseup', onUp);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onUp);
            
            // Trigger initial move to position clone to pointer immediately
            onMove(e);
        };

        const onMove = (e) => {
            if (!isDragging) return;
            e.preventDefault(); // Prevent scrolling on mobile
            
            const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
            const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

            const rows = pieceData.shape.length;
            const cols = pieceData.shape[0].length;
            const cloneWidth = cols * cellWidth + (cols - 1) * 4;
            const cloneHeight = rows * cellWidth + (rows - 1) * 4;

            // Apply touch offset so block is visible above finger
            const touchOffset = e.type.includes('touch') ? -(cloneHeight / 2 + 40) : 0;

            clone.style.left = `${clientX - cloneWidth / 2}px`;
            clone.style.top = `${clientY - cloneHeight / 2 + touchOffset}px`;

            // Hover preview
            clearPreviews();
            const pos = getGridPosition(clone, pieceData);
            if (pos && canPlace(pieceData, pos.row, pos.col)) {
                showPreview(pieceData, pos.row, pos.col);
            }
        };

        const onUp = (e) => {
            if (!isDragging) return;
            isDragging = false;
            
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onUp);

            element.classList.remove('dragging');
            
            const pos = getGridPosition(clone, pieceData);
            dragLayer.innerHTML = '';
            clearPreviews();

            if (pos && canPlace(pieceData, pos.row, pos.col)) {
                placePiece(pieceData, pos.row, pos.col, index);
            } else {
                soundEffects.invalid();
            }
        };

        element.addEventListener('mousedown', onDown);
        element.addEventListener('touchstart', onDown, { passive: false });
    }

    function getGridPosition(cloneElement, pieceData) {
        const cloneRect = cloneElement.getBoundingClientRect();
        
        const firstCellRect = gridCells[0][0].getBoundingClientRect();
        const secondCellX = gridCells[0][1] ? gridCells[0][1].getBoundingClientRect().left : firstCellRect.left + firstCellRect.width + 4;
        const secondCellY = gridCells[1][0] ? gridCells[1][0].getBoundingClientRect().top : firstCellRect.top + firstCellRect.height + 4;
        
        const colPitch = secondCellX - firstCellRect.left;
        const rowPitch = secondCellY - firstCellRect.top;
        
        const relX = cloneRect.left - firstCellRect.left;
        const relY = cloneRect.top - firstCellRect.top;

        const col = Math.round(relX / colPitch);
        const row = Math.round(relY / rowPitch);

        if (row >= -2 && row <= gridSize && col >= -2 && col <= gridSize) {
             return { row, col };
        }
        return null;
    }

    function canPlace(pieceData, startRow, startCol) {
        const { shape } = pieceData;
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[0].length; c++) {
                if (shape[r][c]) {
                    const gridR = startRow + r;
                    const gridC = startCol + c;
                    if (gridR < 0 || gridR >= gridSize || gridC < 0 || gridC >= gridSize) {
                        return false; // Out of bounds
                    }
                    if (grid[gridR][gridC]) {
                        return false; // Overlap
                    }
                }
            }
        }
        return true;
    }

    function showPreview(pieceData, startRow, startCol) {
        const { shape } = pieceData;
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[0].length; c++) {
                if (shape[r][c]) {
                    const gridR = startRow + r;
                    const gridC = startCol + c;
                    if(gridR >= 0 && gridR < gridSize && gridC >=0 && gridC < gridSize) {
                        gridCells[gridR][gridC].classList.add('preview');
                    }
                }
            }
        }
    }

    function clearPreviews() {
        for (let r = 0; r < gridSize; r++) {
            for (let c = 0; c < gridSize; c++) {
                gridCells[r][c].classList.remove('preview');
            }
        }
    }

    // --- Game Logic ---
    function placePiece(pieceData, startRow, startCol, index) {
        soundEffects.place();
        const { shape, colorClass } = pieceData;
        let blocksPlaced = 0;
        
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[0].length; c++) {
                if (shape[r][c]) {
                    grid[startRow + r][startCol + c] = colorClass;
                    blocksPlaced++;
                }
            }
        }

        currentPieces[index] = null;
        updateScore(blocksPlaced); // base score for placing blocks
        drawGrid();
        
        const isClearing = checkLines();

        if (!isClearing) {
            if (!currentPieces.some(p => p !== null)) {
                generatePieces();
            } else {
                renderPieces();
                saveProgress();
                checkGameOver();
            }
        }
    }

    function checkLines() {
        let linesToClearRow = [];
        let linesToClearCol = [];

        // Check rows
        for (let r = 0; r < gridSize; r++) {
            if (grid[r].every(cell => cell !== null)) {
                linesToClearRow.push(r);
            }
        }

        // Check cols
        for (let c = 0; c < gridSize; c++) {
            let colFull = true;
            for (let r = 0; r < gridSize; r++) {
                if (grid[r][c] === null) {
                    colFull = false;
                    break;
                }
            }
            if (colFull) {
                linesToClearCol.push(c);
            }
        }

        const totalLines = linesToClearRow.length + linesToClearCol.length;

        if (totalLines > 0) {
            combo++;
            let points = totalLines * 10 * combo; // Combo multiplier
            updateScore(points);
            
            if (combo > 1) {
                soundEffects.combo(combo);
                showComboText(combo);
            } else {
                soundEffects.clear();
            }

            // Animate and clear
            linesToClearRow.forEach(r => {
                for(let c=0; c<gridSize; c++) gridCells[r][c].classList.add('clearing');
            });
            linesToClearCol.forEach(c => {
                for(let r=0; r<gridSize; r++) gridCells[r][c].classList.add('clearing');
            });

            setTimeout(() => {
                linesToClearRow.forEach(r => {
                    for(let c=0; c<gridSize; c++) {
                        grid[r][c] = null;
                        gridCells[r][c].classList.remove('clearing');
                    }
                });
                linesToClearCol.forEach(c => {
                    for(let r=0; r<gridSize; r++) {
                        grid[r][c] = null;
                        gridCells[r][c].classList.remove('clearing');
                    }
                });
                drawGrid();
                
                if (!currentPieces.some(p => p !== null)) {
                    generatePieces();
                } else {
                    renderPieces();
                    saveProgress();
                    checkGameOver();
                }
            }, 300);

            return true;
        } else {
            combo = 0;
            return false;
        }
    }

    function showComboText(comboCount) {
        comboDisplay.textContent = `COMBO x${comboCount}!`;
        comboDisplay.style.opacity = 1;
        comboDisplay.style.transform = 'scale(1.2)';
        
        setTimeout(() => {
            comboDisplay.style.transform = 'scale(1)';
        }, 100);

        setTimeout(() => {
            comboDisplay.style.opacity = 0;
        }, 1500);
    }

    function checkGameOver() {
        if (gameOver) return;
        
        // Find if any current piece can be placed anywhere
        let canPlay = false;
        
        for (let i = 0; i < 3; i++) {
            const piece = currentPieces[i];
            if (!piece) continue;
            
            for (let r = 0; r < gridSize; r++) {
                for (let c = 0; c < gridSize; c++) {
                    if (canPlace(piece, r, c)) {
                        canPlay = true;
                        // Un-dim the piece if it was previously dim
                        const wrapper = piecesContainer.children[i];
                        if(wrapper) wrapper.classList.remove('inactive');
                        break;
                    }
                }
                if (canPlay) break;
            }
            
            if (!canPlay) {
                // Dim the piece to show it can't be played right now
                const wrapper = piecesContainer.children[i];
                if(wrapper) wrapper.classList.add('inactive');
            } else {
                 canPlay = true; // Overall we have at least one valid piece
            }
        }

        // We must re-evaluate all pieces, so do a separate check to see if NONE can be placed
        let anyPlayable = currentPieces.some(piece => {
            if(!piece) return false;
            for (let r = 0; r < gridSize; r++) {
                for (let c = 0; c < gridSize; c++) {
                    if(canPlace(piece, r, c)) return true;
                }
            }
            return false;
        });


        if (!anyPlayable && currentPieces.some(p => p !== null)) {
            gameOver = true;
            soundEffects.gameOver();
            showGameOver();
        }
    }

    function updateScore(points) {
        score += points;
        scoreDisplay.textContent = score;
        if (score > bestScore) {
            bestScore = score;
            bestScoreDisplay.textContent = bestScore;
            menuBestScoreDisplay.textContent = bestScore;
            localStorage.setItem('blockBlast_bestScore', bestScore);
            queueCloudSync();
        }
    }

    // --- Cloud Sync System ---
    async function syncToCloud() {
        if (!currentUser) return;
        const stateStr = localStorage.getItem('blockBlast_gameState');
        const state = stateStr ? JSON.parse(stateStr) : null;
        try {
            await db.collection('users').doc(currentUser.uid).set({
                bestScore: bestScore,
                gameState: state,
                nickname: currentUser.nickname || userName.textContent,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch(e) {
            console.error("Error syncing to cloud", e);
        }
    }

    let syncTimeout = null;
    function queueCloudSync(immediate = false) {
        if (!currentUser) return;
        if (immediate) {
            if(syncTimeout) clearTimeout(syncTimeout);
            syncToCloud();
        } else {
            if (syncTimeout) clearTimeout(syncTimeout);
            syncTimeout = setTimeout(syncToCloud, 2000);
        }
    }

    async function syncFromCloud() {
        if (!currentUser) return;
        try {
            const doc = await db.collection('users').doc(currentUser.uid).get();
            let nickname = currentUser.displayName || currentUser.email.split('@')[0];
            
            if (doc.exists) {
                const cloudData = doc.data();
                
                if (cloudData.nickname) {
                    nickname = cloudData.nickname;
                } else {
                    db.collection('users').doc(currentUser.uid).set({ nickname: nickname }, { merge: true });
                }
                userName.textContent = nickname;
                currentUser.nickname = nickname;
                
                if (cloudData.bestScore > bestScore) {
                    bestScore = cloudData.bestScore;
                    bestScoreDisplay.textContent = bestScore;
                    menuBestScoreDisplay.textContent = bestScore;
                    localStorage.setItem('blockBlast_bestScore', bestScore);
                }

                if (cloudData.gameState && !gameOver) {
                    const localStateStr = localStorage.getItem('blockBlast_gameState');
                    const localState = localStateStr ? JSON.parse(localStateStr) : null;
                    const localScore = localState ? localState.score : -1;
                    
                    if (!localState || cloudData.gameState.score > localScore) {
                        localStorage.setItem('blockBlast_gameState', JSON.stringify(cloudData.gameState));
                        btnPlay.textContent = 'CONTINUE';
                        
                        if (!gameContainer.classList.contains('hidden')) {
                            loadProgress();
                            drawGrid();
                            renderPieces();
                            updateScore(0);
                        }
                    }
                }
            }
        } catch(e) {
            console.error("Error syncing from cloud", e);
        }
    }

    // --- Save/Load System ---
    function saveProgress() {
        if (gameOver) return; // don't save game over state as active game
        const state = {
            grid: grid,
            score: score,
            combo: combo,
            pieces: currentPieces
        };
        localStorage.setItem('blockBlast_gameState', JSON.stringify(state));
        queueCloudSync();
    }

    function loadProgress() {
        const saved = localStorage.getItem('blockBlast_gameState');
        if (saved) {
            try {
                const state = JSON.parse(saved);
                grid = state.grid;
                score = state.score;
                combo = state.combo || 0;
                currentPieces = state.pieces;
                return true;
            } catch(e) {
                console.error('Save file corrupted', e);
                clearSave();
                return false;
            }
        }
        return false;
    }

    function clearSave() {
        localStorage.removeItem('blockBlast_gameState');
        queueCloudSync(true);
    }

    // --- Leaderboard System ---
    function updateLeaderboard(finalScore) {
        // Local leaderboard array is deprecated in favor of Global Leaderboard
    }

    let leaderboardUnsubscribe = null;

    function updateLeaderboardUI() {
        if (!leaderboardUnsubscribe) {
            const loadingStr = '<li style="justify-content:center; color:#00eeff; font-size:16px; border:none;">Loading scores...</li>';
            leaderboardList.innerHTML = loadingStr;
            
            try {
                leaderboardUnsubscribe = db.collection('users')
                    .orderBy('bestScore', 'desc')
                    .limit(10)
                    .onSnapshot(snapshot => {
                        leaderboardList.innerHTML = '';
                        
                        if (snapshot.empty) {
                            leaderboardList.innerHTML = '<li style="justify-content:center;">No scores yet!</li>';
                            return;
                        }
                        
                        let rank = 1;
                        snapshot.forEach(doc => {
                            const data = doc.data();
                            const score = data.bestScore || 0;
                            const name = data.nickname || 'Unknown Player';
                            
                            const li = document.createElement('li');
                            if (currentUser && doc.id === currentUser.uid) {
                                li.classList.add('highlight-row');
                            }
                            
                            li.innerHTML = `
                                <span style="display:flex; align-items:center; gap:10px;">
                                    <span style="color:#aaa; width:30px;">#${rank}</span> 
                                    <span style="font-weight:bold; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${name}</span>
                                </span> 
                                <span style="color:#00eeff; font-weight:900;">${score}</span>
                            `;
                            leaderboardList.appendChild(li);
                            rank++;
                        });
                    }, e => {
                        console.error("Error fetching leaderboard", e);
                        leaderboardList.innerHTML = '<li style="justify-content:center; color:#ff003c; border:none;">Error loading scores.</li>';
                    });
            } catch(e) {
                console.error("Error setting up leaderboard listener", e);
            }
        }
    }

    function showGameOver() {
        finalScoreDisplay.textContent = score;
        gameOverScreen.classList.remove('hidden');
        clearSave(); // Game over means start fresh next time
    }

    // --- Event Listeners ---
    
    // UI Navigation
    btnPlay.addEventListener('click', startGame);
    
    btnBackMenu.addEventListener('click', () => {
        saveProgress();
        queueCloudSync(true);
        showMenu();
    });

    gameOverMenuBtn.addEventListener('click', () => {
        gameOverScreen.classList.add('hidden');
        showMenu();
    });

    restartBtn.addEventListener('click', () => {
        clearSave();
        gameOverScreen.classList.add('hidden');
        startGame(); // Since no save, it will start a fresh game
    });

    // Modals
    btnSettings.addEventListener('click', () => settingsModal.classList.remove('hidden'));
    btnLeaderboard.addEventListener('click', () => {
        updateLeaderboardUI();
        leaderboardModal.classList.remove('hidden');
    });

    let feedbackUnsubscribe = null;
    btnFeedback.addEventListener('click', () => {
        feedbackModal.classList.remove('hidden');
        if (!feedbackUnsubscribe) {
            feedbackList.innerHTML = '<li style="text-align:center; color:#aaa;">Loading messages...</li>';
            feedbackUnsubscribe = db.collection('messages')
                .orderBy('timestamp', 'desc')
                .limit(30)
                .onSnapshot(snapshot => {
                    feedbackList.innerHTML = '';
                    if (snapshot.empty) {
                        feedbackList.innerHTML = '<li style="text-align:center; color:#aaa;">No messages yet. Be the first!</li>';
                        return;
                    }
                    snapshot.forEach(doc => {
                        const data = doc.data();
                        const li = document.createElement('li');
                        li.className = 'feedback-item';
                        
                        let dateStr = '';
                        if (data.timestamp) {
                            const d = data.timestamp.toDate();
                            dateStr = `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                        }
                        
                        li.innerHTML = `
                            <div class="feedback-header">
                                <span class="feedback-author"></span>
                                <span>${dateStr}</span>
                            </div>
                            <div class="feedback-text"></div>
                        `;
                        li.querySelector('.feedback-author').textContent = data.nickname || 'Unknown';
                        li.querySelector('.feedback-text').textContent = data.text;
                        feedbackList.appendChild(li);
                    });
                }, error => {
                    console.error("Error loading messages", error);
                    feedbackList.innerHTML = '<li style="text-align:center; color:#ff003c;">Error loading messages.</li>';
                });
        }
    });

    btnSubmitFeedback.addEventListener('click', () => {
        if (!currentUser) {
            alert("⚠️ 請先登入 (使用 Google 或 Email) 才能留言！");
            return;
        }
        const text = feedbackInput.value.trim();
        if (!text) return;

        const nickname = currentUser.nickname || userName.textContent;

        db.collection('messages').add({
            nickname: nickname,
            text: text,
            uid: currentUser.uid,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            feedbackInput.value = '';
        }).catch(error => {
            console.error("Error adding message", error);
            alert("Failed to send message: " + error.message);
        });
    });

    btnTutorial.addEventListener('click', () => tutorialModal.classList.remove('hidden'));

    closeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.target.dataset.target;
            document.getElementById(targetId).classList.add('hidden');
        });
    });

    // Settings logic
    toggleSound.addEventListener('change', (e) => {
        soundEnabled = e.target.checked;
        localStorage.setItem('blockBlast_soundEnabled', JSON.stringify(soundEnabled));
    });

    btnResetData.addEventListener('click', () => {
        if(confirm('Are you sure you want to reset all progress and high scores? This cannot be undone.')) {
            localStorage.removeItem('blockBlast_gameState');
            localStorage.removeItem('blockBlast_bestScore');
            bestScore = 0;
            score = 0;
            combo = 0;
            menuBestScoreDisplay.textContent = '0';
            bestScoreDisplay.textContent = '0';
            btnPlay.textContent = 'PLAY';
            settingsModal.classList.add('hidden');
            queueCloudSync(true);
            alert('Data reset successfully.');
        }
    });

    // Nickname Events
    btnEditNickname.addEventListener('click', () => {
        if (!currentUser) return;
        nicknameInput.value = currentUser.nickname || userName.textContent;
        nicknameModal.classList.remove('hidden');
    });

    btnSaveNickname.addEventListener('click', () => {
        if (!currentUser) return;
        const newNick = nicknameInput.value.trim();
        if (newNick.length > 0) {
            db.collection('users').doc(currentUser.uid).set({ nickname: newNick }, { merge: true })
                .then(() => {
                    currentUser.nickname = newNick;
                    userName.textContent = newNick;
                    nicknameModal.classList.add('hidden');
                    // Force refresh leaderboard if it's open
                    if (!leaderboardModal.classList.contains('hidden')) {
                        updateLeaderboardUI();
                    }
                })
                .catch(e => {
                    console.error("Failed to save nickname", e);
                    alert("Failed to save nickname.");
                });
        }
    });

    // Firebase Auth Events
    btnGoogleLogin.addEventListener('click', () => {
        if (window.location.protocol === 'file:') {
            alert('⚠️ Google 登入無法在直接開啟檔案 (file:///) 的情況下使用。\n\n請使用本地伺服器 (例如 VS Code 的 Live Server 或 python -m http.server) 來執行此網頁 (http://localhost...)。');
            return;
        }
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(error => {
            console.error("Login failed", error);
            alert("Login failed: " + error.message);
        });
    });

    btnEmailLogin.addEventListener('click', () => {
        authModal.classList.remove('hidden');
    });

    btnAuthLogin.addEventListener('click', () => {
        const email = authEmail.value;
        const password = authPassword.value;
        if (!email || !password) return alert("Please enter email and password.");
        auth.signInWithEmailAndPassword(email, password)
            .then(() => {
                authModal.classList.add('hidden');
                authEmail.value = '';
                authPassword.value = '';
            })
            .catch(error => {
                console.error(error);
                alert("Login Failed: " + error.message);
            });
    });

    btnAuthSignup.addEventListener('click', () => {
        const email = authEmail.value;
        const password = authPassword.value;
        if (!email || !password) return alert("Please enter email and password.");
        auth.createUserWithEmailAndPassword(email, password)
            .then(() => {
                authModal.classList.add('hidden');
                authEmail.value = '';
                authPassword.value = '';
                alert("Account created and logged in!");
            })
            .catch(error => {
                console.error(error);
                alert("Signup Failed: " + error.message);
            });
    });

    btnLogout.addEventListener('click', () => {
        auth.signOut();
    });

    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            btnGoogleLogin.classList.add('hidden');
            btnEmailLogin.classList.add('hidden');
            userInfoContainer.classList.remove('hidden');
            userAvatar.src = user.photoURL || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';
            userName.textContent = user.displayName || user.email;
            syncFromCloud();
        } else {
            currentUser = null;
            btnGoogleLogin.classList.remove('hidden');
            btnEmailLogin.classList.remove('hidden');
            userInfoContainer.classList.add('hidden');
        }
    });

    // Start App
    init();
});
