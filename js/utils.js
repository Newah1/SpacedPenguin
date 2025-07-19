// Utility functions for Spaced Penguin
// Based on the original Lingo utility functions

export default class Utils {
    // Convert degrees to radians
    static toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
    
    // Convert radians to degrees
    static toDegrees(radians) {
        return radians * (180 / Math.PI);
    }
    
    // Calculate distance between two points
    static distance(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    // Calculate distance from origin (0,0)
    static distanceFromOrigin(point) {
        return Math.sqrt(point.x * point.x + point.y * point.y);
    }
    
    // Calculate rotation angle from a vector
    static rotationAngle(vector) {
        if (vector.x === 0) {
            return vector.y > 0 ? 90 : -90;
        }
        
        let xFactor = 0;
        if (vector.x < 0) {
            xFactor = 180;
        }
        
        return Utils.toDegrees(Math.atan(vector.y / vector.x)) + xFactor;
    }
    
    // Find point at given angle and distance from reference point
    static findPoint(refPoint, angle, distance) {
        const radians = Utils.toRadians(angle);
        return {
            x: refPoint.x + Math.cos(radians) * distance,
            y: refPoint.y + Math.sin(radians) * distance
        };
    }
    
    // Check if point is inside rectangle
    static inside(point, rect) {
        return point.x >= rect.x && 
               point.x <= rect.x + rect.width && 
               point.y >= rect.y && 
               point.y <= rect.y + rect.height;
    }
    
    // Vector addition
    static addVectors(v1, v2) {
        return { x: v1.x + v2.x, y: v1.y + v2.y };
    }
    
    // Vector subtraction
    static subtractVectors(v1, v2) {
        return { x: v1.x - v2.x, y: v1.y - v2.y };
    }
    
    // Vector multiplication by scalar
    static multiplyVector(vector, scalar) {
        return { x: vector.x * scalar, y: vector.y * scalar };
    }
    
    // Vector magnitude
    static vectorMagnitude(vector) {
        return Math.sqrt(vector.x * vector.x + vector.y * vector.y);
    }
    
    // Normalize vector
    static normalizeVector(vector) {
        const magnitude = Utils.vectorMagnitude(vector);
        if (magnitude === 0) return { x: 0, y: 0 };
        return { x: vector.x / magnitude, y: vector.y / magnitude };
    }
    
    // Clamp value between min and max
    static clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }
    
    // Linear interpolation
    static lerp(start, end, factor) {
        return start + (end - start) * factor;
    }
    
    // Generate random number between min and max
    static random(min, max) {
        return Math.random() * (max - min) + min;
    }
    
    // Generate random integer between min and max (inclusive)
    static randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    
    // Check if two circles intersect
    static circlesIntersect(center1, radius1, center2, radius2) {
        const distance = Utils.distance(center1, center2);
        return distance <= radius1 + radius2;
    }
    
    // Check if point is inside circle
    static pointInCircle(point, center, radius) {
        const distance = Utils.distance(point, center);
        return distance <= radius;
    }
    
    // Convert hex color string to RGB object
    static hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }
    
    // Convert RGB object to hex color string
    static rgbToHex(rgb) {
        return "#" + ((1 << 24) + (rgb.r << 16) + (rgb.g << 8) + rgb.b).toString(16).slice(1);
    }
    
    // Format number with leading zeros
    static padNumber(num, length) {
        return num.toString().padStart(length, '0');
    }
    
    // Format score for display
    static formatScore(score) {
        return score.toLocaleString();
    }
    
    // Deep clone object
    static deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }
    
    // Debounce function
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    // Throttle function
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
        };
    }
} 