// Level End Screen - matches original game's scoring display
// Based on the original GPS script's scoring system and UI layout

import { UIScreen, BackgroundOverlay, Panel, TextElement, Button, AnimatedNumber } from './uiManager.js';
import { GameState } from './game.js';
import { STAGE_HEIGHT, STAGE_WIDTH } from './viewport.js';
import { AUDIO_CONFIG, AudioCue, getAudioCue } from './config/audioConfig.js';
import { UI_CONFIG } from './config/uiConfig.js';

export function isCustomLevel(game) {
    return Boolean(game.levelMetadata?.saveId) || typeof game.level !== 'number';
}

function getLevelScoreValue(game) {
    return Number.isFinite(game.level) ? game.level : 1;
}

export function getCompletionTitle(game, totalLevels) {
    if (isCustomLevel(game)) {
        return `${game.levelMetadata?.name || 'Custom Level'} Complete!`;
    }
    return `Level ${game.level} of ${totalLevels} Complete!`;
}

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
        const level = getLevelScoreValue(this.game);
        const tries = this.game.tries;
        const calculatedScore = Math.floor(distance * level / tries);
        
        // A retry only improves the total when it beats this level's prior best.
        const previousScore = this.game.score - (this.game.lastScoreImprovement ?? 0);
        
        return {
            distance: {
                value: distance,
                animationSpeed: Math.max(200, distance * 10), // Much faster
                duration: 0.15, // Very short
                soundCue: AudioCue.ARP,
                loop: true
            },
            level: {
                value: level,
                animationSpeed: 2, // Slower so sound can loop properly
                duration: 0.3,
                soundCue: AudioCue.ENTER_SHIP,
                loop: true // Loop ALL sounds
            },
            tries: {
                value: tries,
                animationSpeed: 2, // Slower so sound can loop properly
                duration: 0.3,
                soundCue: AudioCue.ENTER_SHIP,
                loop: true // Loop ALL sounds
            },
            finalScore: {
                value: calculatedScore,
                animationSpeed: Math.max(500, calculatedScore * 5), // Much faster
                duration: 0.4, // Shorter
                soundCue: AudioCue.ARP,
                loop: true
            },
            previousScore: previousScore,
            newTotalScore: this.game.score
        };
    }
    
    setupUI() {
        // Semi-transparent black background (matching original dAlert background)
        const config = UI_CONFIG.levelEnd;
        this.addElement(new BackgroundOverlay(config.overlayColor));
        
        // Main scoring panel (centered like original)
        const panelWidth = config.panel.width;
        const panelHeight = config.panel.height;
        const panelX = (STAGE_WIDTH - panelWidth) / 2;
        const panelY = (STAGE_HEIGHT - panelHeight) / 2;
        
        this.panel = this.addElement(new Panel(panelX, panelY, panelWidth, panelHeight, {
            backgroundColor: config.panelColor,
            borderColor: config.accentColor,
            cornerRadius: config.panel.cornerRadius,
            borderWidth: config.panel.borderWidth
        }));
        
        // Title (matches original "Level x of x Complete!" display)
        const totalLevels = this.game.levelLoader.maximumSelectableLevel;
        this.titleText = this.addElement(new TextElement(
            panelX + panelWidth / 2, panelY + config.titleOffsetY,
            getCompletionTitle(this.game, totalLevels),
            {
                fontSize: 20,
                fontFamily: UI_CONFIG.fonts.primary,
                color: config.accentColor,
                align: 'center',
                bold: true
            }
        ));
        
        // Mathematical formula display (from original text_function member)
        this.formulaText = this.addElement(new TextElement(
            panelX + panelWidth / 2, panelY + config.formulaOffsetY,
            'Distance x Level / Tries = Score',
            {
                fontSize: 14,
                fontFamily: UI_CONFIG.fonts.monospace,
                color: config.accentColor,
                align: 'center',
                bold: true
            }
        ));
        
        // "Click to skip" text (initially visible)
        this.skipText = this.addElement(new TextElement(
            panelX + panelWidth / 2, panelY + panelHeight - config.skipOffsetBottom,
            'click to skip',
            {
                fontSize: 12,
                fontFamily: UI_CONFIG.fonts.primary,
                color: config.accentColor,
                align: 'center'
            }
        ));
        
        // Score breakdown table (matches original fld_score_actual format)
        const tableY = panelY + config.tableOffsetY;
        const leftCol = panelX + config.tableInsetX;
        const rightCol = panelX + panelWidth - config.tableInsetX;
        const lineHeight = config.lineHeight;
        
        // Column headers
        this.addElement(new TextElement(leftCol, tableY, 'Distance:', {
            fontSize: 16, color: config.accentColor, fontFamily: UI_CONFIG.fonts.primary
        }));
        this.distanceValue = this.addElement(new AnimatedNumber(rightCol, tableY, 0, {
            fontSize: 16, color: config.accentColor, fontFamily: UI_CONFIG.fonts.primary,
            align: 'right', width: 5 // Wider to prevent overflow
        }));
        
        this.addElement(new TextElement(leftCol, tableY + lineHeight, 'Level:', {
            fontSize: 16, color: config.accentColor, fontFamily: UI_CONFIG.fonts.primary
        }));
        this.levelValue = this.addElement(new AnimatedNumber(rightCol, tableY + lineHeight, 0, {
            fontSize: 16, color: config.accentColor, fontFamily: UI_CONFIG.fonts.primary,
            align: 'right', width: 5
        }));
        
        this.addElement(new TextElement(leftCol, tableY + lineHeight * 2, 'Tries:', {
            fontSize: 16, color: config.accentColor, fontFamily: UI_CONFIG.fonts.primary
        }));
        this.triesValue = this.addElement(new AnimatedNumber(rightCol, tableY + lineHeight * 2, 0, {
            fontSize: 16, color: config.accentColor, fontFamily: UI_CONFIG.fonts.primary,
            align: 'right', width: 5
        }));
        
        // Separator line
        this.addElement(new TextElement(leftCol, tableY + lineHeight * 3, '________________________', {
            fontSize: 16, color: config.accentColor, fontFamily: UI_CONFIG.fonts.primary
        }));
        
        this.addElement(new TextElement(leftCol, tableY + lineHeight * 4, 'Score:', {
            fontSize: 18, color: config.accentColor, fontFamily: UI_CONFIG.fonts.primary, bold: true
        }));
        this.scoreValue = this.addElement(new AnimatedNumber(rightCol, tableY + lineHeight * 4, 0, {
            fontSize: 18, color: config.accentColor, fontFamily: UI_CONFIG.fonts.primary,
            align: 'right', width: 5, bold: true // Much wider for scores
        }));
        
        // Total score display
        this.addElement(new TextElement(leftCol, tableY + lineHeight * 5.5, 'Total Score:', {
            fontSize: 16, color: config.accentColor, fontFamily: UI_CONFIG.fonts.primary
        }));
        this.totalScoreValue = this.addElement(new AnimatedNumber(rightCol, tableY + lineHeight * 5.5, this.scoringData.previousScore, {
            fontSize: 16, color: config.accentColor, fontFamily: UI_CONFIG.fonts.primary,
            align: 'right', width: 5 // Wider for total scores
        }));
        
        // High score display (matches original fld_your_high_score)
        this.addElement(new TextElement(leftCol, tableY + lineHeight * 7, 'Your Best:', {
            fontSize: 16, color: config.accentColor, fontFamily: UI_CONFIG.fonts.primary
        }));
        this.highScoreValue = this.addElement(new TextElement(rightCol, tableY + lineHeight * 7, this.game.highScore.toString(), {
            fontSize: 16, color: config.accentColor, fontFamily: UI_CONFIG.fonts.primary,
            align: 'right'
        }));
        
        // Continue and Retry buttons (initially hidden, centered together)
        const buttonWidth = config.button.width;
        const buttonHeight = config.button.height;
        const buttonSpacing = config.button.spacing;
        const totalButtonWidth = (buttonWidth * 2) + buttonSpacing;
        const buttonStartX = panelX + (panelWidth - totalButtonWidth) / 2;
        
        this.retryButton = this.addElement(new Button(
            buttonStartX, panelY + panelHeight - config.button.offsetBottom,
            buttonWidth, buttonHeight,
            'Retry',
            () => this.handleRetry(),
            {
                fontSize: 14,
                fontFamily: UI_CONFIG.fonts.primary,
                backgroundColor: config.button.backgroundColor,
                hoverColor: config.button.hoverColor,
                activeColor: config.button.activeColor,
                borderColor: config.accentColor,
                textColor: config.panelColor
            }
        ));
        this.retryButton.visible = false;
        
        this.continueButton = this.addElement(new Button(
            buttonStartX + buttonWidth + buttonSpacing, panelY + panelHeight - config.button.offsetBottom,
            buttonWidth, buttonHeight,
            isCustomLevel(this.game) ? 'Browse Levels' : 'Continue',
            () => this.handleContinue(),
            {
                fontSize: 14,
                fontFamily: UI_CONFIG.fonts.primary,
                backgroundColor: config.button.backgroundColor,
                hoverColor: config.button.hoverColor,
                activeColor: config.button.activeColor,
                borderColor: config.accentColor,
                textColor: config.panelColor
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
            const source = this.uiManager.audioManager.playCue(stepData.soundCue, {
                volume: AUDIO_CONFIG.scoringLoopVolume,
                loop: true
            });
            this.loopingSounds.set(this.currentStep, source);
        } else {
            this.uiManager.playSound(getAudioCue(stepData.soundCue).soundId);
        }
        
        // Start animation for current step
        switch (this.currentStep) {
            case 0: // Distance
                this.distanceValue.setTarget(this.scoringData.distance.value);
                this.distanceValue.animationSpeed = this.scoringData.distance.animationSpeed;
                this.distanceValue.onComplete = () => {
                    this.stopLoopingSound(0); // Stop distance sound
                    setTimeout(() => this.nextStep(), UI_CONFIG.levelEnd.animation.stepPauseMs);
                };
                break;
                
            case 1: // Level
                this.levelValue.setTarget(this.scoringData.level.value);
                this.levelValue.animationSpeed = this.scoringData.level.animationSpeed;
                this.levelValue.onComplete = () => {
                    this.stopLoopingSound(1); // Stop level sound
                    setTimeout(() => this.nextStep(), UI_CONFIG.levelEnd.animation.stepPauseMs);
                };
                break;
                
            case 2: // Tries
                this.triesValue.setTarget(this.scoringData.tries.value);
                this.triesValue.animationSpeed = this.scoringData.tries.animationSpeed;
                this.triesValue.onComplete = () => {
                    this.stopLoopingSound(2); // Stop tries sound
                    setTimeout(() => this.nextStep(), UI_CONFIG.levelEnd.animation.stepPauseMs);
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
                        setTimeout(() => this.nextStep(), UI_CONFIG.levelEnd.animation.finalPauseMs);
                    };
                    
                    // Make total score update super fast - should take max 0.1 seconds
                    const scoreDifference = this.scoringData.newTotalScore - this.scoringData.previousScore;
                    // If difference is huge (like continuing from previous levels), make it instant
                    if (scoreDifference > UI_CONFIG.levelEnd.animation.immediateScoreThreshold) {
                        this.totalScoreValue.currentValue = this.scoringData.newTotalScore;
                        // Trigger completion immediately
                        setTimeout(
                            () => this.totalScoreValue.onComplete(),
                            UI_CONFIG.levelEnd.animation.immediateCompletionMs
                        );
                    } else {
                        this.totalScoreValue.animationSpeed = Math.max(
                            UI_CONFIG.levelEnd.animation.minimumTotalScoreSpeed,
                            scoreDifference * UI_CONFIG.levelEnd.animation.totalScoreSpeedMultiplier
                        );
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
        this.retryButton.visible = true;
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
        this.uiManager.playSound(getAudioCue(AudioCue.LAUNCH).soundId);
        this.close();

        if (isCustomLevel(this.game)) {
            this.game.showLevelBrowser();
            return;
        }
        
        // Return to game for next level or end game
        if (this.game.level >= this.game.levelLoader.maximumSelectableLevel) {
            this.game.endGame();
        } else {
            this.game.nextLevel();
        }
    }
    
    handleRetry() {
        this.stopAllLoopingSounds(); // Clean up any remaining sounds
        this.uiManager.playSound(getAudioCue(AudioCue.LAUNCH).soundId);
        this.close();
        
        // Reset the current level to retry it
        this.game.resetLevel();
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
    
    handleClick(x, y) {
        // Allow clicking anywhere to skip animation (original behavior)
        if (this.isAnimating) {
            this.skipAnimation();
            return true;
        }

        // Give Retry and Continue first refusal. The previous screen-wide
        // handler advanced the level before either button saw the click.
        if (super.handleClick(x, y)) {
            return true;
        }

        // Preserve the original click-anywhere-to-continue behavior outside
        // the explicit button hit areas.
        this.handleContinue();
        return true;
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
