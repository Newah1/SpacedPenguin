import {
    getRuntimeGameConfigValue,
    listGameConfigPaths,
    setRuntimeGameConfigValue
} from '../config/runtimeGameConfig.js';

export const CONSOLE_COMMANDS = Object.freeze([
    '/help',
    '/level_editor',
    '/clear',
    '/level',
    '/export',
    '/launch',
    '/last',
    '/setconfig',
    '/play',
    '/edit',
    '/add',
    '/delete',
    '/save'
]);

class Console {
    constructor(game) {
        this.game = game;
        this.visible = false;
        this.commandHistory = [];
        this.historyIndex = -1;
        this.currentInput = '';
        
        this.createConsoleElements();
        this.setupEventListeners();
    }
    
    createConsoleElements() {
        // Create console container
        this.container = document.createElement('div');
        this.container.id = 'console';
        this.container.style.cssText = `
            position: fixed;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 300px;
            background: rgba(0, 0, 0, 0.9);
            border-top: 2px solid #0f0;
            color: #0f0;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            display: none;
            z-index: 1000;
            flex-direction: column;
        `;
        
        // Create output area
        this.output = document.createElement('div');
        this.output.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 10px;
            white-space: pre-wrap;
        `;
        
        // Create input area
        this.inputContainer = document.createElement('div');
        this.inputContainer.style.cssText = `
            display: flex;
            padding: 10px;
            border-top: 1px solid #0f0;
        `;
        
        this.prompt = document.createElement('span');
        this.prompt.textContent = '> ';
        this.prompt.style.color = '#0f0';
        
        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.style.cssText = `
            flex: 1;
            background: transparent;
            border: none;
            outline: none;
            color: #0f0;
            font-family: inherit;
            font-size: inherit;
            margin-left: 5px;
        `;
        
        this.inputContainer.appendChild(this.prompt);
        this.inputContainer.appendChild(this.input);
        this.container.appendChild(this.output);
        this.container.appendChild(this.inputContainer);
        
        document.body.appendChild(this.container);
        
        this.log('SpacedPenguin Console v1.0');
        this.log('Type /help for available commands');
    }
    
    setupEventListeners() {
        // Handle input
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                // Commands such as /launch hide the console. Do not let the
                // same Enter event then bubble into gameplay and reset Kevin.
                e.preventDefault();
                e.stopPropagation();
                this.executeCommand(this.input.value);
                this.input.value = '';
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.navigateHistory(-1);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.navigateHistory(1);
            } else if (e.key === 'Tab') {
                e.preventDefault();
                e.stopPropagation();
                this.autocomplete();
            } else {
                this.completionState = null;
            }
        });
    }

    autocomplete() {
        const currentValue = this.input.value;
        if (this.completionState?.lastValue === currentValue) {
            const state = this.completionState;
            state.index = (state.index + 1) % state.matches.length;
            this.applyCompletion(state, state.matches[state.index]);
            return;
        }

        const context = this.getCompletionContext(currentValue);
        if (!context) return;
        const matches = context.candidates.filter(candidate =>
            candidate.toLowerCase().startsWith(context.token.toLowerCase())
        );
        if (matches.length === 0) return;

        const state = {
            ...context,
            matches,
            index: -1,
            lastValue: currentValue
        };
        this.completionState = state;
        if (matches.length === 1) {
            this.applyCompletion(state, matches[0]);
            return;
        }

        const commonPrefix = this.longestCommonPrefix(matches);
        if (commonPrefix.length > context.token.length) {
            this.applyCompletion(state, commonPrefix);
        } else {
            state.index = 0;
            this.applyCompletion(state, matches[0]);
        }
    }

    getCompletionContext(value) {
        const cursor = this.input.selectionStart ?? value.length;
        if (cursor !== value.length) return null;
        const beforeCursor = value.slice(0, cursor);
        if (!beforeCursor.includes(' ')) {
            return {
                token: beforeCursor,
                beforeToken: '',
                afterToken: value.slice(cursor),
                candidates: CONSOLE_COMMANDS
            };
        }

        const match = beforeCursor.match(/^(\/setconfig)\s+([^\s]*)$/i);
        if (!match) return null;
        return {
            token: match[2],
            beforeToken: `${match[1]} `,
            afterToken: value.slice(cursor),
            candidates: listGameConfigPaths()
        };
    }

    longestCommonPrefix(values) {
        if (!values.length) return '';
        let prefix = values[0];
        for (let index = 1; index < values.length; index++) {
            while (!values[index].toLowerCase().startsWith(prefix.toLowerCase())) {
                prefix = prefix.slice(0, -1);
                if (!prefix) return '';
            }
        }
        return prefix;
    }

    applyCompletion(state, completion) {
        this.input.value = `${state.beforeToken}${completion}${state.afterToken}`;
        state.lastValue = this.input.value;
        const cursor = state.beforeToken.length + completion.length;
        this.input.setSelectionRange?.(cursor, cursor);
    }
    
    show() {
        this.visible = true;
        this.container.style.display = 'flex';
        this.input.focus();
    }
    
    hide() {
        this.visible = false;
        this.container.style.display = 'none';
        // Return focus to game canvas
        if (this.game.canvas) {
            this.game.canvas.focus();
        }
    }
    
    toggle() {
        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
    }
    
    log(message) {
        this.output.textContent += message + '\n';
        this.output.scrollTop = this.output.scrollHeight;
    }
    
    navigateHistory(direction) {
        if (this.commandHistory.length === 0) return;
        
        if (direction === -1) { // Up arrow
            if (this.historyIndex === -1) {
                this.currentInput = this.input.value;
                this.historyIndex = this.commandHistory.length - 1;
            } else if (this.historyIndex > 0) {
                this.historyIndex--;
            }
        } else if (direction === 1) { // Down arrow
            if (this.historyIndex === -1) return;
            if (this.historyIndex < this.commandHistory.length - 1) {
                this.historyIndex++;
            } else {
                this.historyIndex = -1;
                this.input.value = this.currentInput;
                return;
            }
        }
        
        if (this.historyIndex >= 0) {
            this.input.value = this.commandHistory[this.historyIndex];
        }
    }
    
    executeCommand(command) {
        if (!command.trim()) return;
        
        this.log('> ' + command);
        this.commandHistory.push(command);
        this.historyIndex = -1;
        
        // Parse command
        const parts = command.trim().split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);
        
        switch (cmd) {
            case '/help':
                this.showHelp();
                break;
            case '/level_editor':
                this.startLevelEditor();
                break;
            case '/clear':
                this.output.textContent = '';
                break;
            case '/level':
                this.showLevelInfo();
                break;
            case '/export':
                this.exportLevel(args[0]);
                break;
            case '/launch':
                this.launchTrajectory(args);
                break;
            case '/last':
                this.repeatLastLaunch();
                break;
            case '/setconfig':
                this.setConfig(args);
                break;
            default:
                this.log('Unknown command: ' + cmd);
                this.log('Type /help for available commands');
        }
    }
    
    showHelp() {
        const help = `
Available Commands:
/help - Show this help message
/level_editor - Enter level editor mode
/level - Show current level information
/export [filename] - Export current level as JSON
/launch [angle] [power] - Replay an ASCII trajectory sample
/last - Repeat the last launch
/setconfig [dot.path] [value] - Read or override a game config value
/clear - Clear console output

Level Editor Commands (when in editor mode):
/play - Switch to play mode
/edit - Switch to edit mode
/add [type] - Add new object (planet, bonus, target, slingshot)
/delete - Delete selected object
/save [filename] - Save level to JSON file
`;
        this.log(help);
    }
    
    startLevelEditor() {
        this.log('Starting Level Editor...');
        this.game.enterLevelEditor();
        this.hide();
    }
    
    showLevelInfo() {
        const level = this.game.level;
        const objectCount = this.game.gameObjects.length;
        const planetCount = this.game.planets.length;
        const bonusCount = this.game.bonuses.length;
        
        this.log(`Current Level: ${level}`);
        this.log(`Total Objects: ${objectCount}`);
        this.log(`Planets: ${planetCount}`);
        this.log(`Bonuses: ${bonusCount}`);
    }
    
    exportLevel(filename) {
        if (!filename) {
            filename = `level${this.game.level}.json`;
        }
        
        this.log(`Exporting level to ${filename}...`);
        const levelData = this.game.exportCurrentLevel();
        
        // Create download link
        const blob = new Blob([JSON.stringify(levelData, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        
        this.log(`Level exported successfully!`);
    }

    launchTrajectory(args) {
        const angle = Number(args[0]);
        const power = Number(args[1]);
        if (args.length !== 2 || !Number.isFinite(angle) || !Number.isFinite(power)) {
            this.log('Usage: /launch [angle] [power]');
            return;
        }

        this.game.launchTestTrajectory(angle, power);
        this.hide();
    }

    repeatLastLaunch() {
        const lastLaunch = this.game.launches?.at(-1);
        if (!lastLaunch) {
            this.log('No launch to repeat. Use /launch [angle] [power] first.');
            return;
        }

        this.launchTrajectory([
            String(lastLaunch.angle),
            String(lastLaunch.power)
        ]);
    }

    setConfig(args) {
        const [path, ...valueParts] = args;
        if (!path) {
            this.log('Usage: /setconfig [dot.path] [value]');
            this.log('Example: /setconfig simulation.aimAssist.previewSeconds 2');
            return;
        }

        try {
            if (valueParts.length === 0) {
                this.log(`${path} = ${JSON.stringify(getRuntimeGameConfigValue(path))}`);
                return;
            }
            const result = setRuntimeGameConfigValue(path, valueParts.join(' '));
            this.game.onRuntimeConfigChanged?.(result.canonicalPath, result.value);
            this.log(`${result.canonicalPath} = ${JSON.stringify(result.value)} (runtime override)`);
        } catch (error) {
            this.log(`SetConfig error: ${error.message}`);
        }
    }
}

export default Console;
