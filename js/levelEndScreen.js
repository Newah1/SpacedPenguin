// Level End Screen - matches original game's scoring display
// Based on the original GPS script's scoring system and UI layout

import { UIScreen, BackgroundOverlay, Panel, TextElement, Button, AnimatedNumber } from './uiManager.js';
import { GameState } from './game.js';

export class LevelEndScreen extends UIScreen {
    constructor(uiManager, game) {
        super(uiManager);
        this.game = game;
        
        // Scoring data (matches original GPS script calculation)
        this.scoringData = this.calculateScoringBreakdown();
        
        // Animation state
        this.currentStep = 0;
        this.stepDelay = 0;
        this.isAnimating = false;
        this.loopingSounds = new Map(); // Track looping audio sources
        
        this.setupUI();
        this.startAnimation();
    }
    
    calculateScoringBreakdown() {
        // Original scoring formula from GPS script:
        // tempScore = tempDist * tempLevel / tempTries
        // pScoreList = [[tempDist, integer(sqrt(tempDist)) * 5, 15, "arp"]]
        // pScoreList[2] = [tempLevel, 0.25, 15, "snd_entership"]
        // pScoreList[3] = [tempTries, 0.25, 15, "snd_entership"]
        // pScoreList[4] = [tempScore, integer(sqrt(tempScore)) * 5, 60, "arp"]
        
        const distance = Math.floor(this.game.distance);
        const level = this.game.level;
        const tries = this.game.tries;
        const calculatedScore = Math.floor(distance * level / tries);
        
        // Get the previous score before this level's calculation
        const previousScore = this.game.score - calculatedScore;
        
        return {
            distance: {
                value: distance,
                animationSpeed: Math.max(200, distance * 10), // Much faster
                duration: 0.15, // Very short
                sound: '15_Arp',
                loop: true
            },
            level: {
                value: level,
                animationSpeed: 2, // Slower so sound can loop properly
                duration: 0.3,
                sound: '21_snd_enterShip',
                loop: true // Loop ALL sounds
            },
            tries: {
                value: tries,
                animationSpeed: 2, // Slower so sound can loop properly
                duration: 0.3,
                sound: '21_snd_enterShip',
                loop: true // Loop ALL sounds
            },
            finalScore: {
                value: calculatedScore,
                animationSpeed: Math.max(500, calculatedScore * 5), // Much faster
                duration: 0.4, // Shorter
                sound: '15_Arp',
                loop: true
            },
            previousScore: previousScore,
            newTotalScore: this.game.score
        };
    }
    
