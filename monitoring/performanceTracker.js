const fs = require('fs');
const path = require('path');

class PerformanceTracker {
    constructor(componentId = 'unknown') {
        this.componentId = componentId;
        this.events = []; // Array of {eventId, timestamp, stage, data}
        this.moduleId = "PERF_TRACKER";
    }

    // Record any event with eventId and timestamp
    recordEvent(eventId, stage, additionalData = {}) {
        const record = {
            eventId: eventId,
            timestamp: Date.now(),
            stage: stage,
            componentId: this.componentId,
            ...additionalData
        };
        
        this.events.push(record);
        console.log(`[${this.componentId}] Recorded ${stage} for event ${eventId} at ${record.timestamp}`);
    }

    // Export all data to file
    exportToFile() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `performance-${this.componentId}-${timestamp}.json`;
            
            const data = {
                componentId: this.componentId,
                exportTime: new Date().toISOString(),
                totalEvents: this.events.length,
                events: this.events
            };

            fs.writeFileSync(filename, JSON.stringify(data, null, 2));
            console.log(`[${this.componentId}] Exported ${this.events.length} events to ${filename}`);
            return filename;
        } catch (error) {
            console.error(`[${this.componentId}] Failed to export: ${error.message}`);
        }
    }

    // Clear all data
    reset() {
        this.events = [];
        console.log(`[${this.componentId}] Reset performance data`);
    }

    // Get current stats
    getStats() {
        return {
            componentId: this.componentId,
            totalEvents: this.events.length,
            events: this.events
        };
    }
}

// Create singleton instance
const componentId = process.env.EGSM_COMPONENT_ID || 'unknown';
const performanceTracker = new PerformanceTracker(componentId);

module.exports = performanceTracker;