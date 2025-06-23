document.addEventListener('DOMContentLoaded', function() {

    // --- Configuração e Estado do Jogo ---
    let boardWidth = 7; // Largura padrão
    let boardHeight = 7; // Altura padrão
    let totalSquares = boardWidth * boardHeight;
    let numberOneSquareIndex; // Objetivo do Jogador 1 (canto inferior esquerdo)
    let numberTwoSquareIndex; // Objetivo do Jogador 2 (canto superior direito)
    let initialWhiteTokenIndex;

    let gameBoardElement;
    let rowLabelsDiv, colLabelsDiv;
    let gameTitleElement;
    let currentWhiteTokenIndex;
    let gameActive;
    let moveCount;
    let isPlacingStartingPiece = false; // Novo estado para a colocação da peça inicial

    let movesTableBody;
    let jogoModuleInstance = null;

    // Referências a elementos DOM
    let aiButton, decodeButton; // Para controlos avançados/depuração
    let messageOutput;
    let gameEndMessageElement;
    let encodedOutputDiv;
    let decodeInputElement;
    let newGameButtonElement;
    let movesTableElement;
    let gameValueSlider;
    let difficultyWarning;
    let currentSliderValueDisplay;
    let gameModeRadios;
    let boardSizeSelect;
    let movesAreaElement;
    let jogadaIAButtonElement;
    let resultsTableBody;

    let selectedGameMode = 'player1_vs_ai';
    let currentGameDifficulty = 1;
    let resultsData = {};

    function initializeModal() {
        const modal = document.getElementById("instructions-modal");
        const btn = document.getElementById("instructions-button");
        const span = document.getElementsByClassName("close-button")[0];

        if (!modal || !btn || !span) {
            console.error("Elementos do modal não encontrados!");
            return;
        }

        btn.onclick = function() {
            modal.style.display = "block";
        }

        span.onclick = function() {
            modal.style.display = "none";
        }

        window.onclick = function(event) {
            if (event.target == modal) {
                modal.style.display = "none";
            }
        }
    }

    // --- Gestão de Cookies e Resultados ---

    function setCookie(name, value, days) {
        let expires = "";
        if (days) {
            let date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = "; expires=" + date.toUTCString();
        }
        document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax";
    }

    function getCookie(name) {
        let nameEQ = name + "=";
        let ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) == ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }

    function renderResultsTable() {
        if (!resultsTableBody) return;
        resultsTableBody.innerHTML = '';

        const sortedBoardSizes = Object.keys(resultsData).sort((a, b) => {
            const [aW, aH] = a.split('x').map(Number);
            const [bW, bH] = b.split('x').map(Number);
            if (aW !== bW) return aW - bW;
            return aH - bH;
        });

        for (const boardSize of sortedBoardSizes) {
            const row = resultsTableBody.insertRow();
            row.insertCell(0).textContent = boardSize;
            const sizeData = resultsData[boardSize];

            for (let i = 1; i <= 10; i++) {
                const cell = row.insertCell(i);
                const difficultyKey = i.toString();
                const difficultyData = sizeData[difficultyKey] || {
                    asPlayer1: { wins: 0, losses: 0 },
                    asPlayer2: { wins: 0, losses: 0 }
                };

                const p1Stats = difficultyData.asPlayer1;
                const p2Stats = difficultyData.asPlayer2;

                cell.innerHTML =
                    `<span class="result-line">1: ${p1Stats.wins}/${p1Stats.losses}</span>` +
                    `<span class="result-line">2: ${p2Stats.wins}/${p2Stats.losses}</span>`;
            }
        }
    }

    function recordResult(winner) {
        if (selectedGameMode === 'two_players') return;

        const boardSizeKey = `${boardWidth}x${boardHeight}`;
        const difficultyKey = currentGameDifficulty.toString();

        if (!resultsData[boardSizeKey]) {
            resultsData[boardSizeKey] = {};
        }
        if (!resultsData[boardSizeKey][difficultyKey]) {
            resultsData[boardSizeKey][difficultyKey] = {
                asPlayer1: { wins: 0, losses: 0 },
                asPlayer2: { wins: 0, losses: 0 }
            };
        }

        const stats = resultsData[boardSizeKey][difficultyKey];

        if (selectedGameMode === 'player1_vs_ai') {
            if (winner === 1) {
                stats.asPlayer1.wins++;
            } else {
                stats.asPlayer1.losses++;
            }
        } else if (selectedGameMode === 'player2_vs_ai') {
            if (winner === 2) {
                stats.asPlayer2.wins++;
            } else {
                stats.asPlayer2.losses++;
            }
        }

        setCookie("rastrosResults_v2", JSON.stringify(resultsData), 365);
        renderResultsTable();
    }


    // Lógica para desativar modos de IA para tabuleiros
    function updateAiSupport(width, height) {
        let w = width;
        let h = height;

        if (w === undefined || h === undefined) {
            if (!boardSizeSelect || boardSizeSelect.value === 'custom') return;
            const dims = boardSizeSelect.value.split('x');
            w = parseInt(dims[0], 10);
            h = parseInt(dims[1], 10);
        }

        const isAiSupported = w <= 10 && h <= 10;

        const p1VsAiRadio = document.getElementById('player1_vs_ai');
        const p2VsAiRadio = document.getElementById('player2_vs_ai');
        const twoPlayersRadio = document.getElementById('two_players');

        if (p1VsAiRadio) p1VsAiRadio.disabled = !isAiSupported;
        if (p2VsAiRadio) p2VsAiRadio.disabled = !isAiSupported;

        if (!isAiSupported && (p1VsAiRadio.checked || p2VsAiRadio.checked)) {
            if (twoPlayersRadio) {
                twoPlayersRadio.checked = true;
                selectedGameMode = 'two_players';
            }
        }
    }


    // Inicializar elementos DOM
    function initializeDomElements() {
        gameTitleElement = document.getElementById('game-title');
        gameBoardElement = document.getElementById('game-board');
        rowLabelsDiv = document.getElementById('row-labels');
        colLabelsDiv = document.getElementById('col-labels');

        aiButton = document.getElementById('encode-button');
        decodeButton = document.getElementById('decode-button');
        messageOutput = document.getElementById('decode-message');
        gameEndMessageElement = document.getElementById('game-end-message');
        encodedOutputDiv = document.getElementById('encoded-output');
        decodeInputElement = document.getElementById('decode-input');

        newGameButtonElement = document.getElementById('new-game-button');
        movesTableElement = document.getElementById('moves-table');
        movesTableBody = movesTableElement?.getElementsByTagName('tbody')[0];
        movesAreaElement = document.getElementById('moves-area');
        jogadaIAButtonElement = document.getElementById('usar_ia');

        gameValueSlider = document.getElementById('game-value-slider');
        currentSliderValueDisplay = document.getElementById('current-slider-value');
        difficultyWarning= document.getElementById('difficulty-warning');
        gameModeRadios = document.querySelectorAll('input[name="game_mode"]');

        boardSizeSelect = document.getElementById('board-size-select');
        if (boardSizeSelect) {
            boardSizeSelect.addEventListener('change', () => updateAiSupport());
        }

        resultsTableBody = document.getElementById('results-table')?.getElementsByTagName('tbody')[0];
    }

    initializeDomElements();
    initializeModal();

    const savedResults = getCookie("rastrosResults_v2");
    if (savedResults) {
        try {
            resultsData = JSON.parse(savedResults);
        } catch (e) {
            console.error("Could not parse results cookie:", e);
            resultsData = {};
        }
    }
    renderResultsTable();


    updateAiSupport(); // Correr a verificação inicial no carregamento


    jogadaIAButtonElement.addEventListener('click', () => {
        encodeGameStateToBigIntAndPlayAI();
    });

    // Converte coordenadas (ex: a1, c4) para o índice do tabuleiro
// Event Listeners
    if (newGameButtonElement) {
        newGameButtonElement.addEventListener('click', () => {
            currentGameDifficulty = parseInt(gameValueSlider.value, 10);
            const sizeValue = boardSizeSelect.value;
            const dims = sizeValue.split('x');
            boardWidth = parseInt(dims[0], 10);
            boardHeight = parseInt(dims[1], 10);

            updateGameConstants();

            if (selectedGameMode === 'two_players' && boardSizeSelect.value!=="7x7") {
                //alert(boardSizeSelect.value);
                // Inicia o jogo em modo de configuração, sem a peça branca
                initGame(false, true);
                // Mostra a instrução para colocar a peça
                setGameEndMessage("Colocar a peça branca em casa acordada entre os dois jogadores");
            } else {
                // Início normal para modos contra IA
                initGame();
            }
        });
    } else {
        console.error('Botão Novo Jogo não encontrado!');
    }



    if (gameValueSlider && currentSliderValueDisplay) {
        gameValueSlider.addEventListener('input', () => {
            currentSliderValueDisplay.textContent = gameValueSlider.value;
            currentGameDifficulty = parseInt(gameValueSlider.value, 10);
        });
        gameValueSlider.addEventListener('input', () => {
            if (gameValueSlider.value === '10') {
                difficultyWarning.style.display = 'block';
            } else {
                difficultyWarning.style.display = 'none';
            }
        });
    }

    gameModeRadios.forEach(radio => {
        if (radio.checked) selectedGameMode = radio.value;
        radio.addEventListener('change', (event) => {
            selectedGameMode = event.target.value;
        });
    });

    // Inicialização do Módulo Wasm
    if (typeof createJogoModule === "function") {
        createJogoModule()
            .then(instance => {
                jogoModuleInstance = instance;
                if (messageOutput) messageOutput.textContent = "Módulo Wasm carregado.";
                updateControlsBasedOnGameState();
            })
            .catch(err => {
                console.error("Erro ao inicializar Módulo Jogo Wasm:", err);
                if (messageOutput) messageOutput.textContent = "Falha ao carregar módulo Wasm. Verifique a consola.";
                updateControlsBasedOnGameState();
            });
    } else {
        console.error("createJogoModule não está definido. Garanta que jogo_module.js foi carregado corretamente.");
        if (messageOutput) messageOutput.textContent = "Erro: Script do módulo Jogo não encontrado.";
        updateControlsBasedOnGameState();
    }

    function updateGameConstants() {
        totalSquares = boardWidth * boardHeight;
        numberOneSquareIndex = (boardHeight - 1) * boardWidth;
        numberTwoSquareIndex = (0) + (boardWidth - 1);

        if (boardWidth === 7 && boardHeight === 7) {
            initialWhiteTokenIndex = 18;
        } else {
            initialWhiteTokenIndex = 0;
        }
    }

    function updateBoardLabels() {
        if (!rowLabelsDiv || !colLabelsDiv) return;
        rowLabelsDiv.innerHTML = '';
        for (let i = 0; i < boardHeight; i++) {
            const span = document.createElement('span');
            span.textContent = boardHeight - i;
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
        const isGameInProgress = gameActive || isPlacingStartingPiece;
        const isPlayable = gameActive && jogoModuleInstance;

        if (aiButton) aiButton.disabled = !isPlayable || selectedGameMode === 'two_players';

        if (movesTableElement) {
            movesTableElement.classList.toggle('table-interaction-disabled', isGameInProgress);
        }
        if (gameValueSlider) gameValueSlider.disabled = isGameInProgress;
        if (boardSizeSelect) boardSizeSelect.disabled = isGameInProgress;

        gameModeRadios.forEach(radio => { radio.disabled = isGameInProgress; });
    }

    function setGameEndMessage(message) {
        if (gameEndMessageElement) {
            gameEndMessageElement.textContent = message;
        }
    }

    function getSquareElementByIndex(index) {
        if (index < 0 || index >= totalSquares || !gameBoardElement) return null;
        return gameBoardElement.querySelector(`.square[data-square-number="${index}"]`);
    }

    function addNumberCircle(squareElement, number) {
        if (!squareElement) return;
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
        }
    }

    function isMoveAdjacent(targetIndex, currentIndex) {
        if (targetIndex < 0 || targetIndex >= totalSquares) return false;
        if (targetIndex === currentIndex) return false;

        const currentRow = Math.floor(currentIndex / boardWidth);
        const currentCol = currentIndex % boardWidth;
        const targetRow = Math.floor(targetIndex / boardWidth);
        const targetCol = targetIndex % boardWidth;

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
            recordResult(winner);
            updateControlsBasedOnGameState();
            return true;
        }
        return false;
    }

    function canPlayerMove(currentIndex) {
        for (let r_offset = -1; r_offset <= 1; r_offset++) {
            for (let c_offset = -1; c_offset <= 1; c_offset++) {
                if (r_offset === 0 && c_offset === 0) continue;

                const currentSquareRow = Math.floor(currentIndex / boardWidth);
                const currentSquareCol = currentIndex % boardWidth;
                const targetRow = currentSquareRow + r_offset;
                const targetCol = currentSquareCol + c_offset;

                if (targetRow >= 0 && targetRow < boardHeight && targetCol >= 0 && targetCol < boardWidth) {
                    const targetIndex = targetRow * boardWidth + targetCol;
                    const targetSquareElement = getSquareElementByIndex(targetIndex);
                    if (targetSquareElement && !targetSquareElement.classList.contains('occupied')) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    function updateGoalHighlight() {
        const goalSquare1 = getSquareElementByIndex(numberOneSquareIndex);
        const goalSquare2 = getSquareElementByIndex(numberTwoSquareIndex);
        const numberCircle1 = goalSquare1 ? goalSquare1.querySelector('.number-circle') : null;
        const numberCircle2 = goalSquare2 ? goalSquare2.querySelector('.number-circle') : null;

        if (numberCircle1) numberCircle1.classList.remove('highlighted-goal');
        if (numberCircle2) numberCircle2.classList.remove('highlighted-goal');

        if (!gameActive) return;

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
        //encodedState |= (BigInt(boardHeight) << 51n);
        //encodedState |= (BigInt(boardWidth) << 54n);
        const currentPlayerBit = BigInt(moveCount % 2);
        encodedState |= (currentPlayerBit << 57n);
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
        //let isAITurn = false;
        //if (selectedGameMode === 'player1_vs_ai' && currentPlayer === 2) isAITurn = true;
        //else if (selectedGameMode === 'player2_vs_ai' && currentPlayer === 1) isAITurn = true;

        const encodedState = encodeCurrentStateOnly();
        //Transforma a dificuldade selecionada numa dificuldade para chamar a IA, usando uma função que distribua os 10 níveis em graus crescentes de dificuldade
        //const dificuldade = 2 + (currentGameDifficulty - 1) * 5;
        const niveis= [2, 3, 4, 5, 6,7,8,10,12,56];
        const dificuldade = niveis[currentGameDifficulty -1];
        let tempo;
        if (currentGameDifficulty===10) {
            tempo=2000;
        }
        else {
            tempo=1000;
        }

        try {
            const aiMoveIndex = jogoModuleInstance._jogadaSite(encodedState, dificuldade, boardHeight, boardWidth, tempo);
            //alert (dificuldade);
            //alert(encodedState);
            //const aiMoveIndex = jogoModuleInstance._jogadaSite(encodedState, dificuldade, 5, 5);

            const squareElement = getSquareElementByIndex(aiMoveIndex);
            if (squareElement && isMoveAdjacent(aiMoveIndex, currentWhiteTokenIndex) && !squareElement.classList.contains('occupied')) {
                squareElement.click();
            } else {
                console.error("IA tentou uma jogada inválida para o índice:", aiMoveIndex, "Atual:", currentWhiteTokenIndex, "Ocupado:", squareElement ? squareElement.classList.contains('occupied') : 'N/A');
                setMessage("IA tentou uma jogada inválida. O jogo pode estar num estado inesperado.", true);
            }
            return encodeCurrentStateOnly();
        } catch (e) {
            console.error("Erro durante a execução da jogada da IA:", e);
            setMessage("Erro ao executar a jogada da IA.", true);
            return encodedState;
        }
    }

    function decodeBigIntToGameState(encodedString) {
        try {
            const encodedState = BigInt(encodedString.trim());
            const decodedTokenIndex = Number((encodedState >> 58n) & 0x3Fn);
            const decodedPlayerBit = Number((encodedState >> 57n) & 1n);
            const decodedWidth = boardWidth //((encodedState >> 54n) & 0x7n);
            const decodedHeight = boardHeight //((encodedState >> 51n) & 0x7n);

            if (decodedWidth * decodedHeight > 50) {
                setMessage(`Erro: Dimensões descodificadas (${decodedWidth}x${decodedHeight}) estão fora do intervalo suportado.`, true);
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
                moveCountParity: decodedPlayerBit,
                boardState,
                width: decodedWidth,
                height: decodedHeight
            };
        } catch (error) {
            console.error("Erro ao decodificar string BigInt:", error);
            setMessage(`Erro ao decodificar entrada: ${error.message}`, true);
            return null;
        }
    }

    function applyDecodedState(state, source = 'unknown') {
        if (!state) {
            setMessage("Falha ao decodificar ou aplicar estado.", true);
            return;
        }
        if (gameEndMessageElement) gameEndMessageElement.textContent = '';

        boardWidth = state.width;
        boardHeight = state.height;

        if (boardSizeSelect) {
            const sizeString = `${boardWidth}x${boardHeight}`;
            const matchingOption = Array.from(boardSizeSelect.options).find(o => o.value === sizeString);
            if (matchingOption) {
                boardSizeSelect.value = sizeString;
            } else {
                boardSizeSelect.value = 'custom';
            }
            updateAiSupport(boardWidth, boardHeight);
        }

        initGame(true);

        currentWhiteTokenIndex = state.tokenIndex;
        moveCount = state.moveCountParity;

        for (let i = 0; i < totalSquares; i++) {
            const squareElement = getSquareElementByIndex(i);
            if (!squareElement) continue;

            if (state.boardState[i]) {
                if (i === currentWhiteTokenIndex) continue;

                if (i === numberOneSquareIndex || i === numberTwoSquareIndex) {
                } else {
                    const blackToken = document.createElement('div');
                    blackToken.classList.add('token');
                    squareElement.appendChild(blackToken);
                    squareElement.classList.add('occupied');
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
            console.error("CRÍTICO: Falha ao encontrar casa para o índice do token branco decodificado:", currentWhiteTokenIndex);
            setMessage("Erro ao posicionar token branco do estado decodificado.", true);
        }

        updateGoalHighlight();
        gameActive = false;
        updateControlsBasedOnGameState();

        let loadedStateInfo = `Exibindo estado: Tabuleiro ${boardWidth}x${boardHeight}. Vez do Jogador ${state.moveCountParity + 1}. `;
        if (state.tokenIndex === numberOneSquareIndex) loadedStateInfo += "Este era um estado de vitória para o Jogador 1. ";
        else if (state.tokenIndex === numberTwoSquareIndex) loadedStateInfo += "Este era um estado de vitória para o Jogador 2. ";
        else if (!canPlayerMove(state.tokenIndex)) {
            const losingPlayer = state.moveCountParity + 1;
            const winningPlayer = losingPlayer === 1 ? 2 : 1;
            loadedStateInfo += `Jogador ${losingPlayer} não tinha movimentos disponíveis neste estado (Jogador ${winningPlayer} ganharia). `;
        }
        loadedStateInfo += "Clique em 'Iniciar Novo Jogo' para jogar.";
        setMessage(loadedStateInfo, false);
        if (source === 'input' && movesTableBody) {
            movesTableBody.innerHTML = '';
        }
    }

    function indexToCoords(index) {
        if (index < 0 || index >= totalSquares) return "N/A";
        const row = boardHeight - Math.floor(index / boardWidth);
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
            setMessage("A carregar estado do histórico para visualização...", false);
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
            targetRow.insertCell(2).textContent = '';
        } else {
            if (movesTableBody.rows.length > 0 &&
                movesTableBody.rows[movesTableBody.rows.length - 1].cells[0] &&
                movesTableBody.rows[movesTableBody.rows.length - 1].cells[0].textContent == tableRowNumber.toString()) {
                targetRow = movesTableBody.rows[movesTableBody.rows.length - 1];
            } else {
                targetRow = movesTableBody.insertRow();
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
        const clickedSquare = event.currentTarget;
        const clickedSquareIndex = parseInt(clickedSquare.dataset.squareNumber, 10);

        if (isPlacingStartingPiece) {
            // Lógica para a primeira jogada: colocar a peça branca
            if (clickedSquareIndex === numberOneSquareIndex || clickedSquareIndex === numberTwoSquareIndex) {
                alert("A casa de partida não pode ser uma das casas objetivo.");
                return;
            }

            // Coloca a peça branca na casa clicada
            const whiteToken = document.createElement('div');
            whiteToken.classList.add('white-token');
            clickedSquare.appendChild(whiteToken);

            // Atualiza o estado do jogo
            currentWhiteTokenIndex = clickedSquareIndex;
            moveCount = 0;
            gameActive = true; // O jogo começa agora
            isPlacingStartingPiece = false; // Termina o modo de colocação

            // Atualiza a interface
            setGameEndMessage(''); // Limpa a mensagem de instrução
            setMessage(`Novo jogo. Vez do Jogador ${ (moveCount % 2) + 1 }.`, false);
            updateGoalHighlight();
            updateControlsBasedOnGameState();
            return; // A jogada de colocação termina aqui
        }

        // Lógica para as jogadas normais (depois da peça colocada)
        if (!gameActive) return;

        if (!isMoveAdjacent(clickedSquareIndex, currentWhiteTokenIndex)) return;
        if (clickedSquare.classList.contains('occupied')) return;

        const playerMakingTheMove = (moveCount % 2) + 1;
        const gameMoveNumberForTable = moveCount + 1;

        const previousSquareElement = getSquareElementByIndex(currentWhiteTokenIndex);
        if (previousSquareElement) {
            previousSquareElement.innerHTML = '';
            if (!(currentWhiteTokenIndex === numberOneSquareIndex || currentWhiteTokenIndex === numberTwoSquareIndex)) {
                const blackToken = document.createElement('div');
                blackToken.classList.add('token');
                previousSquareElement.appendChild(blackToken);
            } else {
                addNumberCircle(previousSquareElement, currentWhiteTokenIndex === numberOneSquareIndex ? 1 : 2);
            }
            previousSquareElement.classList.add('occupied');
        }

        clickedSquare.innerHTML = '';
        const whiteToken = document.createElement('div');
        whiteToken.classList.add('white-token');
        clickedSquare.appendChild(whiteToken);
        clickedSquare.classList.remove('occupied');
        currentWhiteTokenIndex = clickedSquareIndex;

        moveCount++;

        const encodedStateForTable = encodeCurrentStateOnly();
        const moveCoords = indexToCoords(clickedSquareIndex);
        addMoveToTable(gameMoveNumberForTable, playerMakingTheMove, moveCoords, encodedStateForTable);
        updateGoalHighlight();

        if (checkWinCondition(currentWhiteTokenIndex)) return;

        if (!canPlayerMove(currentWhiteTokenIndex)) {
            gameActive = false;
            const winner = playerMakingTheMove;
            setGameEndMessage(`Encurralado! O jogador ${winner} ganha!`);
            recordResult(winner);
            updateControlsBasedOnGameState();
            return;
        }

        const nextPlayer = (moveCount % 2) + 1;
        let shouldAIPlay = false;
        if (selectedGameMode === 'player1_vs_ai' && nextPlayer === 2) shouldAIPlay = true;
        else if (selectedGameMode === 'player2_vs_ai' && nextPlayer === 1) shouldAIPlay = true;

        if (shouldAIPlay && gameActive) {
            setTimeout(() => {
                encodeGameStateToBigIntAndPlayAI();
            }, 100);
        }
    }

    function initGame(calledDuringDecode = false, isSetupMode = false) {

        if (!gameBoardElement || !gameTitleElement) {
            console.error("CRÍTICO: Elemento do tabuleiro ou título não encontrado durante init!");
            return;
        }

        // Limpa os estados no início de cada jogo
        gameActive = false;
        isPlacingStartingPiece = false;

        updateGameConstants();
        updateBoardLabels();

        if (!calledDuringDecode) {
            if (gameEndMessageElement) gameEndMessageElement.textContent = '';
            if (!isSetupMode) {
                setMessage(`Novo jogo iniciado. Modo: ${selectedGameMode}, Dificuldade: ${currentGameDifficulty}. Vez do Jogador 1.`, false);
            }
            if (encodedOutputDiv) encodedOutputDiv.textContent = '';
            if (decodeInputElement) decodeInputElement.value = '';
            if (movesTableBody) movesTableBody.innerHTML = '';
        }

        gameBoardElement.innerHTML = '';
        gameBoardElement.style.gridTemplateColumns = `repeat(${boardWidth}, 1fr)`;
        gameBoardElement.style.gridTemplateRows = `repeat(${boardHeight}, 1fr)`;

        const TARGET_BOARD_WIDTH_PX = 350;
        gameBoardElement.style.width = `${TARGET_BOARD_WIDTH_PX}px`;

        const currentBoardRenderedWidth = gameBoardElement.offsetWidth;

        if (boardWidth > 0) {
            const cellWidth = currentBoardRenderedWidth / boardWidth;
            const newBoardHeight = cellWidth * boardHeight;
            gameBoardElement.style.height = `${newBoardHeight}px`;

            if(movesAreaElement) movesAreaElement.style.maxHeight = `${newBoardHeight + 30 + 5}px`;
        } else {
            gameBoardElement.style.height = `${TARGET_BOARD_WIDTH_PX}px`;
        }

        for (let i = 0; i < totalSquares; i++) {
            const square = document.createElement('div');
            square.classList.add('square');
            square.dataset.squareNumber = i;
            square.classList.remove('occupied');

            if (i === numberOneSquareIndex) addNumberCircle(square, 1);
            else if (i === numberTwoSquareIndex) addNumberCircle(square, 2);

            // Adiciona o listener sempre, a lógica de qual ação tomar fica no handler
            square.addEventListener('click', handleSquareClick);

            gameBoardElement.appendChild(square);
        }

        if (!calledDuringDecode) {
            if (isSetupMode) {
                // Modo de configuração para 2 jogadores
                isPlacingStartingPiece = true;
                gameActive = false;
                moveCount = 0;
            } else {
                // Início de jogo normal (vs IA)
                moveCount = 0;
                currentWhiteTokenIndex = initialWhiteTokenIndex;
                gameActive = true;

                const startSquare = getSquareElementByIndex(initialWhiteTokenIndex);
                if (startSquare) {
                    if (startSquare.querySelector('.number-circle')) startSquare.innerHTML = '';
                    const whiteToken = document.createElement('div');
                    whiteToken.classList.add('white-token');
                    startSquare.appendChild(whiteToken);
                    startSquare.classList.remove('occupied');
                } else {
                    console.error("CRÍTICO: Não foi possível encontrar a casa inicial:", initialWhiteTokenIndex);
                    gameActive = false;
                    setGameEndMessage("Erro: Não foi possível posicionar o token inicial.");
                }

                updateGoalHighlight();

                if (gameActive && !canPlayerMove(currentWhiteTokenIndex)) {
                    gameActive = false;
                    const winner = (moveCount % 2 === 0) ? 2 : 1;
                    setGameEndMessage(`Sem movimentos iniciais disponíveis! Jogador ${winner} ganha por defeito!`);
                    recordResult(winner);
                }

                if (selectedGameMode === 'player2_vs_ai' && gameActive) {
                    setMessage(`Novo jogo. Vez do Jogador 1 (IA).`, false);
                    setTimeout(() => { encodeGameStateToBigIntAndPlayAI(); }, 100);
                } else if(gameActive) {
                    setMessage(`Novo jogo. Vez do Jogador ${ (moveCount % 2) + 1 }.`, false);
                }
            }
        }
        updateControlsBasedOnGameState();
    }

    if (aiButton && encodedOutputDiv) {
        aiButton.addEventListener('click', () => {
            const state = encodeGameStateToBigIntAndPlayAI();
            if (state !== null && encodedOutputDiv) {
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
            setMessage("A decodificar estado para visualização...", false);
            const decodedState = decodeBigIntToGameState(encodedString);
            if (decodedState) {
                applyDecodedState(decodedState, 'input');
            }
        });
    }

    currentGameDifficulty = parseInt(gameValueSlider.value, 10);
    const initialSize = boardSizeSelect.value.split('x');
    boardWidth = parseInt(initialSize[0], 10);
    boardHeight = parseInt(initialSize[1], 10);

    requestAnimationFrame(() => {
        initGame(true);
        gameActive = false;
        updateControlsBasedOnGameState();
        setGameEndMessage("Clique em 'Iniciar Novo Jogo' para começar.");
        if (gameEndMessageElement) gameEndMessageElement.style.color = 'initial';
    });
    const clearResultsButton = document.getElementById('clear-results-button');
    if (clearResultsButton) {
        clearResultsButton.addEventListener('click', () => {
            const userConfirmed = window.confirm("Esta ação apaga o registo de todos os resultados. Tem a certeza?");
            if (userConfirmed) {
                // Limpa os dados em memória
                resultsData = {};

                // Apaga o cookie dos resultados
                setCookie("rastrosResults_v2", "", -1);

                // Atualiza a tabela para a mostrar vazia
                renderResultsTable();

                console.log("Os resultados foram limpos.");
            }
        });
    }
});