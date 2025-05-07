document.addEventListener('DOMContentLoaded', function() {

    // --- Game Configuration & State ---
    const boardSize = 7;
    const totalSquares = boardSize * boardSize; // 49
    const numberOneSquareIndex = 42; // Bottom-left goal (Row 1, Col a)
    const numberTwoSquareIndex = 6;  // Top-right goal (Row 7, Col g)
    const initialWhiteTokenIndex = 18; // Default starting pos (Row 5, Col e - 0-indexed: row 2, col 4)

    let gameBoardElement;
    let currentWhiteTokenIndex;
    let gameActive;
    let moveCount;

    let moveHistory = []; // Array para guardar o histórico de jogadas
    let movesTableBody;   // Referência ao tbody da tabela

    let jogoModuleInstance = null; // To hold the Wasm module instance

    // Obter referências aos elementos do DOM que podem ser usados antes da inicialização completa
    const aiButton = document.getElementById('encode-button'); // Renomeado de runAiButton para corresponder ao HTML
    const messageOutput = document.getElementById('decode-message'); // Usado para mensagens de erro/status

    if(aiButton) aiButton.disabled = true; // Desabilitar botão da IA até o módulo carregar

    // The EXPORT_NAME we used was "createJogoModule"
    // This creates a Promise that resolves with the module instance.
    if (typeof createJogoModule === "function") {
        createJogoModule()
            .then(instance => {
                jogoModuleInstance = instance;
                console.log("Jogo Wasm Module Initialized!");
                if(aiButton) aiButton.disabled = false;
                if(messageOutput) messageOutput.textContent = ""; // Limpar mensagem de carregamento
            })
            .catch(err => {
                console.error("Error initializing Jogo Wasm Module:", err);
                if(messageOutput) messageOutput.textContent = "Failed to load Wasm module. Check console. Details: " + err;
            });
    } else {
        console.error("createJogoModule is not defined. Ensure jogo_module.js is loaded correctly.");
        if(messageOutput) messageOutput.textContent = "Error: Jogo module script not found.";
    }


    // --- Helper Function: Get Square Element by Index ---
    function getSquareElementByIndex(index) {
        if (index < 0 || index >= totalSquares) {
            return null;
        }
        if (!gameBoardElement) {
            gameBoardElement = document.getElementById('game-board');
            if (!gameBoardElement) return null;
        }
        return gameBoardElement.querySelector(`.square[data-square-number="${index}"]`);
    }

    // --- Helper: Add Number Circle to a Square ---
    function addNumberCircle(squareElement, number) {
        if (!squareElement) return;
        squareElement.innerHTML = '';
        const numberCircle = document.createElement('div');
        numberCircle.classList.add('number-circle', `number-${number}`);
        numberCircle.textContent = number.toString();
        squareElement.appendChild(numberCircle);
    }

    // --- Helper: Display Decode Status/Error Messages ---
    function setMessage(message, isError = false) {
        const messageDiv = document.getElementById('decode-message');
        if (messageDiv) {
            messageDiv.textContent = message;
            messageDiv.style.color = isError ? 'red' : 'green';
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

    // --- Helper Function: Check for Win Condition (Reaching Goal) ---
    function checkWinCondition(currentIndex) {
        let winner = null;
        if (currentIndex === numberOneSquareIndex) {
            winner = 1;
        } else if (currentIndex === numberTwoSquareIndex) {
            winner = 2;
        }

        if (winner !== null) {
            gameActive = false;
            setTimeout(() => {
                alert(`Jogador ${winner} ganhou!`);
                initGame();
            }, 100);
            return true;
        }
        return false;
    }

    // --- Helper Function: Check if any valid moves exist from current position ---
    function canPlayerMove(currentIndex, context = "move") {
        let foundValidMove = false;
        if (context === 'init') console.log(`canPlayerMove called from init for index ${currentIndex}`);

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
                    let isOccupied = targetSquareElement ? targetSquareElement.classList.contains('occupied') : 'N/A';
                    if (context === 'init') console.log(`  Checking neighbour ${targetIndex}: Exists=${!!targetSquareElement}, Occupied=${isOccupied}`);
                    if (targetSquareElement && !targetSquareElement.classList.contains('occupied')) {
                        if (context === 'init') console.log(`  FOUND VALID MOVE at ${targetIndex}`);
                        foundValidMove = true;
                        break;
                    }
                }
            }
            if (foundValidMove) break;
        }
        if (context === 'init' && !foundValidMove) {
            console.error(`canPlayerMove (init): Did NOT find any valid moves for index ${currentIndex}!`);
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

        if (gameActive) {
            if (moveCount % 2 === 0) {
                if (numberCircle1) numberCircle1.classList.add('highlighted-goal');
            } else {
                if (numberCircle2) numberCircle2.classList.add('highlighted-goal');
            }
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


    // --- Encoding Function (User's Specified Layout, includes AI move) ---
    function encodeGameStateToBigIntAndPlayAI() {
        if (!jogoModuleInstance) {
            setMessage("Módulo do jogo não carregado. Jogada da IA não disponível.", true);
            return null; // Retornar null ou um valor que indique falha
        }
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
        const currentPlayerBit = BigInt(moveCount % 2);
        encodedState |= (currentPlayerBit << 56n);
        const tokenPosition = BigInt(currentWhiteTokenIndex);
        encodedState |= (tokenPosition << 58n);

        try {
            const aiMoveIndex = jogoModuleInstance._jogadaSite(encodedState, 50); // Call via instance
            console.log(`AI decided to move to square index: ${aiMoveIndex}`);

            const squareElement = getSquareElementByIndex(aiMoveIndex);
            if (squareElement && isMoveAdjacent(aiMoveIndex, currentWhiteTokenIndex) && !squareElement.classList.contains('occupied')) {
                // Simular clique para executar a jogada da IA
                // Precisamos garantir que a jogada da IA também é adicionada à tabela
                // Temporariamente, vamos assumir que o clique fará isso, mas pode precisar de ajuste
                // para distinguir entre jogada humana e IA na tabela
                squareElement.click(); // This will trigger handleSquareClick
            } else {
                console.error("AI attempted an invalid move to index:", aiMoveIndex);
                setMessage("IA tentou uma jogada inválida. O jogo pode estar num estado inesperado.", true);
                // Se a IA faz uma jogada inválida, o jogo pode ficar bloqueado ou o turno não passar.
                // Considerar como lidar com isso. Por agora, o jogo continua com o jogador atual.
            }
            return encodeCurrentStateOnly(); // Retorna o estado APÓS a jogada da IA
        } catch (e) {
            console.error("Error during AI move execution:", e);
            setMessage("Erro ao executar a jogada da IA.", true);
            return encodedState; // Retorna o estado antes da tentativa da IA
        }
    }

    // --- Decoding Function (Extracts data from BigInt) ---
    function decodeBigIntToGameState(encodedString) {
        try {
            const encodedState = BigInt(encodedString.trim());
            const tokenIndex = Number((encodedState >> 58n) & 63n);
            const playerBit = Number((encodedState >> 56n) & 1n);
            const width = Number((encodedState >> 53n) & 7n);
            const height = Number((encodedState >> 50n) & 7n);

            if (width !== 7 || height !== 7) {
                console.warn(`Decoded dimensions are ${width}x${height}, expected 7x7.`);
            }
            if (tokenIndex < 0 || tokenIndex >= totalSquares) {
                console.error(`Decoded token index ${tokenIndex} is out of bounds.`);
                setMessage(`Error: Decoded token index ${tokenIndex} is out of bounds.`, true);
                return null;
            }

            const boardState = [];
            for (let i = 0; i < totalSquares; i++) {
                const bitIsSet = ((encodedState >> BigInt(i)) & 1n) === 1n;
                boardState.push(bitIsSet);
            }
            const decodedMoveCount = playerBit; // This is just player turn (0 or 1)

            return {
                tokenIndex: tokenIndex,
                moveCountParity: decodedMoveCount, // Usar isto para definir o moveCount corretamente
                boardState: boardState
            };

        } catch (error) {
            console.error("Error decoding BigInt string:", error);
            setMessage(`Error decoding input: ${error.message}`, true);
            return null;
        }
    }

    // --- Function to Apply Decoded State to Board ---
    function applyDecodedState(state, source = 'unknown') {
        if (!state) {
            return;
        }
        console.log("Applying decoded state from:", source, state);

        if (source === 'input') { // Limpa histórico e tabela apenas se veio do input de texto
            moveHistory = [];
            if (movesTableBody) {
                movesTableBody.innerHTML = '';
            } else {
                // Tenta obter o movesTableBody se ainda não estiver definido
                movesTableBody = document.getElementById('moves-table')?.getElementsByTagName('tbody')[0];
                if (movesTableBody) movesTableBody.innerHTML = '';
            }
        }

        initGame(true); // Passa flag para comportamento modificado durante a descodificação

        currentWhiteTokenIndex = state.tokenIndex;
        // Ajustar moveCount para refletir o jogador correto e o highlight
        // Se state.moveCountParity é 0, é a vez do Jogador 1 (moveCount deve ser par)
        // Se state.moveCountParity é 1, é a vez do Jogador 2 (moveCount deve ser ímpar)
        moveCount = state.moveCountParity; // Isto fará o highlight correto.
                                           // O número da jogada na tabela pode não ser recriado
                                           // apenas com esta info, a tabela é uma sequência.

        const defaultWhiteSquare = getSquareElementByIndex(initialWhiteTokenIndex);
        if (defaultWhiteSquare && initialWhiteTokenIndex !== currentWhiteTokenIndex) {
            if (defaultWhiteSquare.querySelector('.white-token')) {
                defaultWhiteSquare.innerHTML = '';
                if (initialWhiteTokenIndex === numberOneSquareIndex) addNumberCircle(defaultWhiteSquare, 1);
                else if (initialWhiteTokenIndex === numberTwoSquareIndex) addNumberCircle(defaultWhiteSquare, 2);
            }
        }

        for (let i = 0; i < totalSquares; i++) {
            if (state.boardState[i]) {
                if (i === numberOneSquareIndex || i === numberTwoSquareIndex) {
                    console.warn(`Decoded state indicated black token on goal square ${i}. Skipping.`);
                    continue;
                }
                if (i === currentWhiteTokenIndex) {
                    console.warn(`Decoded state indicated black token on white token square ${i}. Skipping.`);
                    const squareElement = getSquareElementByIndex(i);
                    if(squareElement) squareElement.innerHTML = '';
                    continue;
                }
                const squareElement = getSquareElementByIndex(i);
                if (squareElement) {
                    squareElement.innerHTML = '';
                    const blackToken = document.createElement('div');
                    blackToken.classList.add('token');
                    squareElement.appendChild(blackToken);
                    squareElement.classList.add('occupied');
                }
            }
        }

        const whiteTokenSquare = getSquareElementByIndex(currentWhiteTokenIndex);
        if (whiteTokenSquare) {
            whiteTokenSquare.innerHTML = '';
            const whiteToken = document.createElement('div');
            whiteToken.classList.add('white-token');
            whiteTokenSquare.appendChild(whiteToken);
            whiteTokenSquare.classList.remove('occupied');
        } else {
            console.error("CRITICAL: Failed to find square for decoded white token index:", currentWhiteTokenIndex);
            setMessage("Error placing white token from decoded state.", true);
            gameActive = false;
            return;
        }

        updateGoalHighlight();
        gameActive = true;
        setMessage("Game state loaded successfully.", false);

        if (!canPlayerMove(currentWhiteTokenIndex)) {
            const winner = (moveCount % 2 === 0) ? 2 : 1;
            gameActive = false;
            console.warn("Loaded state has no available moves!");
            setTimeout(() => {
                alert(`Loaded state has no moves available! Number ${winner} wins!`);
                initGame();
            }, 100);
        } else {
            console.log("Decoded state loaded. White token at:", currentWhiteTokenIndex, "Move count parity:", state.moveCountParity);
        }
    }

    // --- Helper Function: Convert Index to Algebraic Coordinates ---
    function indexToCoords(index) {
        if (index < 0 || index >= totalSquares) return "N/A";
        const row = boardSize - 1 - Math.floor(index / boardSize); // 0-6, para display (0=linha '1')
        const col = index % boardSize;                             // 0-6
        const colChar = String.fromCharCode('a'.charCodeAt(0) + col);
        return `${colChar}${row + 1}`;
    }

    // --- Helper Function: Add Move to Table and History ---
    function addMoveToTable(moveNumber, player, coords, encodedState) {
        if (!movesTableBody) {
            movesTableBody = document.getElementById('moves-table')?.getElementsByTagName('tbody')[0];
            if (!movesTableBody) {
                console.error("Moves table body not found!");
                return;
            }
        }

        const newRow = movesTableBody.insertRow();
        newRow.insertCell(0).textContent = moveNumber;
        newRow.insertCell(1).textContent = player;
        newRow.insertCell(2).textContent = coords;
        const stateCell = newRow.insertCell(3);
        stateCell.textContent = encodedState.toString();

        newRow.dataset.encodedState = encodedState.toString();

        newRow.addEventListener('click', function() {
            const stateToLoad = this.dataset.encodedState;
            if (stateToLoad) {
                setMessage("A carregar estado da tabela...", false);
                const decodedState = decodeBigIntToGameState(stateToLoad);
                applyDecodedState(decodedState, 'table'); // Source: 'table'
            }
        });

        moveHistory.push({ moveNumber, player, coords, encodedState });
    }


    // --- Function to Handle Clicks on Squares ---
    function handleSquareClick(event) {
        if (!gameActive) return;

        const clickedSquare = event.currentTarget;
        const clickedSquareIndex = parseInt(clickedSquare.dataset.squareNumber, 10);

        if (!isMoveAdjacent(clickedSquareIndex, currentWhiteTokenIndex)) {
            return;
        }
        if (clickedSquare.classList.contains('occupied')) {
            return;
        }

        const playerMakingTheMove = (moveCount % 2) + 1;
        // O número da jogada é incrementado para cada par de movimentos (1 para P1, 1 para P2 = 1 jogada completa)
        // Ou, se preferir que cada movimento individual seja um "número de jogada":
        const gameMoveNumber = moveCount + 1; // Cada movimento do token branco é uma "jogada"
        // Se quiser que "Nº Jogada" na tabela seja (P1 move, P2 move) = 1 jogada,
        // então seria Math.floor(moveCount / 2) + 1; e só para P1.
        // Vou usar a abordagem mais simples onde cada movimento do token é uma entrada.
        // O 'currentMoveNumber' usado em addMoveToTable pode ser este gameMoveNumber.

        const moveCoords = indexToCoords(clickedSquareIndex);

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
        moveCount++; // Incrementar após determinar o jogador que fez a jogada

        // O estado codificado é APÓS esta jogada do jogador atual
        const encodedStateForTable = encodeCurrentStateOnly();
        addMoveToTable(gameMoveNumber, playerMakingTheMove, moveCoords, encodedStateForTable);

        updateGoalHighlight();

        if (checkWinCondition(currentWhiteTokenIndex)) {
            return;
        }

        if (!canPlayerMove(currentWhiteTokenIndex)) {
            gameActive = false;
            const winner = (moveCount % 2 === 0) ? 2 : 1; // O jogador que DEVERIA jogar está preso
            setTimeout(() => {
                alert(`Encurralado! O jogador ${winner} ganha!`);
                initGame();
            }, 100);
            return;
        }
    }

    // --- Function to Initialize or Reset the Game ---
    function initGame(calledDuringDecode = false) {
        if (!calledDuringDecode) {
            console.log("Initializing game for new round...");
            setMessage("");
            const outputDiv = document.getElementById('encoded-output');
            if(outputDiv) outputDiv.textContent = '';
            const inputField = document.getElementById('decode-input');
            if(inputField) inputField.value = '';

            moveHistory = [];
            if (movesTableBody) {
                movesTableBody.innerHTML = '';
            } else {
                movesTableBody = document.getElementById('moves-table')?.getElementsByTagName('tbody')[0];
                if (movesTableBody) movesTableBody.innerHTML = '';
            }
        } else {
            console.log("Initializing board structure during decode...");
        }

        gameBoardElement = document.getElementById('game-board');
        if (!gameBoardElement) { // Adicionado para evitar erros se o elemento não for encontrado
            console.error("Game board element not found!");
            return;
        }
        gameBoardElement.innerHTML = '';

        for (let i = 0; i < totalSquares; i++) {
            const square = document.createElement('div');
            square.classList.add('square');
            square.dataset.squareNumber = i;
            square.innerHTML = '';
            square.classList.remove('occupied');
            if (i === numberOneSquareIndex) addNumberCircle(square, 1);
            else if (i === numberTwoSquareIndex) addNumberCircle(square, 2);
            square.addEventListener('click', handleSquareClick);
            gameBoardElement.appendChild(square);
        }

        if (!calledDuringDecode) {
            gameActive = true;
            moveCount = 0;
            currentWhiteTokenIndex = initialWhiteTokenIndex;

            const startSquare = getSquareElementByIndex(initialWhiteTokenIndex);
            if(startSquare){
                startSquare.innerHTML = '';
                const whiteToken = document.createElement('div');
                whiteToken.classList.add('white-token');
                startSquare.appendChild(whiteToken);
                startSquare.classList.remove('occupied');
            } else {
                console.error("CRITICAL: Could not find initial start square", initialWhiteTokenIndex);
                gameActive = false;
                return;
            }
            updateGoalHighlight();
            if (!canPlayerMove(currentWhiteTokenIndex, 'init')) {
                gameActive = false;
                const winner = 2;
                console.error("Game cannot start! No initial moves available.");
                setTimeout(() => {
                    alert(`No initial moves available! Number ${winner} wins!`);
                    initGame();
                }, 100);
            } else {
                console.log("Game initialized. White token at:", currentWhiteTokenIndex, "Move count:", moveCount);
            }
        }
    }

    // --- Event Listeners Setup ---

    // Botão "Efetuar jogada da IA" (anteriormente encode-button)
    const AImoveButton = document.getElementById('encode-button'); // Este é o botão da IA
    const outputDiv = document.getElementById('encoded-output');
    if (AImoveButton && outputDiv) {
        AImoveButton.addEventListener('click', () => {
            if (!gameActive && moveCount > 0) {
                // Permitir se o jogo terminou mas queremos ver a sugestão da IA (embora possa não ser útil)
            } else if (!gameActive) {
                outputDiv.textContent = "Jogo não iniciado ou já reiniciado.";
                return;
            }
            if (!jogoModuleInstance) {
                outputDiv.textContent = "Módulo da IA não está pronto.";
                return;
            }

            // A jogada da IA vai acionar handleSquareClick, que por sua vez vai:
            // 1. Atualizar o tabuleiro
            // 2. Incrementar moveCount
            // 3. Adicionar à tabela a jogada da IA através do encodeCurrentStateOnly()
            // 4. Checar condições de vitória/bloqueio
            // A função encodeGameStateToBigIntAndPlayAI agora lida com a chamada da IA e o clique.
            // O estado retornado é APÓS a jogada da IA (se bem sucedida).
            const stateAfterAIMove = encodeGameStateToBigIntAndPlayAI();

            if (stateAfterAIMove !== null) {
                // A tabela já foi atualizada por handleSquareClick (acionado pelo .click() dentro de encodeGameStateToBigIntAndPlayAI)
                // Apenas mostrar o estado codificado, se necessário.
                outputDiv.textContent = `Encoded (Dec) after AI: ${stateAfterAIMove.toString()}\n`;
                outputDiv.textContent += `Encoded (Bin) after AI: ${stateAfterAIMove.toString(2).padStart(64, '0')}`;
                console.log("Encoded Game State after AI move:", stateAfterAIMove);
            } else {
                outputDiv.textContent = "Falha ao processar jogada da IA ou módulo não carregado.";
            }
        });
    } else {
        console.error("Could not find AI Move button or output div.");
    }

    // Decode Button
    const decodeButton = document.getElementById('decode-button');
    const decodeInput = document.getElementById('decode-input');
    if (decodeButton && decodeInput) {
        decodeButton.addEventListener('click', () => {
            const encodedString = decodeInput.value;
            if (!encodedString) {
                setMessage("Please enter an encoded state value.", true);
                return;
            }
            setMessage("Decoding...", false);
            const decodedState = decodeBigIntToGameState(encodedString);
            applyDecodedState(decodedState, 'input'); // Source: 'input'
        });
    } else {
        console.error("Could not find Decode button or input field.");
    }

    // --- Start the game when the page loads ---
    initGame(); // Perform initial setup for a new game

}); // End of DOMContentLoaded listener