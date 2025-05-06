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


    let jogoModuleInstance = null; // To hold the Wasm module instance

// The EXPORT_NAME we used was "createJogoModule"
// This creates a Promise that resolves with the module instance.
    createJogoModule()
        .then(instance => {
            jogoModuleInstance = instance;
            console.log("Jogo Wasm Module Initialized!");
            runAiButton.disabled = false;
            errorOutput.textContent = ""; // Clear loading message
        })
        .catch(err => {
            console.error("Error initializing Jogo Wasm Module:", err);
            errorOutput.textContent = "Failed to load Wasm module. Check console. Details: " + err;
        });


    // --- Helper Function: Get Square Element by Index ---
    function getSquareElementByIndex(index) {
        if (index < 0 || index >= totalSquares) {
            return null;
        }
        // Ensure gameBoardElement is valid before querying
        if (!gameBoardElement) {
            gameBoardElement = document.getElementById('game-board');
            if (!gameBoardElement) return null; // Still not found
        }
        return gameBoardElement.querySelector(`.square[data-square-number="${index}"]`);
    }

    // --- Helper: Add Number Circle to a Square ---
    function addNumberCircle(squareElement, number) {
        if (!squareElement) return;
        squareElement.innerHTML = ''; // Clear first
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
        if (targetIndex === currentIndex) return false; // Cannot move to the same square

        const currentRow = Math.floor(currentIndex / boardSize);
        const currentCol = currentIndex % boardSize;
        const targetRow = Math.floor(targetIndex / boardSize);
        const targetCol = targetIndex % boardSize;

        const rowDiff = Math.abs(targetRow - currentRow);
        const colDiff = Math.abs(targetCol - currentCol);

        // Return true if the target is exactly one step away horizontally, vertically, or diagonally
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
            // Use setTimeout to allow UI to update before alert blocks execution
            setTimeout(() => {
                alert(`Jogador ${winner} ganhou!`);
                initGame(); // Reset the game after win
            }, 100);
            return true; // Game ended
        }
        return false; // Game continues
    }

    // --- Helper Function: Check if any valid moves exist from current position ---
    // Includes 'context' parameter and logging for initial ('init') check
    function canPlayerMove(currentIndex, context = "move") {
        let foundValidMove = false;

        if (context === 'init') {
            console.log(`canPlayerMove called from init for index ${currentIndex}`);
        }

        for (let rowOffset = -1; rowOffset <= 1; rowOffset++) {
            for (let colOffset = -1; colOffset <= 1; colOffset++) {
                // Skip the current square itself
                if (rowOffset === 0 && colOffset === 0) {
                    continue;
                }

                const currentRow = Math.floor(currentIndex / boardSize);
                const currentCol = currentIndex % boardSize;
                const targetRow = currentRow + rowOffset;
                const targetCol = currentCol + colOffset;

                // Check if the target coordinates are within the board grid
                if (targetRow >= 0 && targetRow < boardSize && targetCol >= 0 && targetCol < boardSize) {
                    const targetIndex = targetRow * boardSize + targetCol;
                    const targetSquareElement = getSquareElementByIndex(targetIndex);

                    let isOccupied = targetSquareElement ? targetSquareElement.classList.contains('occupied') : 'N/A';
                    if (context === 'init') {
                        console.log(`  Checking neighbour ${targetIndex}: Exists=${!!targetSquareElement}, Occupied=${isOccupied}`);
                    }

                    // Check if the target square exists and is NOT occupied
                    if (targetSquareElement && !targetSquareElement.classList.contains('occupied')) {
                        if (context === 'init') console.log(`  FOUND VALID MOVE at ${targetIndex}`);
                        foundValidMove = true;
                        break; // Exit inner loop once a valid move is found
                    }
                }
            }
            if (foundValidMove) break; // Exit outer loop once a valid move is found
        }

        // Log failure specifically during init if no move was found
        if (context === 'init' && !foundValidMove) {
            console.error(`canPlayerMove (init): Did NOT find any valid moves for index ${currentIndex}! Dumping neighbours:`);
            // Log details ONLY if it fails during init
            for (let ro = -1; ro <= 1; ro++) {
                for (let co = -1; co <= 1; co++) {
                    if (ro === 0 && co === 0) continue;
                    const cr = Math.floor(currentIndex / boardSize);
                    const cc = currentIndex % boardSize;
                    const tr = cr + ro;
                    const tc = cc + co;
                    if (tr >= 0 && tr < boardSize && tc >= 0 && tc < boardSize) {
                        const ti = tr * boardSize + tc;
                        const tse = getSquareElementByIndex(ti);
                        console.error(`  Neighbour ${ti}: Exists=${!!tse}, Occupied=${tse?.classList.contains('occupied')}`);
                    }
                }
            }
        }

        return foundValidMove; // True if at least one valid move exists, false otherwise
    }


    // --- Helper Function: Update Goal Highlight ---
    function updateGoalHighlight() {
        const goalSquare1 = getSquareElementByIndex(numberOneSquareIndex);
        const goalSquare2 = getSquareElementByIndex(numberTwoSquareIndex);
        // Get the number circle *inside* the goal square
        const numberCircle1 = goalSquare1 ? goalSquare1.querySelector('.number-circle') : null;
        const numberCircle2 = goalSquare2 ? goalSquare2.querySelector('.number-circle') : null;

        // Remove highlight from both first
        if (numberCircle1) numberCircle1.classList.remove('highlighted-goal');
        if (numberCircle2) numberCircle2.classList.remove('highlighted-goal');

        // Add highlight based on move count if game is active
        if (gameActive) {
            if (moveCount % 2 === 0) { // Even (0, 2, 4...) -> Highlight Goal 1 (Player 1's turn)
                if (numberCircle1) numberCircle1.classList.add('highlighted-goal');
            } else { // Odd (1, 3, 5...) -> Highlight Goal 2 (Player 2's turn)
                if (numberCircle2) numberCircle2.classList.add('highlighted-goal');
            }
        }
    }

    // --- Encoding Function (User's Specified Layout) ---
    function encodeGameStateToBigInt() {
        let encodedState = 0n; // Start with BigInt zero

        // 1. Board State (Bits 0-48) - Black tokens = 1
        for (let i = 0; i < totalSquares; i++) {
            const square = getSquareElementByIndex(i);
            if (square && square.classList.contains('occupied')) {
                encodedState |= (1n << BigInt(i)); // Uses bits 0-48
            }
        }

        // 2. Height = 7 (Bits 50-52)
        const height = 7n;
        encodedState |= (height << 50n); // Shift 7 left by 50 positions (uses bits 50, 51, 52)

        // 3. Width = 7 (Bits 53-55)
        const width = 7n;
        encodedState |= (width << 53n); // Shift 7 left by 53 positions (uses bits 53, 54, 55)

        // 4. Current Player (Bit 56)
        // 0 if Player 1's turn (moveCount is even), 1 if Player 2's turn (moveCount is odd)
        const currentPlayerBit = BigInt(moveCount % 2);
        encodedState |= (currentPlayerBit << 56n); // Shift 0 or 1 left by 56 positions (uses bit 56)

        // 5. White Token Position (Bits 58-63)
        // currentWhiteTokenIndex is 0-48, which fits in 6 bits
        const tokenPosition = BigInt(currentWhiteTokenIndex);
        encodedState |= (tokenPosition << 58n); // Shift position left by 58 positions (uses bits 58-63)

        // Note: Bits 49 and 57 are unused in this layout.
        const result = jogoModuleInstance._jogadaSite(encodedState, 50); // Call via instance
        //alert(`Jogada AI: ${result} `);
        const squareElement = getSquareElementByIndex(result);
        squareElement.click();



        return encodedState;
    }

    // --- Decoding Function (Extracts data from BigInt) ---
    function decodeBigIntToGameState(encodedString) {
        try {
            const encodedState = BigInt(encodedString.trim());

            // Extract data using bitwise operations and masks based on the encode function's layout
            // Mask for 6 bits (token position) = (1 << 6) - 1 = 63
            // Mask for 1 bit (player) = 1
            // Mask for 3 bits (width/height) = (1 << 3) - 1 = 7

            const tokenIndex = Number((encodedState >> 58n) & 63n); // Extract bits 58-63
            const playerBit = Number((encodedState >> 56n) & 1n);   // Extract bit 56
            const width = Number((encodedState >> 53n) & 7n);      // Extract bits 53-55
            const height = Number((encodedState >> 50n) & 7n);     // Extract bits 50-52

            // --- Basic Validation ---
            if (width !== 7 || height !== 7) {
                // Allow continuation but log a warning
                console.warn(`Decoded dimensions are ${width}x${height}, expected 7x7.`);
            }
            if (tokenIndex < 0 || tokenIndex >= totalSquares) {
                console.error(`Decoded token index ${tokenIndex} is out of bounds (0-${totalSquares - 1}).`);
                setMessage(`Error: Decoded token index ${tokenIndex} is out of bounds.`, true);
                return null; // Critical error
            }

            // --- Extract board state (Bits 0-48) ---
            const boardState = []; // Array of booleans (true if black token)
            for (let i = 0; i < totalSquares; i++) {
                // Check if the i-th bit is set
                const bitIsSet = ((encodedState >> BigInt(i)) & 1n) === 1n;
                boardState.push(bitIsSet);
            }

            // Determine moveCount parity for highlight (0 or 1 is sufficient)
            const decodedMoveCount = playerBit;






            // Return extracted state
            return {
                tokenIndex: tokenIndex,
                moveCount: decodedMoveCount,
                boardState: boardState // Array[49] of booleans
            };

        } catch (error) {
            console.error("Error decoding BigInt string:", error);
            setMessage(`Error decoding input: ${error.message}`, true);
            return null; // Indicate failure
        }
    }

    // --- Function to Apply Decoded State to Board ---
    function applyDecodedState(state) {
        if (!state) {
            // decodeBigIntToGameState should have set the message already
            //setMessage("Failed to decode state.", true);
            return;
        }

        console.log("Applying decoded state:", state);

        // 1. Reset board visuals using initGame internally
        initGame(true); // Pass flag to suppress initial setup/checks

        // 2. Update global state variables from decoded data *after* initGame cleared board
        currentWhiteTokenIndex = state.tokenIndex;
        moveCount = state.moveCount;

        // 3. Clear the default white token potentially placed by initGame (at initialWhiteTokenIndex)
        // Note: initGame(true) shouldn't place it, but this is a safety measure.
        const defaultWhiteSquare = getSquareElementByIndex(initialWhiteTokenIndex);
        if (defaultWhiteSquare && initialWhiteTokenIndex !== currentWhiteTokenIndex) {
            // Check if it *still* contains the default white token before clearing
            if (defaultWhiteSquare.querySelector('.white-token')) {
                defaultWhiteSquare.innerHTML = '';
                // Restore number circle if it was the default location
                if (initialWhiteTokenIndex === numberOneSquareIndex) addNumberCircle(defaultWhiteSquare, 1);
                else if (initialWhiteTokenIndex === numberTwoSquareIndex) addNumberCircle(defaultWhiteSquare, 2);
            }
        }

        // 4. Place black tokens based on decoded boardState
        for (let i = 0; i < totalSquares; i++) {
            if (state.boardState[i]) { // If true in decoded state, place black token
                // Rule: Do not place black tokens on goal squares
                if (i === numberOneSquareIndex || i === numberTwoSquareIndex) {
                    console.warn(`Decoded state indicated black token on goal square ${i}. Skipping.`);
                    continue;
                }
                // Rule: Do not place black token where the white token should be
                if (i === currentWhiteTokenIndex) {
                    console.warn(`Decoded state indicated black token on white token square ${i}. Skipping.`);
                    // Ensure the square is clear for the white token later
                    const squareElement = getSquareElementByIndex(i);
                    if(squareElement) squareElement.innerHTML = '';
                    continue;
                }

                const squareElement = getSquareElementByIndex(i);
                if (squareElement) {
                    squareElement.innerHTML = ''; // Clear potential numbers etc.
                    const blackToken = document.createElement('div');
                    blackToken.classList.add('token'); // Black token style
                    squareElement.appendChild(blackToken);
                    squareElement.classList.add('occupied');
                }
            }
        }

        // 5. Place the white token at the decoded position
        const whiteTokenSquare = getSquareElementByIndex(currentWhiteTokenIndex);
        if (whiteTokenSquare) {
            // Clear square content first (handles goal squares or potential black token if logic above failed)
            whiteTokenSquare.innerHTML = '';
            const whiteToken = document.createElement('div');
            whiteToken.classList.add('white-token');
            whiteTokenSquare.appendChild(whiteToken);
            // Ensure it's not marked as occupied
            whiteTokenSquare.classList.remove('occupied');
        } else {
            console.error("CRITICAL: Failed to find square for decoded white token index:", currentWhiteTokenIndex);
            setMessage("Error placing white token from decoded state.", true);
            // Consider resetting or stopping
            gameActive = false;
            return;
        }

        // 6. Update UI (Highlight) and Game State
        updateGoalHighlight();
        gameActive = true;
        setMessage("Game state loaded successfully.", false); // Clear previous errors

        // 7. Check if the loaded state is immediately game over
        if (!canPlayerMove(currentWhiteTokenIndex)) {
            const winner = (moveCount % 2 === 0) ? 2 : 1; // Player whose turn it *would* be is stuck
            gameActive = false; // Stop game immediately
            console.warn("Loaded state has no available moves!");
            setTimeout(() => {
                alert(`Loaded state has no moves available! Number ${winner} wins!`);
                // Reset to default initial state after alert
                initGame();
            }, 100);
        } else {
            console.log("Decoded state loaded. White token at:", currentWhiteTokenIndex, "Move count:", moveCount);
        }
    }


    // --- Function to Handle Clicks on Squares ---
    function handleSquareClick(event) {
        if (!gameActive) return; // Ignore clicks if game is not active

        const clickedSquare = event.currentTarget;
        const clickedSquareIndex = parseInt(clickedSquare.dataset.squareNumber, 10);

        // --- Validation 1: Is the target square adjacent? ---
        if (!isMoveAdjacent(clickedSquareIndex, currentWhiteTokenIndex)) {
            // Optionally provide feedback for invalid move type
            // console.log("Invalid move: Square not adjacent.");
            return;
        }

        // --- Validation 2: Is the target square already occupied by a black token? ---
        if (clickedSquare.classList.contains('occupied')) {
            // Optionally provide feedback
            // console.log("Invalid move: Square occupied.");
            return;
        }

        // --- If validations pass, perform the move ---

        // 1. Update the previous square (leave a black token)
        const previousSquareElement = getSquareElementByIndex(currentWhiteTokenIndex);
        if (previousSquareElement) {
            previousSquareElement.innerHTML = ''; // Remove white token
            const blackToken = document.createElement('div');
            blackToken.classList.add('token'); // Black token style
            previousSquareElement.appendChild(blackToken);
            previousSquareElement.classList.add('occupied'); // Mark as occupied
        }

        // 2. Update the clicked square (place the white token)
        clickedSquare.innerHTML = ''; // Clear content (e.g., if it was a goal square)
        const whiteToken = document.createElement('div');
        whiteToken.classList.add('white-token');
        clickedSquare.appendChild(whiteToken);
        clickedSquare.classList.remove('occupied'); // Ensure it's not marked occupied

        // --- Update game state variables ---
        currentWhiteTokenIndex = clickedSquareIndex; // Update white token position
        moveCount++; // Increment move counter

        // --- Update UI elements ---
        updateGoalHighlight(); // Update which goal is highlighted

        // --- Check for win conditions ---
        // Check 1: Did the move reach a goal square?
        if (checkWinCondition(currentWhiteTokenIndex)) {
            return; // Game ended by reaching goal
        }

        // Check 2: Can the player whose turn it is NOW make a move from the new position?
        if (!canPlayerMove(currentWhiteTokenIndex)) {
            gameActive = false; // Stop the game
            // Determine winner: the player whose turn it WOULD be is stuck, so the *other* player wins.
            // If moveCount is now EVEN (e.g., 1 -> 2), P2 moved, P1 is next but stuck -> P2 wins
            // If moveCount is now ODD (e.g., 0 -> 1), P1 moved, P2 is next but stuck -> P1 wins
            // Winner is player associated with EVEN/ODD count *before* increment? Check highlight logic:
            // P1 plays on even (0, 2...), P2 plays on odd (1, 3...)
            // If P1 just moved (mc becomes odd), P2 is stuck -> P1 wins.
            // If P2 just moved (mc becomes even), P1 is stuck -> P2 wins.
            const winner = (moveCount % 2 === 0) ? 2 : 1;

            setTimeout(() => {
                alert(`Encurralado! O jogador ${winner} ganha!`);
                initGame(); // Reset game after no-move win
            }, 100);
            return; // Game ended
        }
    }

    // --- Function to Initialize or Reset the Game ---
    // Accepts optional flag to modify behavior when called during state decoding
    function initGame(calledDuringDecode = false) {
        if (!calledDuringDecode) {
            console.log("Initializing game for new round...");
            // Clear messages and outputs only on full reset
            setMessage("");
            const outputDiv = document.getElementById('encoded-output');
            if(outputDiv) outputDiv.textContent = '';
            const inputField = document.getElementById('decode-input');
            if(inputField) inputField.value = '';
        } else {
            console.log("Initializing board structure during decode...");
        }

        gameBoardElement = document.getElementById('game-board');
        gameBoardElement.innerHTML = ''; // Clear board content first

        // Create squares and add static content (numbers)
        for (let i = 0; i < totalSquares; i++) {
            const square = document.createElement('div');
            square.classList.add('square');
            square.dataset.squareNumber = i;
            square.innerHTML = ''; // Start empty
            square.classList.remove('occupied'); // Ensure not occupied

            // Add number circles to goal squares
            if (i === numberOneSquareIndex) {
                addNumberCircle(square, 1);
            } else if (i === numberTwoSquareIndex) {
                addNumberCircle(square, 2);
            }

            // Add click listener to all squares
            square.addEventListener('click', handleSquareClick);
            gameBoardElement.appendChild(square);
        }

        // --- Perform setup ONLY for a new game (not during decode apply) ---
        if (!calledDuringDecode) {
            // Reset state variables to defaults
            gameActive = true;
            moveCount = 0;
            currentWhiteTokenIndex = initialWhiteTokenIndex;

            // Place the initial white token
            const startSquare = getSquareElementByIndex(initialWhiteTokenIndex);
            if(startSquare){
                startSquare.innerHTML = ''; // Clear just in case
                const whiteToken = document.createElement('div');
                whiteToken.classList.add('white-token');
                startSquare.appendChild(whiteToken);
                startSquare.classList.remove('occupied');
            } else {
                console.error("CRITICAL: Could not find initial start square", initialWhiteTokenIndex);
                // Handle error - maybe disable game?
                gameActive = false;
                return;
            }

            // Update highlight for the start state
            updateGoalHighlight();

            // Check if the game is playable from the start
            // Use the 'init' context for detailed logging if needed
            if (!canPlayerMove(currentWhiteTokenIndex, 'init')) {
                gameActive = false;
                const winner = 2; // Player 1 starts, if stuck, Player 2 wins
                console.error("Game cannot start! No initial moves available check failed.");
                setTimeout(() => {
                    alert(`No initial moves available! Number ${winner} wins!`);
                    initGame(); // Try resetting again
                }, 100);
            } else {
                console.log("Initial move check passed. Game initialized. White token at:", currentWhiteTokenIndex, "Move count:", moveCount);
            }
        }
    }

    // --- Event Listeners Setup ---

    // Encode Button
    const encodeButton = document.getElementById('encode-button');
    const outputDiv = document.getElementById('encoded-output');
    if (encodeButton && outputDiv) {
        encodeButton.addEventListener('click', () => {
            if (!gameActive && moveCount > 0) { // Allow encoding even if game ended, but not before start
                // Maybe add check if game never started?
            } else if (!gameActive) {
                outputDiv.textContent = "Game not started or already reset.";
                return;
            }
            const encodedValue = encodeGameStateToBigInt();
            // Display results
            outputDiv.textContent = `Encoded (Dec): ${encodedValue.toString()}\n`;
            outputDiv.textContent += `Encoded (Bin): ${encodedValue.toString(2).padStart(64, '0')}`;
            console.log("Encoded Game State:", encodedValue);
        });
    } else {
        console.error("Could not find Encode button or output div.");
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
            setMessage("Decoding...", false); // Provide feedback
            // Decode the string to get the state object
            const decodedState = decodeBigIntToGameState(encodedString);
            // Apply the decoded state to the board (handles null/errors internally)
            applyDecodedState(decodedState);
        });
    } else {
        console.error("Could not find Decode button or input field.");
    }

    // --- Start the game when the page loads ---
    initGame(); // Perform initial setup for a new game

}); // End of DOMContentLoaded listener