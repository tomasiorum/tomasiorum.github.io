document.addEventListener('DOMContentLoaded', function() {

    // --- Game Configuration & State ---
    let boardWidth = 7; // Default width
    let boardHeight = 7; // Default height
    let totalSquares = boardWidth * boardHeight;
    let numberOneSquareIndex; // Bottom-left goal (Player 1's goal)
    let numberTwoSquareIndex; // Top-right goal (Player 2's goal)
    let initialWhiteTokenIndex;

    let gameBoardElement;
    let rowLabelsDiv, colLabelsDiv;
    let gameTitleElement;
    let currentWhiteTokenIndex;
    let gameActive;
    let moveCount;

    let movesTableBody;
    let jogoModuleInstance = null;

    // DOM element references
    let aiButton, decodeButton; // For advanced/debug controls
    let messageOutput;
    let gameEndMessageElement;
    let encodedOutputDiv;
    let decodeInputElement;
    let newGameButtonElement;
    let movesTableElement;
    let gameValueSlider;
    let currentSliderValueDisplay;
    let gameModeRadios;
    let boardWidthSelect, boardHeightSelect;

    let selectedGameMode = 'player1_vs_ai';
    let currentGameDifficulty = 1;

    // Initialize DOM elements
    function initializeDomElements() {
        gameTitleElement = document.getElementById('game-title');
        gameBoardElement = document.getElementById('game-board');
        rowLabelsDiv = document.getElementById('row-labels');
        colLabelsDiv = document.getElementById('col-labels');

        aiButton = document.getElementById('encode-button'); // May not exist if advanced controls are hidden
        decodeButton = document.getElementById('decode-button'); // May not exist
        messageOutput = document.getElementById('decode-message'); // May not exist
        gameEndMessageElement = document.getElementById('game-end-message');
        encodedOutputDiv = document.getElementById('encoded-output'); // May not exist
        decodeInputElement = document.getElementById('decode-input'); // May not exist

        newGameButtonElement = document.getElementById('new-game-button');
        movesTableElement = document.getElementById('moves-table');
        movesTableBody = movesTableElement?.getElementsByTagName('tbody')[0];

        gameValueSlider = document.getElementById('game-value-slider');
        currentSliderValueDisplay = document.getElementById('current-slider-value');
        gameModeRadios = document.querySelectorAll('input[name="game_mode"]');

        boardWidthSelect = document.getElementById('board-width-select');
        boardHeightSelect = document.getElementById('board-height-select');
    }

    initializeDomElements();

    // Event Listeners
    if (newGameButtonElement) {
        newGameButtonElement.addEventListener('click', () => {
            currentGameDifficulty = parseInt(gameValueSlider.value, 10);
            // Read selected dimensions for the new game
            boardWidth = parseInt(boardWidthSelect.value, 10);
            boardHeight = parseInt(boardHeightSelect.value, 10);
            console.log("Starting New Game with:");
            console.log(`  Dimensions: ${boardWidth}x${boardHeight}`);
            console.log("  Difficulty:", currentGameDifficulty);
            console.log("  Game Mode:", selectedGameMode);
            initGame(); // Not called during decode
        });
    } else {
        console.error('New Game Button not found!');
    }

    if (gameValueSlider && currentSliderValueDisplay) {
        gameValueSlider.addEventListener('input', () => {
            currentSliderValueDisplay.textContent = gameValueSlider.value;
        });
    }

    gameModeRadios.forEach(radio => {
        if (radio.checked) selectedGameMode = radio.value;
        radio.addEventListener('change', (event) => {
            selectedGameMode = event.target.value;
        });
    });

    // Wasm Module Initialization
    if (typeof createJogoModule === "function") {
        createJogoModule()
            .then(instance => {
                jogoModuleInstance = instance;
                console.log("Jogo Wasm Module Initialized!");
                if (messageOutput) messageOutput.textContent = "Módulo Wasm carregado.";
                updateControlsBasedOnGameState();
            })
            .catch(err => {
                console.error("Error initializing Jogo Wasm Module:", err);
                if (messageOutput) messageOutput.textContent = "Falha ao carregar módulo Wasm. Verifique o console.";
                updateControlsBasedOnGameState();
            });
    } else {
        console.error("createJogoModule is not defined. Ensure jogo_module.js is loaded correctly.");
        if (messageOutput) messageOutput.textContent = "Erro: Script do módulo Jogo não encontrado.";
        updateControlsBasedOnGameState();
    }

    function updateGameConstants() {
        totalSquares = boardWidth * boardHeight;
        // Player 1's goal (bottom-left, e.g., a1)
        numberOneSquareIndex = (boardHeight - 1) * boardWidth;
        // Player 2's goal (top-right, e.g., g7 for 7x7, d4 for 4x4)
        numberTwoSquareIndex = (0 * boardWidth) + (boardWidth - 1);

        if (boardWidth === 7 && boardHeight === 7) {
            initialWhiteTokenIndex = 18; // Original position for 7x7 (e5 or index 18)
        } else {
            initialWhiteTokenIndex = 0; // Top-left corner for any board smaller than 7x7
        }
        console.log(`Updated constants: Total Squares: ${totalSquares}, P1 Goal: ${numberOneSquareIndex}, P2 Goal: ${numberTwoSquareIndex}, Start: ${initialWhiteTokenIndex}`);
    }

    function updateBoardLabels() {
        if (!rowLabelsDiv || !colLabelsDiv) return;
        rowLabelsDiv.innerHTML = '';
        for (let i = 0; i < boardHeight; i++) {
            const span = document.createElement('span');
            span.textContent = boardHeight - i; // Display 7, 6, 5...
            rowLabelsDiv.appendChild(span);
        }

        colLabelsDiv.innerHTML = '';
        for (let i = 0; i < boardWidth; i++) {
            const span = document.createElement('span');
            span.textContent = String.fromCharCode('a'.charCodeAt(0) + i);
            colLabelsDiv.appendChild(span);
        }
    }

    function updateControlsBasedOnGameState() {
        const isPlayable = gameActive && jogoModuleInstance;
        if (aiButton) aiButton.disabled = !isPlayable || selectedGameMode === 'two_players';

        if (movesTableElement) {
            movesTableElement.classList.toggle('table-interaction-disabled', gameActive);
        }
        if (gameValueSlider) gameValueSlider.disabled = gameActive;
        if (boardWidthSelect) boardWidthSelect.disabled = gameActive;
        if (boardHeightSelect) boardHeightSelect.disabled = gameActive;

        gameModeRadios.forEach(radio => { radio.disabled = gameActive; });
    }

    function setGameEndMessage(message) {
        if (gameEndMessageElement) {
            gameEndMessageElement.textContent = message;
        }
        // updateControlsBasedOnGameState is called by gameActive = false setter
    }

    function getSquareElementByIndex(index) {
        if (index < 0 || index >= totalSquares || !gameBoardElement) return null;
        return gameBoardElement.querySelector(`.square[data-square-number="${index}"]`);
    }

    function addNumberCircle(squareElement, number) {
        if (!squareElement) return;
        // Clear previous content (like a token if it was on a goal)
        squareElement.innerHTML = '';
        const numberCircle = document.createElement('div');
        numberCircle.classList.add('number-circle', `number-${number}`);
        numberCircle.textContent = number.toString();
        squareElement.appendChild(numberCircle);
    }

    function setMessage(message, isError = false) {
        if (messageOutput) {
            messageOutput.textContent = message;
            messageOutput.style.color = isError ? 'red' : (message.includes("Exibindo estado:") ? 'blue' : 'green');
        } else if (isError) {
            console.error(message);
        } else {
            console.log(message);
        }
    }

    function isMoveAdjacent(targetIndex, currentIndex) {
        if (targetIndex < 0 || targetIndex >= totalSquares) return false;
        if (targetIndex === currentIndex) return false; // Cannot move to the same square

        const currentRow = Math.floor(currentIndex / boardWidth);
        const currentCol = currentIndex % boardWidth;
        const targetRow = Math.floor(targetIndex / boardWidth);
        const targetCol = targetIndex % boardWidth;

        const rowDiff = Math.abs(targetRow - currentRow);
        const colDiff = Math.abs(targetCol - currentCol);

        // Valid if 1 square away in any direction (including diagonals)
        return rowDiff <= 1 && colDiff <= 1;
    }

    function checkWinCondition(currentIndex) {
        let winner = null;
        if (currentIndex === numberOneSquareIndex) winner = 1; // Player 1 reaches their goal
        else if (currentIndex === numberTwoSquareIndex) winner = 2; // Player 2 reaches their goal

        if (winner !== null) {
            gameActive = false;
            setGameEndMessage(`Jogador ${winner} ganhou!`);
            updateControlsBasedOnGameState();
            return true;
        }
        return false;
    }

    function canPlayerMove(currentIndex, context = "move") {
        if (context !== 'load_check') console.log(`canPlayerMove (context: ${context}) called for index ${currentIndex} (Player ${ (moveCount % 2) + 1 })`);
        for (let r_offset = -1; r_offset <= 1; r_offset++) {
            for (let c_offset = -1; c_offset <= 1; c_offset++) {
                if (r_offset === 0 && c_offset === 0) continue; // Skip current square itself

                const currentSquareRow = Math.floor(currentIndex / boardWidth);
                const currentSquareCol = currentIndex % boardWidth;
                const targetRow = currentSquareRow + r_offset;
                const targetCol = currentSquareCol + c_offset;

                if (targetRow >= 0 && targetRow < boardHeight && targetCol >= 0 && targetCol < boardWidth) {
                    const targetIndex = targetRow * boardWidth + targetCol;
                    const targetSquareElement = getSquareElementByIndex(targetIndex);
                    if (targetSquareElement && !targetSquareElement.classList.contains('occupied')) {
                        if (context !== 'load_check') console.log(`  FOUND VALID MOVE to ${targetIndex}`);
                        return true; // Found a valid move
                    }
                }
            }
        }
        if (context !== 'load_check') console.warn(`canPlayerMove (context: ${context}): NO valid moves found from index ${currentIndex}!`);
        return false; // No valid moves found
    }

    function updateGoalHighlight() {
        const goalSquare1 = getSquareElementByIndex(numberOneSquareIndex);
        const goalSquare2 = getSquareElementByIndex(numberTwoSquareIndex);
        const numberCircle1 = goalSquare1 ? goalSquare1.querySelector('.number-circle') : null;
        const numberCircle2 = goalSquare2 ? goalSquare2.querySelector('.number-circle') : null;

        if (numberCircle1) numberCircle1.classList.remove('highlighted-goal');
        if (numberCircle2) numberCircle2.classList.remove('highlighted-goal');

        if (!gameActive) return; // Don't highlight if game is over

        // Player 1's turn (moveCount is even, e.g., 0, 2, 4...) -> highlight goal 1
        // Player 2's turn (moveCount is odd, e.g., 1, 3, 5...) -> highlight goal 2
        if (moveCount % 2 === 0) { // Player 1's turn
            if (numberCircle1) numberCircle1.classList.add('highlighted-goal');
        } else { // Player 2's turn
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
        // Encode dimensions, current player, and token position
        encodedState |= (BigInt(boardHeight) << 50n);
        encodedState |= (BigInt(boardWidth) << 53n);
        const currentPlayerBit = BigInt(moveCount % 2); // 0 for P1, 1 for P2
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

        const currentPlayer = (moveCount % 2) + 1; // 1 or 2
        let isAITurn = false;
        if (selectedGameMode === 'player1_vs_ai' && currentPlayer === 2) isAITurn = true;
        else if (selectedGameMode === 'player2_vs_ai' && currentPlayer === 1) isAITurn = true;

        if (!isAITurn) {
            setMessage("Não é a vez da IA jogar neste modo ou turno.", true);
            return null;
        }

        const encodedState = encodeCurrentStateOnly();

        // Difficulty mapping: Slider 1-10. Wasm might expect different range.
        // Original code used: `const dificuldade = 2 + (currentGameDifficulty - 1) * 5;`
        // This maps 1->2, 2->7, ..., 10->47. Let's assume this is still desired.
        const dificuldade = 2 + (currentGameDifficulty - 1) * 5;
        console.log("AI Difficulty for Wasm:", dificuldade);

        try {
            // Call the Wasm function
            const aiMoveIndex = jogoModuleInstance._jogadaSite(encodedState, dificuldade);
            console.log(`AI decided to move to square index: ${aiMoveIndex}`);

            const squareElement = getSquareElementByIndex(aiMoveIndex);
            if (squareElement && isMoveAdjacent(aiMoveIndex, currentWhiteTokenIndex) && !squareElement.classList.contains('occupied')) {
                squareElement.click(); // Simulate AI clicking the square
            } else {
                console.error("AI attempted an invalid move to index:", aiMoveIndex, "Current:", currentWhiteTokenIndex, "Occupied:", squareElement ? squareElement.classList.contains('occupied') : 'N/A');
                setMessage("IA tentou uma jogada inválida. O jogo pode estar num estado inesperado.", true);
                // Potentially end game or declare human winner if AI makes illegal move.
                // For now, just log and message.
            }
            return encodeCurrentStateOnly(); // Return state *after* AI move (if successful)
        } catch (e) {
            console.error("Error during AI move execution:", e);
            setMessage("Erro ao executar a jogada da IA.", true);
            return encodedState; // Return state *before* AI attempt if error
        }
    }

    function decodeBigIntToGameState(encodedString) {
        try {
            const encodedState = BigInt(encodedString.trim());
            const decodedTokenIndex = Number((encodedState >> 58n) & 0x3Fn); // 6 bits for token index
            const decodedPlayerBit = Number((encodedState >> 56n) & 1n);   // 1 bit for player
            const decodedWidth = Number((encodedState >> 53n) & 0x7n);    // 3 bits for width
            const decodedHeight = Number((encodedState >> 50n) & 0x7n);   // 3 bits for height

            // Validate dimensions (4-7 as per UI, Wasm supports up to 7)
            if (decodedWidth < 4 || decodedWidth > 7 || decodedHeight < 4 || decodedHeight > 7) {
                setMessage(`Erro: Dimensões decodificadas (${decodedWidth}x${decodedHeight}) estão fora do intervalo suportado (4-7).`, true);
                return null;
            }

            const decodedTotalSquares = decodedWidth * decodedHeight;
            if (decodedTokenIndex < 0 || decodedTokenIndex >= decodedTotalSquares) {
                setMessage(`Erro: Índice do token decodificado (${decodedTokenIndex}) está fora dos limites para o tabuleiro ${decodedWidth}x${decodedHeight}.`, true);
                return null;
            }

            const boardState = [];
            for (let i = 0; i < decodedTotalSquares; i++) {
                boardState.push(((encodedState >> BigInt(i)) & 1n) === 1n);
            }
            return {
                tokenIndex: decodedTokenIndex,
                moveCountParity: decodedPlayerBit, // This is effectively moveCount % 2
                boardState,
                width: decodedWidth,
                height: decodedHeight
            };
        } catch (error) {
            console.error("Error decoding BigInt string:", error);
            setMessage(`Erro ao decodificar entrada: ${error.message}`, true);
            return null;
        }
    }

    function applyDecodedState(state, source = 'unknown') {
        if (!state) {
            setMessage("Falha ao decodificar ou aplicar estado.", true);
            return;
        }
        console.log("Aplicando estado decodificado para visualização de:", source, state);
        if (gameEndMessageElement) gameEndMessageElement.textContent = '';

        // Set global board dimensions from the loaded state
        boardWidth = state.width;
        boardHeight = state.height;

        // Update UI selectors to reflect the loaded state's dimensions
        if (boardWidthSelect) boardWidthSelect.value = boardWidth;
        if (boardHeightSelect) boardHeightSelect.value = boardHeight;

        // This will use the new boardWidth, boardHeight
        initGame(true); // true indicates it's called during a decode/load operation

        // Now apply the specific state details
        currentWhiteTokenIndex = state.tokenIndex;
        moveCount = state.moveCountParity; // If parity is 0, moveCount is 0 (P1's turn). If 1, moveCount is 1 (P2's turn).

        for (let i = 0; i < totalSquares; i++) { // totalSquares is now updated by initGame
            const squareElement = getSquareElementByIndex(i);
            if (!squareElement) continue;

            // Clear existing content (e.g., old number circles if board resized)
            // squareElement.innerHTML = ''; // initGame already does this.
            // Re-add number circles for the new board size (initGame does this)

            if (state.boardState[i]) { // If square was occupied in loaded state
                if (i === currentWhiteTokenIndex) continue; // White token is handled separately

                // If it's a goal square, the number circle takes precedence over a black token
                if (i === numberOneSquareIndex || i === numberTwoSquareIndex) {
                    console.warn(`Estado carregado queria token preto no objetivo ${i}. Círculo numérico exibido em vez disso.`);
                } else {
                    const blackToken = document.createElement('div');
                    blackToken.classList.add('token');
                    squareElement.appendChild(blackToken);
                    squareElement.classList.add('occupied');
                }
            }
        }

        // Place the white token
        const whiteTokenSquare = getSquareElementByIndex(currentWhiteTokenIndex);
        if (whiteTokenSquare) {
            if (whiteTokenSquare.querySelector('.number-circle')) whiteTokenSquare.innerHTML = ''; // Remove number if token lands on it
            const whiteToken = document.createElement('div');
            whiteToken.classList.add('white-token');
            whiteTokenSquare.appendChild(whiteToken);
            whiteTokenSquare.classList.remove('occupied'); // Ensure it's not marked as occupied
        } else {
            console.error("CRÍTICO: Falha ao encontrar quadrado para o índice do token branco decodificado:", currentWhiteTokenIndex);
            setMessage("Erro ao posicionar token branco do estado decodificado.", true);
        }

        updateGoalHighlight();
        gameActive = false; // Game is loaded for viewing, not active play
        updateControlsBasedOnGameState();

        let loadedStateInfo = `Exibindo estado: Tabuleiro ${boardWidth}x${boardHeight}. Vez do Jogador ${state.moveCountParity + 1}. `;
        // Check win/loss conditions for the loaded state
        if (state.tokenIndex === numberOneSquareIndex) loadedStateInfo += "Este era um estado de vitória para o Jogador 1. ";
        else if (state.tokenIndex === numberTwoSquareIndex) loadedStateInfo += "Este era um estado de vitória para o Jogador 2. ";
        else if (!canPlayerMove(state.tokenIndex, 'load_check')) {
            const losingPlayer = state.moveCountParity + 1;
            const winningPlayer = losingPlayer === 1 ? 2 : 1;
            loadedStateInfo += `Jogador ${losingPlayer} não tinha movimentos disponíveis neste estado (Jogador ${winningPlayer} ganharia). `;
        }
        loadedStateInfo += "Clique em 'Iniciar Novo Jogo' para jogar.";
        setMessage(loadedStateInfo, false);
        if (source === 'input' && movesTableBody) { // Clear history table if loading from manual input
            movesTableBody.innerHTML = '';
        }
    }

    function indexToCoords(index) {
        if (index < 0 || index >= totalSquares) return "N/A";
        // Row calculation: 0 is top row. Displayed as N, N-1, ..., 1
        const row = boardHeight - Math.floor(index / boardWidth);
        // Col calculation: 0 is 'a'.
        const col = index % boardWidth;
        const colChar = String.fromCharCode('a'.charCodeAt(0) + col);
        return `${colChar}${row}`;
    }

    function handleHistoricMoveCellClick() {
        if (gameActive) {
            setMessage("Termine ou reinicie o jogo atual para carregar do histórico.", true);
            return;
        }
        const stateToLoad = this.dataset.encodedState;
        if (stateToLoad) {
            setMessage("Carregando estado do histórico para visualização...", false);
            const decodedState = decodeBigIntToGameState(stateToLoad);
            applyDecodedState(decodedState, 'table-cell');
        } else {
            setMessage("Nenhum estado encontrado para esta jogada histórica.", true);
        }
    }

    function addMoveToTable(gameMoveNumber, player, coords, encodedState) {
        if (!movesTableBody) return;
        const tableRowNumber = Math.floor((gameMoveNumber - 1) / 2) + 1;
        let targetRow;
        let moveCell;

        if (player === 1) {
            targetRow = movesTableBody.insertRow();
            targetRow.insertCell(0).textContent = tableRowNumber;
            moveCell = targetRow.insertCell(1);
            targetRow.insertCell(2).textContent = ''; // Placeholder for P2
        } else {
            if (movesTableBody.rows.length > 0 &&
                movesTableBody.rows[movesTableBody.rows.length - 1].cells[0] &&
                movesTableBody.rows[movesTableBody.rows.length - 1].cells[0].textContent == tableRowNumber.toString()) {
                targetRow = movesTableBody.rows[movesTableBody.rows.length - 1];
            } else {
                targetRow = movesTableBody.insertRow(); // Should not happen if P1 always creates row
                targetRow.insertCell(0).textContent = tableRowNumber;
                targetRow.insertCell(1).textContent = '';
            }
            moveCell = targetRow.cells[2] || targetRow.insertCell(2);
        }

        if (moveCell) {
            moveCell.textContent = coords;
            moveCell.dataset.encodedState = encodedState.toString();
            moveCell.addEventListener('click', handleHistoricMoveCellClick);
        }
    }

    function handleSquareClick(event) {
        if (!gameActive) return;
        const clickedSquare = event.currentTarget;
        const clickedSquareIndex = parseInt(clickedSquare.dataset.squareNumber, 10);

        if (!isMoveAdjacent(clickedSquareIndex, currentWhiteTokenIndex)) return;
        if (clickedSquare.classList.contains('occupied')) return;

        const playerMakingTheMove = (moveCount % 2) + 1;
        const gameMoveNumberForTable = moveCount + 1;

        // --- Update board state ---
        // 1. Mark previous square as occupied (black token)
        const previousSquareElement = getSquareElementByIndex(currentWhiteTokenIndex);
        if (previousSquareElement) {
            previousSquareElement.innerHTML = ''; // Clear previous content (e.g. white token or number circle)
            // Do not place a black token if it's a goal square, number circle should remain
            if (!(currentWhiteTokenIndex === numberOneSquareIndex || currentWhiteTokenIndex === numberTwoSquareIndex)) {
                const blackToken = document.createElement('div');
                blackToken.classList.add('token');
                previousSquareElement.appendChild(blackToken);
            } else {
                // If it was a goal, re-add number circle if it was cleared
                addNumberCircle(previousSquareElement, currentWhiteTokenIndex === numberOneSquareIndex ? 1 : 2);
            }
            previousSquareElement.classList.add('occupied');
        }

        // 2. Move white token to new square
        clickedSquare.innerHTML = ''; // Clear content (e.g. number circle if it's a goal)
        const whiteToken = document.createElement('div');
        whiteToken.classList.add('white-token');
        clickedSquare.appendChild(whiteToken);
        clickedSquare.classList.remove('occupied'); // Ensure it's not marked occupied
        currentWhiteTokenIndex = clickedSquareIndex;

        moveCount++;

        const encodedStateForTable = encodeCurrentStateOnly();
        const moveCoords = indexToCoords(clickedSquareIndex);
        addMoveToTable(gameMoveNumberForTable, playerMakingTheMove, moveCoords, encodedStateForTable);
        updateGoalHighlight();

        if (checkWinCondition(currentWhiteTokenIndex)) return;

        if (!canPlayerMove(currentWhiteTokenIndex)) {
            gameActive = false;
            // The player who just moved (playerMakingTheMove) wins because opponent has no moves
            setGameEndMessage(`Encurralado! O jogador ${playerMakingTheMove} ganha!`);
            updateControlsBasedOnGameState();
            return;
        }

        // --- AI's turn? ---
        const nextPlayer = (moveCount % 2) + 1;
        let shouldAIPlay = false;
        if (selectedGameMode === 'player1_vs_ai' && nextPlayer === 2) shouldAIPlay = true;
        else if (selectedGameMode === 'player2_vs_ai' && nextPlayer === 1) shouldAIPlay = true;

        if (shouldAIPlay && gameActive) {
            // Disable board interaction briefly for AI move
            // gameBoardElement.style.pointerEvents = 'none';
            setTimeout(() => {
                encodeGameStateToBigIntAndPlayAI();
                // gameBoardElement.style.pointerEvents = 'auto';
            }, 100); // Short delay for UI update
        }
    }

    function initGame(calledDuringDecode = false) {
        if (!calledDuringDecode) {
            console.log("Initializing new game...");
            // boardWidth and boardHeight are already set from selectors by the New Game button click
        } else {
            console.log("Initializing board for state display/load...");
            // boardWidth and boardHeight are set by applyDecodedState before this is called
        }

        if (!gameBoardElement || !gameTitleElement) {
            console.error("CRITICAL: Game board or title element not found during init!");
            return;
        }

        updateGameConstants(); // Uses current boardWidth, boardHeight
        updateBoardLabels();   // Uses current boardWidth, boardHeight
        gameTitleElement.textContent = `Rastros ${boardWidth}x${boardHeight}`;

        if (!calledDuringDecode) {
            if (gameEndMessageElement) gameEndMessageElement.textContent = '';
            setMessage(`Novo jogo iniciado. Modo: ${selectedGameMode}, Dificuldade: ${currentGameDifficulty}. Vez do Jogador 1.`, false);
            if (encodedOutputDiv) encodedOutputDiv.textContent = '';
            if (decodeInputElement) decodeInputElement.value = '';
            if (movesTableBody) movesTableBody.innerHTML = ''; // Clear history table
        }

        gameBoardElement.innerHTML = ''; // Clear previous board
        gameBoardElement.style.gridTemplateColumns = `repeat(${boardWidth}, 1fr)`;
        gameBoardElement.style.gridTemplateRows = `repeat(${boardHeight}, 1fr)`;

        for (let i = 0; i < totalSquares; i++) {
            const square = document.createElement('div');
            square.classList.add('square');
            square.dataset.squareNumber = i; // Store index for easier access
            square.classList.remove('occupied');

            if (i === numberOneSquareIndex) addNumberCircle(square, 1);
            else if (i === numberTwoSquareIndex) addNumberCircle(square, 2);

            if (!calledDuringDecode) { // Only add click listeners for a new, playable game
                square.addEventListener('click', handleSquareClick);
            }
            gameBoardElement.appendChild(square);
        }

        if (!calledDuringDecode) {
            moveCount = 0;
            currentWhiteTokenIndex = initialWhiteTokenIndex; // Set by updateGameConstants
            gameActive = true;

            const startSquare = getSquareElementByIndex(initialWhiteTokenIndex);
            if (startSquare) {
                if (startSquare.querySelector('.number-circle')) startSquare.innerHTML = ''; // Clear number if starting on goal
                const whiteToken = document.createElement('div');
                whiteToken.classList.add('white-token');
                startSquare.appendChild(whiteToken);
                startSquare.classList.remove('occupied');
            } else {
                console.error("CRÍTICO: Não foi possível encontrar o quadrado inicial:", initialWhiteTokenIndex);
                gameActive = false;
                setGameEndMessage("Erro: Não foi possível posicionar o token inicial.");
                updateControlsBasedOnGameState();
                return;
            }

            updateGoalHighlight();

            if (!canPlayerMove(currentWhiteTokenIndex, 'init')) {
                gameActive = false;
                const winner = (moveCount % 2 === 0) ? 2 : 1; // If P1 (move 0) can't move, P2 wins.
                setGameEndMessage(`Sem movimentos iniciais disponíveis! Jogador ${winner} ganha por defeito!`);
            } else {
                console.log("Novo jogo ativo. Token branco em:", currentWhiteTokenIndex, "Contagem de jogadas:", moveCount);
            }

            updateControlsBasedOnGameState();

            if (selectedGameMode === 'player2_vs_ai' && gameActive) { // AI is Player 1
                setMessage(`Novo jogo. Vez do Jogador 1 (IA).`, false);
                setTimeout(() => { encodeGameStateToBigIntAndPlayAI(); }, 100);
            } else {
                setMessage(`Novo jogo. Vez do Jogador ${ (moveCount % 2) + 1 }.`, false);
            }
        }
    }

    // --- Event listeners for advanced/debug controls (if they exist) ---
    if (aiButton && encodedOutputDiv) {
        aiButton.addEventListener('click', () => {
            const state = encodeGameStateToBigIntAndPlayAI();
            if (state !== null && encodedOutputDiv) { // Check if AI move was attempted
                encodedOutputDiv.textContent = `Estado Atual (após tentativa da IA): ${encodeCurrentStateOnly().toString()}`;
            }
        });
    }

    if (decodeButton && decodeInputElement) {
        decodeButton.addEventListener('click', () => {
            if (gameActive) {
                setMessage("Por favor, termine ou reinicie o jogo atual antes de carregar um novo estado.", true);
                return;
            }
            const encodedString = decodeInputElement.value;
            if (!encodedString) {
                setMessage("Por favor, insira um valor de estado codificado para visualizar.", true);
                return;
            }
            setMessage("Decodificando estado para visualização...", false);
            const decodedState = decodeBigIntToGameState(encodedString);
            if (decodedState) {
                applyDecodedState(decodedState, 'input');
            } else {
                // decodeBigIntToGameState already sets error message
            }
        });
    }

    // Initial setup: Display board but game is not active until "New Game" is clicked.
    boardWidth = parseInt(boardWidthSelect.value, 10); // Get initial selected values
    boardHeight = parseInt(boardHeightSelect.value, 10);
    initGame(true); // Initialize for display, not playable.
    gameActive = false;
    updateControlsBasedOnGameState();
    setGameEndMessage("Clique em 'Iniciar Novo Jogo' para começar.");
    if (gameEndMessageElement) gameEndMessageElement.style.color = 'initial'; // Reset color

}); // End of DOMContentLoaded listener