    setupUI() {
        // Semi-transparent black background (matching original dAlert background)
        this.addElement(new BackgroundOverlay('rgba(0, 0, 0, 0.8)'));
        
        // Main scoring panel (centered like original)
        const panelWidth = 400;
        const panelHeight = 400;
        const panelX = (800 - panelWidth) / 2;
        const panelY = (600 - panelHeight) / 2;
        
        this.panel = this.addElement(new Panel(panelX, panelY, panelWidth, panelHeight, {
            backgroundColor: '#f5e4aa',
            borderColor: '#cb7928',
            cornerRadius: 10,
            borderWidth: 5
        }));
        
        // Title (matches original "Level x of x Complete!" display)
        const totalLevels = 25; // Based on original game analysis
        this.titleText = this.addElement(new TextElement(
            panelX + panelWidth / 2, panelY + 30,
            `Level ${this.game.level} of ${totalLevels} Complete!`,
            {
                fontSize: 20,
                fontFamily: 'Verdana, sans-serif',
                color: '#cb7928',
                align: 'center',
                bold: true
            }
        ));
        
        // Mathematical formula display (from original text_function member)
        this.formulaText = this.addElement(new TextElement(
            panelX + panelWidth / 2, panelY + 60,
            'Distance x Level / Tries = Score',
            {
                fontSize: 14,
                fontFamily: 'Courier New, monospace',
                color: '#cb7928',
                align: 'center',
                bold: true
            }
        ));
        
        // "Click to skip" text (initially visible)
        this.skipText = this.addElement(new TextElement(
            panelX + panelWidth / 2, panelY + panelHeight - 25,
            'click to skip',
            {
                fontSize: 12,
                fontFamily: 'Verdana, sans-serif',
                color: '#cb7928',
                align: 'center'
            }
        ));
        
        // Score breakdown table (matches original fld_score_actual format)
        const tableY = panelY + 95;
        const leftCol = panelX + 30;
        const rightCol = panelX + panelWidth - 30;
        const lineHeight = 25;
        
        // Column headers
        this.addElement(new TextElement(leftCol, tableY, 'Distance:', {
            fontSize: 16, color: '#cb7928', fontFamily: 'Verdana, sans-serif'
        }));
        this.distanceValue = this.addElement(new AnimatedNumber(rightCol, tableY, 0, {
            fontSize: 16, color: '#cb7928', fontFamily: 'Verdana, sans-serif',
            align: 'right', width: 5 // Wider to prevent overflow
        }));
        
        this.addElement(new TextElement(leftCol, tableY + lineHeight, 'Level:', {
            fontSize: 16, color: '#cb7928', fontFamily: 'Verdana, sans-serif'
        }));
        this.levelValue = this.addElement(new AnimatedNumber(rightCol, tableY + lineHeight, 0, {
            fontSize: 16, color: '#cb7928', fontFamily: 'Verdana, sans-serif',
            align: 'right', width: 5
        }));
        
        this.addElement(new TextElement(leftCol, tableY + lineHeight * 2, 'Tries:', {
            fontSize: 16, color: '#cb7928', fontFamily: 'Verdana, sans-serif'
        }));
        this.triesValue = this.addElement(new AnimatedNumber(rightCol, tableY + lineHeight * 2, 0, {
            fontSize: 16, color: '#cb7928', fontFamily: 'Verdana, sans-serif',
            align: 'right', width: 5
        }));
        
        // Separator line
        this.addElement(new TextElement(leftCol, tableY + lineHeight * 3, '________________________', {
            fontSize: 16, color: '#cb7928', fontFamily: 'Verdana, sans-serif'
        }));
        
        this.addElement(new TextElement(leftCol, tableY + lineHeight * 4, 'Score:', {
            fontSize: 18, color: '#cb7928', fontFamily: 'Verdana, sans-serif', bold: true
        }));
        this.scoreValue = this.addElement(new AnimatedNumber(rightCol, tableY + lineHeight * 4, 0, {
            fontSize: 18, color: '#cb7928', fontFamily: 'Verdana, sans-serif',
            align: 'right', width: 5, bold: true // Much wider for scores
        }));
        
        // Total score display
        this.addElement(new TextElement(leftCol, tableY + lineHeight * 5.5, 'Total Score:', {
            fontSize: 16, color: '#cb7928', fontFamily: 'Verdana, sans-serif'
        }));
        this.totalScoreValue = this.addElement(new AnimatedNumber(rightCol, tableY + lineHeight * 5.5, this.scoringData.previousScore, {
            fontSize: 16, color: '#cb7928', fontFamily: 'Verdana, sans-serif',
            align: 'right', width: 5 // Wider for total scores
        }));
        
        // High score display (matches original fld_your_high_score)
        this.addElement(new TextElement(leftCol, tableY + lineHeight * 7, 'Your Best:', {
            fontSize: 16, color: '#cb7928', fontFamily: 'Verdana, sans-serif'
        }));
        this.highScoreValue = this.addElement(new TextElement(rightCol, tableY + lineHeight * 7, this.game.highScore.toString(), {
            fontSize: 16, color: '#cb7928', fontFamily: 'Verdana, sans-serif',
            align: 'right'
        }));
        
        // Continue button (initially hidden)
        this.continueButton = this.addElement(new Button(
            panelX + panelWidth / 2 - 60, panelY + panelHeight - 70,
            120, 30,
            'Continue',
            () => this.handleContinue(),
            {
                fontSize: 14,
                fontFamily: 'Verdana, sans-serif',
                backgroundColor: '#cb7928',
                hoverColor: '#cb7928',
                borderColor: '#cb7928',
                textColor: '#f5e4aa'
            }
        ));
        this.continueButton.visible = false;
    }
    
    startAnimation() {
        this.isAnimating = true;
        this.currentStep = 0;
        this.stepDelay = 0;
        this.animateNextStep();
    }
    
