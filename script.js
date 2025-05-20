document.addEventListener('DOMContentLoaded', function() {

    // --- Game Configuration & State ---
    const boardSize = 7;
    const totalSquares = boardSize * boardSize; // 49
    const numberOneSquareIndex = 42; // Bottom-left goal (Row 1, Col a)
    const numberTwoSquareIndex = 6;  // Top-right goal (Row 7, Col g)
    const initialWhiteTokenIndex = 18; // Default starting pos (Row 5, Col e - 0-indexed: row 2, col 4)

    let gameBoardElement;
    let currentWhiteTokenIndex;
    let gameActive; // true if a game is ongoing and board moves are allowed
    let moveCount;

    // let moveHistory = []; // No longer strictly needed for table loading, cells store state
    let movesTableBody;
    let jogoModuleInstance = null;

    // DOM element references
    let aiButton;
    let messageOutput; // For general status/error messages (decode-message)
    let gameEndMessageElement; // For game win/loss messages from a live game
    let encodedOutputDiv;
    let decodeInputElement;
    let newGameButtonElement;
    let movesTableElement; // Reference to the <table> element
    let gameValueSlider;
    let currentSliderValueDisplay;
    let gameModeRadios; // Will hold the NodeList of radio buttons

    // Game state variables captured at the start of a new game
    let selectedGameMode = 'player1_vs_ai'; // Default value
    let currentGameDifficulty = 1; // Default difficulty

    aiButton = document.getElementById('encode-button');
    messageOutput = document.getElementById('decode-message');
    gameEndMessageElement = document.getElementById('game-end-message');
    encodedOutputDiv = document.getElementById('encoded-output');
    decodeInputElement = document.getElementById('decode-input');
    newGameButtonElement = document.getElementById('new-game-button');
    movesTableElement = document.getElementById('moves-table');
    gameValueSlider = document.getElementById('game-value-slider');
    currentSliderValueDisplay = document.getElementById('current-slider-value');

    gameModeRadios = document.querySelectorAll('input[name="game_mode"]');
    gameModeRadios.forEach(radio => {
        if (radio.checked) {
            selectedGameMode = radio.value;
        }
        radio.addEventListener('change', (event) => {
            selectedGameMode = event.target.value;
            console.log("Selected Game Mode:", selectedGameMode);
        });
    });

    movesTableBody = document.getElementById('moves-table')?.getElementsByTagName('tbody')[0];
    if (!movesTableBody) {
        console.warn("Moves table body (tbody) not found during initial setup. Table functionality might be affected.");
    }

    if (newGameButtonElement) {
        newGameButtonElement.addEventListener('click', () => {
            const difficultyValue = gameValueSlider.value;
            currentGameDifficulty = parseInt(difficultyValue, 10);
            console.log("Starting New Game with:");
            console.log("  Difficulty:", currentGameDifficulty);
            console.log("  Game Mode:", selectedGameMode);
            initGame();
        });
    } else {
        console.error('New Game Button (id="new-game-button") not found in the DOM!');
    }

    if (gameValueSlider && currentSliderValueDisplay) {
        gameValueSlider.addEventListener('input', () => {
            currentSliderValueDisplay.textContent = gameValueSlider.value;
        });
    } else {
        console.error('Game Value Slider or display element not found!');
    }

    if(aiButton) aiButton.disabled = true;

    if (typeof createJogoModule === "function") {
        createJogoModule()
            .then(instance => {
                jogoModuleInstance = instance;
                console.log("Jogo Wasm Module Initialized!");
                updateControlsBasedOnGameState();
                if(messageOutput) messageOutput.textContent = "Wasm module loaded.";
            })
            .catch(err => {
                console.error("Error initializing Jogo Wasm Module:", err);
                if(messageOutput) messageOutput.textContent = "Failed to load Wasm module. Check console. Details: " + err;
                updateControlsBasedOnGameState();
            });
    } else {
        console.error("createJogoModule is not defined. Ensure jogo_module.js is loaded correctly.");
        if(messageOutput) messageOutput.textContent = "Error: Jogo module script not found.";
        updateControlsBasedOnGameState();
    }

    function updateControlsBasedOnGameState() {
        if (!gameActive) {
            if (aiButton) aiButton.disabled = true;
            if (movesTableElement) movesTableElement.classList.remove('table-interaction-disabled');
            if (gameValueSlider) gameValueSlider.disabled = false;
            if (gameModeRadios) {
                gameModeRadios.forEach(radio => { radio.disabled = false; });
            }
        } else {
            if (aiButton) {
                if (selectedGameMode === 'two_players') {
                    aiButton.disabled = true;
                } else {
                    aiButton.disabled = !jogoModuleInstance;
                }
            }
            if (movesTableElement) movesTableElement.classList.add('table-interaction-disabled');
            if (gameValueSlider) gameValueSlider.disabled = true;
            if (gameModeRadios) {
                gameModeRadios.forEach(radio => { radio.disabled = true; });
            }
        }
    }

    function setGameEndMessage(message) {
        if (gameEndMessageElement) {
            gameEndMessageElement.textContent = message;
        }
        updateControlsBasedOnGameState();
    }

    function getSquareElementByIndex(index) {
        if (index < 0 || index >= totalSquares) return null;
        if (!gameBoardElement) {
            gameBoardElement = document.getElementById('game-board');
            if (!gameBoardElement) return null;
        }
        return gameBoardElement.querySelector(`.square[data-square-number="${index}"]`);
    }

    function addNumberCircle(squareElement, number) {
        if (!squareElement) return;
        const numberCircle = document.createElement('div');
        numberCircle.classList.add('number-circle', `number-${number}`);
        numberCircle.textContent = number.toString();
        squareElement.appendChild(numberCircle);
    }

    function setMessage(message, isError = false) {
        if (messageOutput) {
            messageOutput.textContent = message;
            messageOutput.style.color = isError ? 'red' : (message.includes("Displaying state:") ? 'blue' : 'green');
        }
    }

    function isMoveAdjacent(targetIndex, currentIndex) {
        if (targetIndex < 0 || targetIndex >= totalSquares) return false;
        if (targetIndex === currentIndex) return false;
        const currentRow = Math.floor(currentIndex / boardSize);
        const currentCol = currentIndex % boardSize;
        const targetRow = Math.floor(targetIndex / boardSize);
        const targetCol = targetIndex % boardSize;
        const rowDiff = Math.abs(targetRow - currentRow);
        const colDiff = Math.abs(targetCol - currentCol);
        return rowDiff <= 1 && colDiff <= 1;
    }

    function checkWinCondition(currentIndex) {
        let winner = null;
        if (currentIndex === numberOneSquareIndex) winner = 1;
        else if (currentIndex === numberTwoSquareIndex) winner = 2;
        if (winner !== null) {
            gameActive = false;
            setGameEndMessage(`Jogador ${winner} ganhou!`);
            return true;
        }
        return false;
    }

    function canPlayerMove(currentIndex, context = "move") {
        let foundValidMove = false;
        if (context !== 'load_check') console.log(`canPlayerMove (context: ${context}) called for index ${currentIndex}`);
        for (let rowOffset = -1; rowOffset <= 1; rowOffset++) {
            for (let colOffset = -1; colOffset <= 1; colOffset++) {
                if (rowOffset === 0 && colOffset === 0) continue;
                const currentRow = Math.floor(currentIndex / boardSize);
                const currentCol = currentIndex % boardSize;
                const targetRow = currentRow + rowOffset;
                const targetCol = currentCol + colOffset;
                if (targetRow >= 0 && targetRow < boardSize && targetCol >= 0 && targetCol < boardSize) {
                    const targetIndex = targetRow * boardSize + targetCol;
                    const targetSquareElement = getSquareElementByIndex(targetIndex);
                    if (targetSquareElement && !targetSquareElement.classList.contains('occupied')) {
                        if (context !== 'load_check') console.log(`  FOUND VALID MOVE at ${targetIndex}`);
                        foundValidMove = true;
                        break;
                    }
                }
            }
            if (foundValidMove) break;
        }
        if (context !== 'load_check' && !foundValidMove) {
            console.warn(`canPlayerMove (context: ${context}): Did NOT find any valid moves for index ${currentIndex}!`);
        }
        return foundValidMove;
    }

    function updateGoalHighlight() {
        const goalSquare1 = getSquareElementByIndex(numberOneSquareIndex);
        const goalSquare2 = getSquareElementByIndex(numberTwoSquareIndex);
        const numberCircle1 = goalSquare1 ? goalSquare1.querySelector('.number-circle') : null;
        const numberCircle2 = goalSquare2 ? goalSquare2.querySelector('.number-circle') : null;
        if (numberCircle1) numberCircle1.classList.remove('highlighted-goal');
        if (numberCircle2) numberCircle2.classList.remove('highlighted-goal');
        if (moveCount % 2 === 0) {
            if (numberCircle1) numberCircle1.classList.add('highlighted-goal');
        } else {
            if (numberCircle2) numberCircle2.classList.add('highlighted-goal');
        }
    }

    function encodeCurrentStateOnly() {
        let encodedState = 0n;
        for (let i = 0; i < totalSquares; i++) {
            const square = getSquareElementByIndex(i);
            if (square && square.classList.contains('occupied')) {
                encodedState |= (1n << BigInt(i));
            }
        }
        const height = 7n; encodedState |= (height << 50n);
        const width = 7n; encodedState |= (width << 53n);
        const currentPlayerBit = BigInt(moveCount % 2);
        encodedState |= (currentPlayerBit << 56n);
        const tokenPosition = BigInt(currentWhiteTokenIndex);
        encodedState |= (tokenPosition << 58n);
        return encodedState;
    }

    function encodeGameStateToBigIntAndPlayAI() {
        if (!jogoModuleInstance) {
            setMessage("Módulo do jogo não carregado. Jogada da IA não disponível.", true);
            return null;
        }
        if (!gameActive) {
            setMessage("O jogo não está ativo. IA não pode jogar.", true);
            return null;
        }
        const currentPlayer = (moveCount % 2) + 1;
        let isAITurn = false;
        if (selectedGameMode === 'player1_vs_ai' && currentPlayer === 2) isAITurn = true;
        else if (selectedGameMode === 'player2_vs_ai' && currentPlayer === 1) isAITurn = true;
        if (!isAITurn) {
            setMessage("Não é a vez da IA jogar neste modo ou turno.", true);
            return null;
        }
        let encodedState = 0n;
        for (let i = 0; i < totalSquares; i++) {
            const square = getSquareElementByIndex(i);
            if (square && square.classList.contains('occupied')) {
                encodedState |= (1n << BigInt(i));
            }
        }
        const height = 7n; encodedState |= (height << 50n);
        const width = 7n; encodedState |= (width << 53n);
        const currentPlayerBit = BigInt(moveCount % 2);
        encodedState |= (currentPlayerBit << 56n);
        const tokenPosition = BigInt(currentWhiteTokenIndex);
        encodedState |= (tokenPosition << 58n);
        const dificuldade = 2 + (currentGameDifficulty - 1) * 5;
        console.log("AI Difficulty used:", dificuldade);
        try {
            const aiMoveIndex = jogoModuleInstance._jogadaSite(encodedState, dificuldade);
            console.log(`AI decided to move to square index: ${aiMoveIndex}`);
            const squareElement = getSquareElementByIndex(aiMoveIndex);
            if (squareElement && isMoveAdjacent(aiMoveIndex, currentWhiteTokenIndex) && !squareElement.classList.contains('occupied')) {
                squareElement.click();
            } else {
                console.error("AI attempted an invalid move to index:", aiMoveIndex);
                setMessage("IA tentou uma jogada inválida.", true);
            }
            return encodeCurrentStateOnly();
        } catch (e) {
            console.error("Error during AI move execution:", e);
            setMessage("Erro ao executar a jogada da IA.", true);
            return encodedState;
        }
    }

    function decodeBigIntToGameState(encodedString) {
        try {
            const encodedState = BigInt(encodedString.trim());
            const tokenIndex = Number((encodedState >> 58n) & 63n);
            const playerBit = Number((encodedState >> 56n) & 1n);
            const width = Number((encodedState >> 53n) & 7n);
            const height = Number((encodedState >> 50n) & 7n);
            if (width !== boardSize || height !== boardSize) {
                console.warn(`Decoded dimensions are ${width}x${height}, expected ${boardSize}x${boardSize}.`);
            }
            if (tokenIndex < 0 || tokenIndex >= totalSquares) {
                console.error(`Decoded token index ${tokenIndex} is out of bounds.`);
                setMessage(`Error: Decoded token index ${tokenIndex} is out of bounds.`, true);
                return null;
            }
            const boardState = [];
            for (let i = 0; i < totalSquares; i++) {
                boardState.push(((encodedState >> BigInt(i)) & 1n) === 1n);
            }
            return { tokenIndex, moveCountParity: playerBit, boardState };
        } catch (error) {
            console.error("Error decoding BigInt string:", error);
            setMessage(`Error decoding input: ${error.message}`, true);
            return null;
        }
    }

    function applyDecodedState(state, source = 'unknown') {
        if (!state) {
            setMessage("Failed to decode or apply state.", true);
            return;
        }
        console.log("Applying decoded state for viewing from:", source, state);
        if (gameEndMessageElement) gameEndMessageElement.textContent = '';

        if (source === 'input') {
            // moveHistory = []; // Phased out
            if (movesTableBody) movesTableBody.innerHTML = '';
        }

        initGame(true);
        currentWhiteTokenIndex = state.tokenIndex;
        moveCount = state.moveCountParity;

        for (let i = 0; i < totalSquares; i++) {
            const squareElement = getSquareElementByIndex(i);
            if (squareElement) squareElement.innerHTML = '';
            if (i === numberOneSquareIndex) addNumberCircle(squareElement, 1);
            else if (i === numberTwoSquareIndex) addNumberCircle(squareElement, 2);
            if (state.boardState[i]) {
                if (i === currentWhiteTokenIndex) continue;
                if (squareElement && !(i === numberOneSquareIndex || i === numberTwoSquareIndex)) {
                    const blackToken = document.createElement('div');
                    blackToken.classList.add('token');
                    squareElement.appendChild(blackToken);
                    squareElement.classList.add('occupied');
                } else if (squareElement && (i === numberOneSquareIndex || i === numberTwoSquareIndex)) {
                    console.warn(`Loaded state wants black token on goal ${i}. Goal number circle shown instead.`);
                }
            }
        }
        const whiteTokenSquare = getSquareElementByIndex(currentWhiteTokenIndex);
        if (whiteTokenSquare) {
            if (whiteTokenSquare.querySelector('.number-circle')) whiteTokenSquare.innerHTML = '';
            const whiteToken = document.createElement('div');
            whiteToken.classList.add('white-token');
            whiteTokenSquare.appendChild(whiteToken);
            whiteTokenSquare.classList.remove('occupied');
        } else {
            console.error("CRITICAL: Failed to find square for decoded white token index:", currentWhiteTokenIndex);
            setMessage("Error placing white token from decoded state.", true);
        }
        updateGoalHighlight();
        gameActive = false;
        let loadedStateInfo = `Displaying state: Turn for Player ${state.moveCountParity + 1}. `;
        if (state.tokenIndex === numberOneSquareIndex) loadedStateInfo += "This was a winning state for Player 1. ";
        else if (state.tokenIndex === numberTwoSquareIndex) loadedStateInfo += "This was a winning state for Player 2. ";
        else if (!canPlayerMove(state.tokenIndex, 'load_check')) {
            loadedStateInfo += `Player ${state.moveCountParity + 1} had no available moves in this state. `;
        }
        loadedStateInfo += "Click 'Start New Game' to play a new game.";
        setMessage(loadedStateInfo, false);
        updateControlsBasedOnGameState();
    }

    function indexToCoords(index) {
        if (index < 0 || index >= totalSquares) return "N/A";
        const row = boardSize - 1 - Math.floor(index / boardSize);
        const col = index % boardSize;
        const colChar = String.fromCharCode('a'.charCodeAt(0) + col);
        return `${colChar}${row + 1}`;
    }

    // --- NEW: Click handler for historic move cells ---
    function handleHistoricMoveCellClick() {
        if (gameActive) {
            console.log("Game is active. Finish or reset the current game to load from history.");
            setMessage("Finish or reset to load from history.", true);
            return;
        }
        const stateToLoad = this.dataset.encodedState; // 'this' is the cell
        if (stateToLoad) {
            setMessage("Loading state from history for viewing...", false);
            const decodedState = decodeBigIntToGameState(stateToLoad);
            // Use a source like 'table-cell' to differentiate from 'input' if needed in applyDecodedState
            applyDecodedState(decodedState, 'table-cell');
        } else {
            console.warn("Clicked cell in history table has no encoded state.");
            setMessage("No state found for this historic move.", true);
        }
    }

    // --- UPDATED: Add Move to Table (New Structure) ---
    function addMoveToTable(gameMoveNumber, player, coords, encodedState) { // gameMoveNumber is ply (1, 2, 3...)
        if (!movesTableBody) {
            console.error("addMoveToTable: Moves table body not found! Cannot add move.");
            return;
        }

        const tableRowNumber = Math.floor((gameMoveNumber - 1) / 2) + 1; // 1-based full move number
        let targetRow;
        let moveCell;

        if (player === 1) { // Player 1's move
            targetRow = movesTableBody.insertRow(); // New row for P1's move (and subsequent P2's move)
            targetRow.insertCell(0).textContent = tableRowNumber;

            moveCell = targetRow.insertCell(1); // Cell for Player 1's move
            targetRow.insertCell(2).textContent = ''; // Empty cell for Player 2 initially
        } else { // Player 2's move
            // Find the last row, which should correspond to the current tableRowNumber
            if (movesTableBody.rows.length > 0 &&
                movesTableBody.rows[movesTableBody.rows.length - 1].cells[0] &&
                movesTableBody.rows[movesTableBody.rows.length - 1].cells[0].textContent == tableRowNumber.toString()) {
                targetRow = movesTableBody.rows[movesTableBody.rows.length - 1];
            } else {
                // This case might occur if loading a game state where P2 made the last move of a pair,
                // and the table is being reconstructed. Or an unexpected sequence.
                // For robustness, create the row if it doesn't exist, though ideally P1 creates it.
                console.warn(`Player 2's move for table row ${tableRowNumber}, but P1's part of row not found/mismatched. Creating/adjusting row.`);
                targetRow = movesTableBody.insertRow();
                targetRow.insertCell(0).textContent = tableRowNumber;
                targetRow.insertCell(1).textContent = ''; // Empty for P1
            }

            if (targetRow) {
                // Ensure cell exists, handles case where row was just created for P2.
                moveCell = targetRow.cells[2] || targetRow.insertCell(2);
            } else {
                console.error(`addMoveToTable: Could not find or create row for Player 2's move (Table Row: ${tableRowNumber}).`);
                return;
            }
        }

        if (moveCell) {
            moveCell.textContent = coords;
            moveCell.dataset.encodedState = encodedState.toString();
            moveCell.addEventListener('click', handleHistoricMoveCellClick);
        } else {
            console.error(`addMoveToTable: Failed to get move cell for player ${player}, move ${coords}`);
        }
        // moveHistory.push({ gameMoveNumber, player, coords, encodedState }); // Old history push, can be removed or adapted
    }


    function handleSquareClick(event) {
        if (!gameActive) return;
        const clickedSquare = event.currentTarget;
        const clickedSquareIndex = parseInt(clickedSquare.dataset.squareNumber, 10);
        if (!isMoveAdjacent(clickedSquareIndex, currentWhiteTokenIndex)) return;
        if (clickedSquare.classList.contains('occupied')) return;

        const playerMakingTheMove = (moveCount % 2) + 1;
        const gameMoveNumberForTable = moveCount + 1; // This is the ply number

        const previousSquareElement = getSquareElementByIndex(currentWhiteTokenIndex);
        if (previousSquareElement) {
            previousSquareElement.innerHTML = '';
            const blackToken = document.createElement('div');
            blackToken.classList.add('token');
            previousSquareElement.appendChild(blackToken);
            previousSquareElement.classList.add('occupied');
        }
        clickedSquare.innerHTML = '';
        const whiteToken = document.createElement('div');
        whiteToken.classList.add('white-token');
        clickedSquare.appendChild(whiteToken);
        clickedSquare.classList.remove('occupied');
        currentWhiteTokenIndex = clickedSquareIndex;
        moveCount++;

        const encodedStateForTable = encodeCurrentStateOnly(); // State *after* this move
        const moveCoords = indexToCoords(clickedSquareIndex);
        addMoveToTable(gameMoveNumberForTable, playerMakingTheMove, moveCoords, encodedStateForTable);

        updateGoalHighlight();
        if (checkWinCondition(currentWhiteTokenIndex)) return;
        if (!canPlayerMove(currentWhiteTokenIndex)) {
            gameActive = false;
            const winner = playerMakingTheMove; // Player who made the move that resulted in no moves for opponent
            setGameEndMessage(`Encurralado! O jogador ${winner} ganha!`);
            return;
        }
        const nextPlayer = (moveCount % 2) + 1;
        let shouldAIPplay = false;
        if (selectedGameMode === 'player1_vs_ai' && nextPlayer === 2) shouldAIPplay = true;
        else if (selectedGameMode === 'player2_vs_ai' && nextPlayer === 1) shouldAIPplay = true;
        if (shouldAIPplay && gameActive) {
            setTimeout(() => { encodeGameStateToBigIntAndPlayAI(); }, 50);
        }
    }

    function initGame(calledDuringDecode = false) {
        if (!calledDuringDecode) console.log("Initializing new game...");
        else console.log("Initializing board for state display...");

        gameBoardElement = document.getElementById('game-board');
        if (!gameBoardElement) {
            console.error("CRITICAL: Game board element not found!");
            if(messageOutput) messageOutput.textContent = "Error: Game board element not found.";
            return;
        }

        if (!calledDuringDecode) {
            if (gameEndMessageElement) gameEndMessageElement.textContent = '';
            setMessage(`New game started. Mode: ${selectedGameMode}, Difficulty: ${currentGameDifficulty}. Player 1's turn.`, false);
            if (encodedOutputDiv) encodedOutputDiv.textContent = '';
            if (decodeInputElement) decodeInputElement.value = '';
            // moveHistory = []; // Phased out for this change
            if (movesTableBody) movesTableBody.innerHTML = '';
        }

        gameBoardElement.innerHTML = '';
        for (let i = 0; i < totalSquares; i++) {
            const square = document.createElement('div');
            square.classList.add('square');
            square.dataset.squareNumber = i;
            square.classList.remove('occupied');
            if (i === numberOneSquareIndex) addNumberCircle(square, 1);
            else if (i === numberTwoSquareIndex) addNumberCircle(square, 2);
            if (!calledDuringDecode) {
                square.addEventListener('click', handleSquareClick);
            }
            gameBoardElement.appendChild(square);
        }

        if (!calledDuringDecode) {
            moveCount = 0;
            currentWhiteTokenIndex = initialWhiteTokenIndex;
            gameActive = true;
            const startSquare = getSquareElementByIndex(initialWhiteTokenIndex);
            if(startSquare){
                if (startSquare.querySelector('.number-circle')) startSquare.innerHTML = '';
                const whiteToken = document.createElement('div');
                whiteToken.classList.add('white-token');
                startSquare.appendChild(whiteToken);
                startSquare.classList.remove('occupied');
            } else {
                console.error("CRITICAL: Could not find initial start square", initialWhiteTokenIndex);
                gameActive = false;
                setGameEndMessage("Error: Could not place initial token.");
                return;
            }
            updateGoalHighlight();
            if (!canPlayerMove(currentWhiteTokenIndex, 'init')) {
                gameActive = false;
                setGameEndMessage(`No initial moves available! Player 2 wins by default!`);
            } else {
                console.log("New game active. White token at:", currentWhiteTokenIndex, "Move count:", moveCount);
            }
            updateControlsBasedOnGameState();
            if (selectedGameMode === 'player2_vs_ai' && gameActive) {
                setMessage("New game started. Player 1 (IA)'s turn.", false);
                setTimeout(() => { encodeGameStateToBigIntAndPlayAI(); }, 100);
            } else if (selectedGameMode === 'player1_vs_ai' && gameActive) {
                setMessage("New game started. Player 1 (You)'s turn.", false);
            } else if (selectedGameMode === 'two_players' && gameActive) {
                setMessage("New game started. Player 1's turn.", false);
            }
        }
    }

    if (aiButton && encodedOutputDiv) {
        aiButton.addEventListener('click', () => {
            encodeGameStateToBigIntAndPlayAI();
        });
    } else {
        // console.error("Could not find AI Move button or output div."); // Already present
    }

    const decodeButton = document.getElementById('decode-button');
    if (decodeButton && decodeInputElement) {
        decodeButton.addEventListener('click', () => {
            if (gameActive) {
                setMessage("Please finish or reset the current game before loading a new state for viewing.", true);
                return;
            }
            const encodedString = decodeInputElement.value;
            if (!encodedString) {
                setMessage("Please enter an encoded state value to view.", true);
                return;
            }
            setMessage("Decoding state for viewing...", false);
            const decodedState = decodeBigIntToGameState(encodedString);
            if (decodedState) {
                applyDecodedState(decodedState, 'input'); // 'input' source will clear the table
            } else {
                setMessage("Failed to decode the provided state.", true);
            }
        });
    } else {
        // console.error("Could not find Decode button or input field."); // Already present
    }

    initGame(true); // Initial setup for board view, then can be overridden by new game button
    // To start a playable game on load instead of just board view:
    // initGame(); // This would start an active game as per default settings.
    // However, the current setup with "New Game" button seems more intentional.
    // The initial initGame(true) sets up the board elements for viewing.
    // A 'New Game' click then starts an actual game.
    // If you want a game to be immediately playable on load, change initGame(true) to initGame()
    // For now, let's stick to the existing behavior where "New Game" button is the main trigger for a playable game.
    // The initial `initGame(true)` sets up the board. Then, if a user presses "New Game", `initGame()` is called.
    // To make it clear no game is active on first load:
    gameActive = false;
    updateControlsBasedOnGameState();
    setMessage("Click 'Iniciar Novo Jogo' to begin.", false);


}); // End of DOMContentLoaded listener