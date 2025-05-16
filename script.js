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

    let moveHistory = [];
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
    let gameValueSlider; // NOVO
    let currentSliderValueDisplay; // NOVO

    aiButton = document.getElementById('encode-button');
    messageOutput = document.getElementById('decode-message');
    gameEndMessageElement = document.getElementById('game-end-message');
    encodedOutputDiv = document.getElementById('encoded-output');
    decodeInputElement = document.getElementById('decode-input');
    newGameButtonElement = document.getElementById('new-game-button');
    movesTableElement = document.getElementById('moves-table');
    gameValueSlider = document.getElementById('game-value-slider'); // NOVO
    currentSliderValueDisplay = document.getElementById('current-slider-value'); // NOVO


    movesTableBody = document.getElementById('moves-table')?.getElementsByTagName('tbody')[0];
    if (!movesTableBody) {
        console.warn("Moves table body (tbody) not found during initial setup. Table functionality might be affected.");
    }

    if (newGameButtonElement) {
        newGameButtonElement.addEventListener('click', () => {
            initGame(); // This will start a new, active game
        });
    } else {
        console.error('New Game Button (id="new-game-button") not found in the DOM!');
    }

    // NOVO: Listener para o slider
    if (gameValueSlider && currentSliderValueDisplay) {
        gameValueSlider.addEventListener('input', () => {
            currentSliderValueDisplay.textContent = gameValueSlider.value;
            // console.log("Slider value:", gameValueSlider.value); // Para depuração
        });
    } else {
        console.error('Game Value Slider or display element not found!');
    }
    // FIM NOVO


    if(aiButton) aiButton.disabled = true;

    if (typeof createJogoModule === "function") {
        createJogoModule()
            .then(instance => {
                jogoModuleInstance = instance;
                console.log("Jogo Wasm Module Initialized!");
                updateControlsBasedOnGameState(); // Update based on initial game state
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

    // --- Helper Function: Update UI Controls Based on Game State ---
    function updateControlsBasedOnGameState() {
        if (!gameActive) { // Game is NOT active (ended, viewing history, or not started)
            if (aiButton) aiButton.disabled = true; // AI moves only during an active game
            if (movesTableElement) movesTableElement.classList.remove('table-interaction-disabled'); // Enable table interaction
        } else { // Game IS active
            if (aiButton) aiButton.disabled = !jogoModuleInstance;
            if (movesTableElement) movesTableElement.classList.add('table-interaction-disabled'); // Disable table interaction
        }
    }

    // --- Helper Function: Set Game End Message (for live games ending) ---
    function setGameEndMessage(message) {
        if (gameEndMessageElement) {
            gameEndMessageElement.textContent = message;
        }
        // gameActive should have been set to false by the caller (checkWinCondition, handleSquareClick stalemate)
        updateControlsBasedOnGameState(); // This will re-enable table interaction
    }


    // --- Helper Function: Get Square Element by Index ---
    function getSquareElementByIndex(index) {
        if (index < 0 || index >= totalSquares) {
            return null;
        }
        if (!gameBoardElement) {
            gameBoardElement = document.getElementById('game-board');
            if (!gameBoardElement) {
                console.error("getSquareElementByIndex: Game board element not found!");
                return null;
            }
        }
        return gameBoardElement.querySelector(`.square[data-square-number="${index}"]`);
    }

    // --- Helper: Add Number Circle to a Square ---
    function addNumberCircle(squareElement, number) {
        if (!squareElement) return;
        // squareElement.innerHTML = ''; // Ensure it's clean before adding, handled by initGame(true) usually
        const numberCircle = document.createElement('div');
        numberCircle.classList.add('number-circle', `number-${number}`);
        numberCircle.textContent = number.toString();
        squareElement.appendChild(numberCircle);
    }

    // --- Helper: Display General Status/Error Messages ---
    function setMessage(message, isError = false) {
        if (messageOutput) {
            messageOutput.textContent = message;
            messageOutput.style.color = isError ? 'red' : (message.includes("Displaying state:") ? 'blue' : 'green');
        }
    }

    // --- Helper Function: Check if a Target Index is Adjacent to Current ---
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

    // --- Helper Function: Check for Win Condition (Reaching Goal in an active game) ---
    function checkWinCondition(currentIndex) {
        let winner = null;
        if (currentIndex === numberOneSquareIndex) {
            winner = 1;
        } else if (currentIndex === numberTwoSquareIndex) {
            winner = 2;
        }

        if (winner !== null) {
            gameActive = false; // Mark game as ended
            setGameEndMessage(`Jogador ${winner} ganhou!`); // Display win message
            return true;
        }
        return false;
    }

    // --- Helper Function: Check if any valid moves exist from current position ---
    function canPlayerMove(currentIndex, context = "move") { // context can be 'move', 'init', 'load_check'
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
                    // When checking for canPlayerMove, an occupied square means no move there.
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

    // --- Helper Function: Update Goal Highlight ---
    function updateGoalHighlight() {
        const goalSquare1 = getSquareElementByIndex(numberOneSquareIndex);
        const goalSquare2 = getSquareElementByIndex(numberTwoSquareIndex);
        const numberCircle1 = goalSquare1 ? goalSquare1.querySelector('.number-circle') : null;
        const numberCircle2 = goalSquare2 ? goalSquare2.querySelector('.number-circle') : null;

        if (numberCircle1) numberCircle1.classList.remove('highlighted-goal');
        if (numberCircle2) numberCircle2.classList.remove('highlighted-goal');

        // Always highlight based on moveCount to show whose turn it was/is
        if (moveCount % 2 === 0) { // Player 1's turn (or would be)
            if (numberCircle1) numberCircle1.classList.add('highlighted-goal');
        } else { // Player 2's turn (or would be)
            if (numberCircle2) numberCircle2.classList.add('highlighted-goal');
        }
    }

    // --- Encoding Function (JUST for current state, NO AI MOVE) ---
    function encodeCurrentStateOnly() {
        let encodedState = 0n;
        for (let i = 0; i < totalSquares; i++) {
            const square = getSquareElementByIndex(i);
            if (square && square.classList.contains('occupied')) {
                encodedState |= (1n << BigInt(i));
            }
        }
        const height = 7n;
        encodedState |= (height << 50n);
        const width = 7n;
        encodedState |= (width << 53n);
        const currentPlayerBit = BigInt(moveCount % 2); // Player whose turn it IS NOW
        encodedState |= (currentPlayerBit << 56n);
        const tokenPosition = BigInt(currentWhiteTokenIndex);
        encodedState |= (tokenPosition << 58n);
        return encodedState;
    }


    // --- Encoding Function (includes AI move) ---
    function encodeGameStateToBigIntAndPlayAI() {
        if (!jogoModuleInstance) {
            setMessage("Módulo do jogo não carregado. Jogada da IA não disponível.", true);
            return null;
        }
        if (!gameActive) { // AI should only play if game is active
            setMessage("O jogo não está ativo. IA não pode jogar.", true);
            return null;
        }
        let encodedState = 0n; // Encode current state to pass to AI

        for (let i = 0; i < totalSquares; i++) {
            const square = getSquareElementByIndex(i);
            if (square && square.classList.contains('occupied')) {
                encodedState |= (1n << BigInt(i));
            }
        }
        const height = 7n;
        encodedState |= (height << 50n);
        const width = 7n;
        encodedState |= (width << 53n);
        const currentPlayerBit = BigInt(moveCount % 2);
        encodedState |= (currentPlayerBit << 56n);
        const tokenPosition = BigInt(currentWhiteTokenIndex);
        encodedState |= (tokenPosition << 58n);

        const dificuldade=2+ (gameValueSlider.value-1)*5;

        try {
            const aiMoveIndex = jogoModuleInstance._jogadaSite(encodedState, dificuldade);
            console.log(`AI decided to move to square index: ${aiMoveIndex}`);

            const squareElement = getSquareElementByIndex(aiMoveIndex);
            // AI move must also be valid
            if (squareElement && isMoveAdjacent(aiMoveIndex, currentWhiteTokenIndex) && !squareElement.classList.contains('occupied')) {
                squareElement.click(); // This will trigger handleSquareClick for the AI's move
            } else {
                console.error("AI attempted an invalid move to index:", aiMoveIndex);
                setMessage("IA tentou uma jogada inválida.", true);
                // Game continues with human player if AI fails, or could be AI's loss if strict.
            }
            return encodeCurrentStateOnly(); // Return state AFTER AI's potential move
        } catch (e) {
            console.error("Error during AI move execution:", e);
            setMessage("Erro ao executar a jogada da IA.", true);
            return encodedState; // Return state before AI attempt
        }
    }

    // --- Decoding Function (Extracts data from BigInt) ---
    function decodeBigIntToGameState(encodedString) {
        try {
            const encodedState = BigInt(encodedString.trim());
            const tokenIndex = Number((encodedState >> 58n) & 63n);    // bits 58-63
            const playerBit = Number((encodedState >> 56n) & 1n);     // bit 56 (0 for P1, 1 for P2)
            const width = Number((encodedState >> 53n) & 7n);       // bits 53-55
            const height = Number((encodedState >> 50n) & 7n);      // bits 50-52
            // bits 0-48 for board occupation

            if (width !== boardSize || height !== boardSize) { // Use configured boardSize
                console.warn(`Decoded dimensions are ${width}x${height}, expected ${boardSize}x${boardSize}.`);
                // Potentially handle this as an error or adapt if dynamic board sizes were intended
            }
            if (tokenIndex < 0 || tokenIndex >= totalSquares) {
                console.error(`Decoded token index ${tokenIndex} is out of bounds.`);
                setMessage(`Error: Decoded token index ${tokenIndex} is out of bounds.`, true);
                return null;
            }

            const boardState = []; // Array of booleans (true if occupied by black token)
            for (let i = 0; i < totalSquares; i++) {
                const bitIsSet = ((encodedState >> BigInt(i)) & 1n) === 1n;
                boardState.push(bitIsSet);
            }
            // playerBit is whose turn it is (0 for P1, 1 for P2). This matches moveCount % 2.
            // So, moveCountParity should be this playerBit.
            return {
                tokenIndex: tokenIndex,
                moveCountParity: playerBit,
                boardState: boardState
            };

        } catch (error) {
            console.error("Error decoding BigInt string:", error);
            setMessage(`Error decoding input: ${error.message}`, true);
            return null;
        }
    }

    // --- Function to Apply Decoded State to Board (for viewing) ---
    function applyDecodedState(state, source = 'unknown') {
        if (!state) {
            setMessage("Failed to decode or apply state.", true);
            return;
        }
        console.log("Applying decoded state for viewing from:", source, state);
        if (gameEndMessageElement) gameEndMessageElement.textContent = ''; // Clear previous live game end messages

        if (source === 'input') { // If loading from text input, clear the current visual history
            moveHistory = [];
            if (movesTableBody) {
                movesTableBody.innerHTML = '';
            }
        }

        initGame(true); // Clears board, sets up squares, but doesn't reset full game logic

        currentWhiteTokenIndex = state.tokenIndex;
        moveCount = state.moveCountParity; // This sets whose turn it *would have been*

        // Place tokens on board
        for (let i = 0; i < totalSquares; i++) {
            const squareElement = getSquareElementByIndex(i);
            if (squareElement) squareElement.innerHTML = ''; // Clear square first

            if (i === numberOneSquareIndex) addNumberCircle(squareElement, 1);
            else if (i === numberTwoSquareIndex) addNumberCircle(squareElement, 2);

            if (state.boardState[i]) { // Occupied by black token in the loaded state
                // Ensure black token isn't placed on the white token's current square or on goal squares
                // (unless the goal itself is supposed to be black, which is not standard for this game)
                if (i === currentWhiteTokenIndex) continue; // White token takes precedence
                // If a goal square is in boardState, it's unusual, usually goals are for white to reach
                // or are empty until white reaches them.
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
        // Place the white token
        const whiteTokenSquare = getSquareElementByIndex(currentWhiteTokenIndex);
        if (whiteTokenSquare) {
            // If white token is on a goal square, ensure the number circle is cleared first
            if (whiteTokenSquare.querySelector('.number-circle')) whiteTokenSquare.innerHTML = '';
            const whiteToken = document.createElement('div');
            whiteToken.classList.add('white-token');
            whiteTokenSquare.appendChild(whiteToken);
            whiteTokenSquare.classList.remove('occupied'); // White token square is not 'occupied' by black
        } else {
            console.error("CRITICAL: Failed to find square for decoded white token index:", currentWhiteTokenIndex);
            setMessage("Error placing white token from decoded state.", true);
            // gameActive will be false, controls updated.
        }

        updateGoalHighlight(); // Highlight based on the loaded state's moveCount (whose turn it was)

        gameActive = false; // KEY: Viewing a loaded state is not an "active" game.
                            // Board moves are disabled. Table interaction remains enabled.

        // Display information about the loaded state
        let loadedStateInfo = `Displaying state: Turn for Player ${state.moveCountParity + 1}. `;
        let wasHistoricGameOver = false;

        if (state.tokenIndex === numberOneSquareIndex) {
            loadedStateInfo += "This was a winning state for Player 1. ";
            wasHistoricGameOver = true;
        } else if (state.tokenIndex === numberTwoSquareIndex) {
            loadedStateInfo += "This was a winning state for Player 2. ";
            wasHistoricGameOver = true;
        } else if (!canPlayerMove(state.tokenIndex, 'load_check')) {
            const blockedPlayer = state.moveCountParity + 1; // Player whose turn it was in that state
            loadedStateInfo += `Player ${blockedPlayer} had no available moves in this state. `;
            wasHistoricGameOver = true;
        }

        loadedStateInfo += "Click 'Start New Game' to play a new game.";
        setMessage(loadedStateInfo, false); // Use general message area for info
        if(wasHistoricGameOver && gameEndMessageElement) {
            // Can use gameEndMessageElement to emphasize if the loaded state was a game end
            // gameEndMessageElement.textContent = "The displayed historic state was a game conclusion.";
        }


        updateControlsBasedOnGameState(); // gameActive is false, so table will be enabled.
    }

    // --- Helper Function: Convert Index to Algebraic Coordinates ---
    function indexToCoords(index) {
        if (index < 0 || index >= totalSquares) return "N/A";
        const row = boardSize - 1 - Math.floor(index / boardSize);
        const col = index % boardSize;
        const colChar = String.fromCharCode('a'.charCodeAt(0) + col);
        return `${colChar}${row + 1}`;
    }

    // --- Helper Function: Add Move to Table and History ---
    function addMoveToTable(moveNumber, player, coords, encodedState) {
        if (!movesTableBody) {
            console.error("addMoveToTable: Moves table body not found! Cannot add move.");
            return;
        }

        const newRow = movesTableBody.insertRow();
        newRow.insertCell(0).textContent = moveNumber;
        newRow.insertCell(1).textContent = player;
        newRow.insertCell(2).textContent = coords;
        // No 4th cell for encoded state display

        newRow.dataset.encodedState = encodedState.toString(); // Keep for row click functionality

        newRow.addEventListener('click', function() {
            if (gameActive) { // Prevent loading from history if a game is live
                console.log("Game is active. Finish or reset the current game to load from history.");
                setMessage("Finish or reset to load from history.", true);
                return;
            }

            const stateToLoad = this.dataset.encodedState;
            if (stateToLoad) {
                setMessage("Loading state from history for viewing...", false);
                const decodedState = decodeBigIntToGameState(stateToLoad);
                applyDecodedState(decodedState, 'table');
            }
        });
        moveHistory.push({ moveNumber, player, coords, encodedState });
    }


    // --- Function to Handle Clicks on Squares (only if gameActive) ---
    function handleSquareClick(event) {
        if (!gameActive) return; // Board clicks only processed if game is live

        const clickedSquare = event.currentTarget;
        const clickedSquareIndex = parseInt(clickedSquare.dataset.squareNumber, 10);

        if (!isMoveAdjacent(clickedSquareIndex, currentWhiteTokenIndex)) return;
        if (clickedSquare.classList.contains('occupied')) return;

        // Player making the move (1 or 2)
        const playerMakingTheMove = (moveCount % 2) + 1;
        const gameMoveNumber = moveCount + 1; // Overall move number in the game
        const moveCoords = indexToCoords(clickedSquareIndex);

        // Update previous square to black token
        const previousSquareElement = getSquareElementByIndex(currentWhiteTokenIndex);
        if (previousSquareElement) {
            previousSquareElement.innerHTML = ''; // Clear previous content (e.g. white token or number)
            const blackToken = document.createElement('div');
            blackToken.classList.add('token');
            previousSquareElement.appendChild(blackToken);
            previousSquareElement.classList.add('occupied');
        }

        // Move white token to new square
        clickedSquare.innerHTML = ''; // Clear new square (e.g. number if it's a goal)
        const whiteToken = document.createElement('div');
        whiteToken.classList.add('white-token');
        clickedSquare.appendChild(whiteToken);
        clickedSquare.classList.remove('occupied'); // Current square is not 'occupied' by black

        currentWhiteTokenIndex = clickedSquareIndex;
        moveCount++; // Increment move count AFTER determining player and processing move

        const encodedStateForTable = encodeCurrentStateOnly(); // Encode state AFTER this move
        addMoveToTable(gameMoveNumber, playerMakingTheMove, moveCoords, encodedStateForTable);
        updateGoalHighlight(); // Update for the next player's turn

        if (checkWinCondition(currentWhiteTokenIndex)) {
            // checkWinCondition sets gameActive = false and calls setGameEndMessage
            return;
        }

        if (!canPlayerMove(currentWhiteTokenIndex)) {
            gameActive = false; // Mark game as ended (stalemate)
            // The player whose turn it now IS (after moveCount incremented) cannot move.
            // So the player who just moved (playerMakingTheMove) wins.
            // Or, if player X moves and player Y has no moves, player X wins.
            // Current moveCount is for player Y. If Y cannot move, player X (playerMakingTheMove) wins.
            const winner = playerMakingTheMove;
            setGameEndMessage(`Encurralado! O jogador ${winner} ganha!`);
            return;
        }
    }

    // --- Function to Initialize or Reset the Game ---
    function initGame(calledDuringDecode = false) { // calledDuringDecode = true just sets up board, no game logic reset
        if (!calledDuringDecode) {
            console.log("Initializing new game (user action or first load)...");
        } else {
            console.log("Initializing board for state display (decode/history)...");
        }

        gameBoardElement = document.getElementById('game-board');
        if (!gameBoardElement) {
            console.error("CRITICAL: Game board element (id='game-board') not found! Cannot initialize.");
            if(messageOutput) messageOutput.textContent = "Error: Game board element not found.";
            return;
        }

        if (!calledDuringDecode) {
            // Full reset for a new game
            if (gameEndMessageElement) gameEndMessageElement.textContent = '';
            setMessage("New game started. Player 1's turn.", false);
            if (encodedOutputDiv) encodedOutputDiv.textContent = '';
            if (decodeInputElement) decodeInputElement.value = '';

            moveHistory = [];
            if (movesTableBody) {
                movesTableBody.innerHTML = '';
            }
        }

        gameBoardElement.innerHTML = ''; // Clear board for all init cases

        for (let i = 0; i < totalSquares; i++) {
            const square = document.createElement('div');
            square.classList.add('square');
            square.dataset.squareNumber = i;
            // square.innerHTML = ''; // Already done by gameBoardElement.innerHTML
            square.classList.remove('occupied'); // Ensure all squares are not marked occupied initially

            if (i === numberOneSquareIndex) addNumberCircle(square, 1);
            else if (i === numberTwoSquareIndex) addNumberCircle(square, 2);

            if (!calledDuringDecode) { // Only add click listeners for a new, active game
                square.addEventListener('click', handleSquareClick);
            } else { // If just decoding, don't make squares clickable yet
                // square.style.cursor = 'default'; // Or similar visual cue if needed
            }
            gameBoardElement.appendChild(square);
        }

        if (!calledDuringDecode) {
            // Setup for a new, active game
            moveCount = 0;
            currentWhiteTokenIndex = initialWhiteTokenIndex;
            gameActive = true; // This is now an active game

            const startSquare = getSquareElementByIndex(initialWhiteTokenIndex);
            if(startSquare){
                if (startSquare.querySelector('.number-circle')) startSquare.innerHTML = ''; // Clear number if starting on a goal
                const whiteToken = document.createElement('div');
                whiteToken.classList.add('white-token');
                startSquare.appendChild(whiteToken);
                startSquare.classList.remove('occupied');
            } else {
                console.error("CRITICAL: Could not find initial start square", initialWhiteTokenIndex);
                gameActive = false; // Cannot start game
                setGameEndMessage("Error: Could not place initial token.");
                // updateControlsBasedOnGameState() is called by setGameEndMessage
                return;
            }

            updateGoalHighlight(); // For Player 1

            if (!canPlayerMove(currentWhiteTokenIndex, 'init')) {
                gameActive = false; // Game cannot start if no initial moves
                // Player 1 is to move, cannot, so Player 2 wins by default (or game is just stuck).
                setGameEndMessage(`No initial moves available! Player 2 wins by default!`);
            } else {
                console.log("New game active. White token at:", currentWhiteTokenIndex, "Move count:", moveCount);
            }
            updateControlsBasedOnGameState(); // Update controls for the new active/inactive game state
        }
        // If calledDuringDecode, gameActive is set by applyDecodedState, and controls updated there.
    }

    // --- Event Listeners Setup ---
    if (aiButton && encodedOutputDiv) {
        aiButton.addEventListener('click', () => {
            if (!gameActive) {
                if(encodedOutputDiv) encodedOutputDiv.textContent = "Jogo não está ativo para jogada da IA.";
                return;
            }
            if (!jogoModuleInstance) {
                if(encodedOutputDiv) encodedOutputDiv.textContent = "Módulo da IA não está pronto.";
                return;
            }

            const stateAfterAIMove = encodeGameStateToBigIntAndPlayAI(); // This will call square.click()

            if (stateAfterAIMove !== null && encodedOutputDiv) {
                encodedOutputDiv.textContent = `Encoded (Dec) after AI: ${stateAfterAIMove.toString()}\n`;
                encodedOutputDiv.textContent += `Encoded (Bin) after AI: ${stateAfterAIMove.toString(2).padStart(64, '0')}`;
            }
        });
    } else {
        console.error("Could not find AI Move button or output div. AI functionality may be affected.");
    }

    const decodeButton = document.getElementById('decode-button');
    if (decodeButton && decodeInputElement) {
        decodeButton.addEventListener('click', () => {
            if (gameActive) { // Prevent loading if a live game is ongoing
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
                applyDecodedState(decodedState, 'input');
            } else {
                setMessage("Failed to decode the provided state.", true);
            }
        });
    } else {
        console.error("Could not find Decode button or input field. Decode functionality may be affected.");
    }

    // --- Start the game when the page loads ---
    initGame(); // Starts a new, active game by default

}); // End of DOMContentLoaded listener