    animateNextStep() {
        if (this.currentStep >= 4) {
            this.finishAnimation();
            return;
        }
        
        // Play sound for this step
        const stepData = [
            this.scoringData.distance,
            this.scoringData.level,
            this.scoringData.tries,
            this.scoringData.finalScore
        ][this.currentStep];
        
        // Play sound (looped if specified)
        if (stepData.loop && this.uiManager.audioManager) {
            const source = this.uiManager.audioManager.playSound(stepData.sound, 0.6, 1.0, true);
            this.loopingSounds.set(this.currentStep, source);
        } else {
            this.uiManager.playSound(stepData.sound);
        }
        
        // Start animation for current step
        switch (this.currentStep) {
            case 0: // Distance
                this.distanceValue.setTarget(this.scoringData.distance.value);
                this.distanceValue.animationSpeed = this.scoringData.distance.animationSpeed;
                this.distanceValue.onComplete = () => {
                    this.stopLoopingSound(0); // Stop distance sound
                    setTimeout(() => this.nextStep(), 50); // Even shorter pause
                };
                break;
                
            case 1: // Level
                this.levelValue.setTarget(this.scoringData.level.value);
                this.levelValue.animationSpeed = this.scoringData.level.animationSpeed;
                this.levelValue.onComplete = () => {
                    this.stopLoopingSound(1); // Stop level sound
                    setTimeout(() => this.nextStep(), 50);
                };
                break;
                
            case 2: // Tries
                this.triesValue.setTarget(this.scoringData.tries.value);
                this.triesValue.animationSpeed = this.scoringData.tries.animationSpeed;
                this.triesValue.onComplete = () => {
                    this.stopLoopingSound(2); // Stop tries sound
                    setTimeout(() => this.nextStep(), 50);
                };
                break;
                
            case 3: // Final score
                this.scoreValue.setTarget(this.scoringData.finalScore.value);
                this.scoreValue.animationSpeed = this.scoringData.finalScore.animationSpeed;
                this.scoreValue.onComplete = () => {
                    this.stopLoopingSound(3); // Stop final score sound
                    // Update total score
                    this.totalScoreValue.setTarget(this.scoringData.newTotalScore);
                    // Set up completion callback first
                    this.totalScoreValue.onComplete = () => {
                        // Update high score if needed
                        if (this.game.score > this.game.highScore) {
                            this.highScoreValue.setText(this.game.score.toString());
                        }
                        setTimeout(() => this.nextStep(), 100); // Shorter final pause
                    };
                    
                    // Make total score update super fast - should take max 0.1 seconds
                    const scoreDifference = this.scoringData.newTotalScore - this.scoringData.previousScore;
                    // If difference is huge (like continuing from previous levels), make it instant
                    if (scoreDifference > 5000) {
                        this.totalScoreValue.currentValue = this.scoringData.newTotalScore;
                        // Trigger completion immediately
                        setTimeout(() => this.totalScoreValue.onComplete(), 10);
                    } else {
                        this.totalScoreValue.animationSpeed = Math.max(100000, scoreDifference * 1000); // Ultra fast
                    }
                };
                break;
        }
    }
    
    nextStep() {
        this.currentStep++;
        if (this.currentStep < 4) {
            this.animateNextStep();
        } else {
            this.finishAnimation();
        }
    }
    
    finishAnimation() {
        this.isAnimating = false;
        this.continueButton.visible = true;
        this.skipText.visible = false; // Hide skip text when animation is done
        
        // Stop any looping sounds
        this.stopAllLoopingSounds();
    }
    
    stopLoopingSound(stepIndex) {
        if (this.loopingSounds.has(stepIndex)) {
            const source = this.loopingSounds.get(stepIndex);
            if (this.uiManager.audioManager) {
                this.uiManager.audioManager.stopSound(source);
            }
            this.loopingSounds.delete(stepIndex);
        }
    }
    
    stopAllLoopingSounds() {
        for (const [stepIndex, source] of this.loopingSounds) {
            if (this.uiManager.audioManager) {
                this.uiManager.audioManager.stopSound(source);
            }
        }
        this.loopingSounds.clear();
    }
    
    handleContinue() {
        this.stopAllLoopingSounds(); // Clean up any remaining sounds
        this.uiManager.playSound('17_snd_launch'); // Use launch sound for button clicks
        this.close();
        
        // Return to game for next level or end game
        if (this.game.levelRules && this.game.levelRules.isLastLevel) {
            this.game.state = GameState.GAME_OVER;
        } else {
            this.game.nextLevel();
        }
    }
    
    // Override close to ensure cleanup
    close() {
        this.stopAllLoopingSounds();
        super.close();
    }
    
    handleKeyPress(event) {
        // Allow space or enter to continue if animation is done
        if (!this.isAnimating && (event.code === 'Space' || event.code === 'Enter')) {
            this.handleContinue();
            return true;
        }
        
        // Allow ESC to skip animation
        if (this.isAnimating && event.code === 'Escape') {
            this.skipAnimation();
            return true;
        }
        
        return false;
    }
    
    handleClick(event) {
        // Allow clicking anywhere to skip animation (original behavior)
        if (this.isAnimating) {
            this.skipAnimation();
            return true;
        }
        
        // If animation is done, clicking continues
        if (!this.isAnimating) {
            this.handleContinue();
            return true;
        }
        
        return false;
    }
    
    skipAnimation() {
        // Stop all looping sounds first
        this.stopAllLoopingSounds();
        
        // Complete all animations immediately
        this.distanceValue.currentValue = this.scoringData.distance.value;
        this.levelValue.currentValue = this.scoringData.level.value;
        this.triesValue.currentValue = this.scoringData.tries.value;
        this.scoreValue.currentValue = this.scoringData.finalScore.value;
        this.totalScoreValue.currentValue = this.scoringData.newTotalScore;
        
        if (this.game.score > this.game.highScore) {
            this.highScoreValue.setText(this.game.score.toString());
        }
        
        this.finishAnimation();
    }
    
    // Override update to handle click events
    update(deltaTime) {
        super.update(deltaTime);
        
        // Check for mouse clicks during animation
        if (this.uiManager.inputManager && this.uiManager.inputManager.isMousePressed()) {
            this.handleClick();
        }
    }
}