// Utility functions for Spaced Penguin
// Based on the original Lingo utility functions
import { LEVEL_CATALOG_CONFIG } from './config/gameConfig.js';

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
    
    // Vector magnitude
    static vectorMagnitude(vector) {
        return Math.sqrt(vector.x * vector.x + vector.y * vector.y);
    }
    
    // Generate random number between min and max
    static random(min, max) {
        return Math.random() * (max - min) + min;
    }
    
    // Generate random integer between min and max (inclusive)
    static randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    
    // Format score for display
    static formatScore(score) {
        return score.toLocaleString();
    }
    
    // URL parameter utilities
    static getURLParameter(name, defaultValue = null) {
        const params = new URLSearchParams(window.location.search);
        return params.get(name) || defaultValue;
    }

    static hasURLParameter(name) {
        const params = new URLSearchParams(window.location.search);
        return params.has(name);
    }
    
    static setURLParameter(name, value) {
        const url = new URL(window.location);
        url.searchParams.set(name, value);
        window.history.replaceState({}, '', url);
    }
    
    static removeURLParameter(name) {
        const url = new URL(window.location);
        url.searchParams.delete(name);
        window.history.replaceState({}, '', url);
    }
    
    // Level validation
    static validateLevel(level, maxLevel = LEVEL_CATALOG_CONFIG.maxGeneratedLevel) {
        const parsed = Number(level);
        if (!Number.isInteger(parsed) || parsed < LEVEL_CATALOG_CONFIG.firstLevel || parsed > maxLevel) {
            return null;
        }
        return parsed;
    }
    
}
