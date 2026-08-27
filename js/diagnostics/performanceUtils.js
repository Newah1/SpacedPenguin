// Performance utilities for Spaced Penguin
// Common optimizations and helpers

class PerformanceUtils {
    constructor() {
        // Canvas context state cache
        this.canvasStateCache = new Map();
        
        // Frame timing for performance monitoring
        this.frameTimes = [];
        this.maxFrameTime = 0;
        this.avgFrameTime = 0;
        
        // Performance flags
        this.lowPerformanceMode = false;
    }
    
    // Canvas state caching to reduce redundant state changes
    cacheCanvasState(ctx, key, state) {
        const cached = this.canvasStateCache.get(key);
        if (cached && this.statesEqual(cached, state)) {
            return false; // No change needed
        }
        
        this.canvasStateCache.set(key, { ...state });
        return true; // State changed, apply it
    }
    
    statesEqual(state1, state2) {
        return state1.fillStyle === state2.fillStyle &&
               state1.strokeStyle === state2.strokeStyle &&
               state1.lineWidth === state2.lineWidth &&
               state1.globalAlpha === state2.globalAlpha;
    }
    
    // Set canvas style only if changed
    setCanvasStyle(ctx, key, fillStyle, strokeStyle = null, lineWidth = null, globalAlpha = null) {
        const newState = {
            fillStyle,
            strokeStyle: strokeStyle || ctx.strokeStyle,
            lineWidth: lineWidth || ctx.lineWidth,
            globalAlpha: globalAlpha || ctx.globalAlpha
        };
        
        if (this.cacheCanvasState(ctx, key, newState)) {
            ctx.fillStyle = fillStyle;
            if (strokeStyle) ctx.strokeStyle = strokeStyle;
            if (lineWidth) ctx.lineWidth = lineWidth;
            if (globalAlpha) ctx.globalAlpha = globalAlpha;
        }
    }
    
    // Track frame performance
    recordFrameTime(deltaTime) {
        this.frameTimes.push(deltaTime);
        
        // Keep only last 60 frames
        if (this.frameTimes.length > 60) {
            this.frameTimes.shift();
        }
        
        // Update stats
        this.maxFrameTime = Math.max(this.maxFrameTime, deltaTime);
        this.avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
        
        // Check for performance issues
        if (this.avgFrameTime > 1/30) { // Below 30fps
            this.lowPerformanceMode = true;
        } else if (this.avgFrameTime < 1/50) { // Above 50fps consistently
            this.lowPerformanceMode = false;
        }
    }
    
    // Get performance metrics
    getPerformanceMetrics() {
        return {
            averageFrameTime: this.avgFrameTime,
            maxFrameTime: this.maxFrameTime,
            averageFPS: 1 / this.avgFrameTime,
            lowPerformanceMode: this.lowPerformanceMode
        };
    }
    
    // Distance calculation optimizations
    static fastDistance(dx, dy) {
        // Use approximate distance for performance-critical code
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        return adx + ady - Math.min(adx, ady) * 0.5;
    }
    
    static distanceSquared(dx, dy) {
        return dx * dx + dy * dy;
    }
    
    // Array operations optimizations
    static clearArray(arr) {
        arr.length = 0; // Faster than arr.splice(0)
    }
    
    // Throttle function calls
    static throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    }
    
    // Request animation frame with fallback
    static requestAnimFrame(callback) {
        return (
            window.requestAnimationFrame ||
            window.webkitRequestAnimationFrame ||
            window.mozRequestAnimationFrame ||
            window.oRequestAnimationFrame ||
            window.msRequestAnimationFrame ||
            function(callback) {
                window.setTimeout(callback, 1000 / 60);
            }
        )(callback);
    }
}

export default PerformanceUtils;