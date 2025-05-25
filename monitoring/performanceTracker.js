const LOG = require('../auxiliary/logManager');
const fs = require('fs');
const path = require('path');

class PerformanceTracker {
    constructor(componentId = 'unknown') {
        this.componentId = componentId;
        this.eventTraces = new Map(); // correlationId -> EventTrace
        this.processMetrics = new Map(); // processInstanceId -> ProcessMetrics
        this.sharedDir = path.resolve(__dirname, '../../../../shared-performance-data');
        this.ensureSharedDir();
        this.aggregatedStats = {
            totalEvents: 0,
            completedTraces: 0,
            incompleteTraces: 0,
            detectionDelays: [],
            processingLatencies: []
        };
        this.timeoutDuration = 30000; // 30 seconds timeout for incomplete traces
        this.moduleId = "PERF_TRACKER";
        this.loadSharedTraces();
    }

    ensureSharedDir() {
        try {
            if (!fs.existsSync(this.sharedDir)) {
                fs.mkdirSync(this.sharedDir, { recursive: true });
            }
        } catch (e) {
            // Fallback to local directory if shared fails
            this.sharedDir = './performance-data';
            if (!fs.existsSync(this.sharedDir)) {
                fs.mkdirSync(this.sharedDir, { recursive: true });
            }
        }
    }

    loadSharedTraces() {
        try {
            const tracesFile = path.join(this.sharedDir, 'traces.json');
            console.log(`[${this.componentId}] Loading shared traces from: ${tracesFile}`);

            if (fs.existsSync(tracesFile)) {
                const data = fs.readFileSync(tracesFile, 'utf8');
                const sharedTraces = JSON.parse(data);

                console.log(`[${this.componentId}] Found ${Object.keys(sharedTraces).length} shared traces`);

                // Only load recent traces (last hour) to keep memory usage low
                const oneHourAgo = Date.now() - (60 * 60 * 1000);
                let loadedCount = 0;
                Object.entries(sharedTraces).forEach(([correlationId, trace]) => {
                    if (trace.timestamps && trace.timestamps.T1_emulator_sent > oneHourAgo) {
                        this.eventTraces.set(correlationId, trace);
                        loadedCount++;
                    }
                });

                console.log(`[${this.componentId}] Loaded ${loadedCount} recent traces into memory`);
                console.log(`[${this.componentId}] Available correlation IDs:`, Array.from(this.eventTraces.keys()));
            } else {
                console.log(`[${this.componentId}] No shared traces file found at ${tracesFile}`);
            }
        } catch (e) {
            console.log(`[${this.componentId}] Error loading shared traces: ${e.message}`);
        }
    }

    saveSharedTraces() {
        // Add debug logging
        console.log(`[${this.componentId}] Saving ${this.eventTraces.size} traces to shared storage`);

        setImmediate(() => {
            try {
                const tracesFile = path.join(this.sharedDir, 'traces.json');
                const traceData = {};

                // Only save recent traces to keep file size manageable
                const oneHourAgo = Date.now() - (60 * 60 * 1000);
                this.eventTraces.forEach((trace, correlationId) => {
                    if (trace.timestamps && trace.timestamps.T1_emulator_sent > oneHourAgo) {
                        // Remove timeout handle before saving
                        const cleanTrace = { ...trace };
                        delete cleanTrace.timeoutHandle;
                        traceData[correlationId] = cleanTrace;
                    }
                });

                console.log(`[${this.componentId}] Writing ${Object.keys(traceData).length} traces to ${tracesFile}`);
                fs.writeFileSync(tracesFile, JSON.stringify(traceData, null, 2), 'utf8');
            } catch (e) {
                console.log(`[${this.componentId}] Error saving shared traces: ${e.message}`);
            }
        });
    }

    trackWorkerReceived(correlationId, additionalData = {}) {
        let trace = this.eventTraces.get(correlationId);
        if (!trace) {
            // Load from shared storage if not in memory
            this.loadSharedTraces();
            trace = this.eventTraces.get(correlationId);
        }

        if (trace && trace.status === 'pending') {
            trace.timestamps.T2_worker_received = Date.now();
            if (!trace.components.includes(this.componentId)) {
                trace.components.push(this.componentId);
            }
            this.saveSharedTraces();
        }
    }

    trackEngineProcessed(correlationId, generatedEvents = [], additionalData = {}) {
        let trace = this.eventTraces.get(correlationId);
        if (!trace) {
            this.loadSharedTraces();
            trace = this.eventTraces.get(correlationId);
        }

        if (trace) {
            trace.timestamps.T3_engine_processed = Date.now();
            if (!trace.components.includes(this.componentId)) {
                trace.components.push(this.componentId);
            }
            this.saveSharedTraces();
        }
    }

    trackAggregatorReceived(correlationId, additionalData = {}) {
        let trace = this.eventTraces.get(correlationId);
        if (!trace) {
            this.loadSharedTraces();
            trace = this.eventTraces.get(correlationId);
        }

        if (trace && trace.status === 'pending') {
            trace.timestamps.T4_aggregator_received = Date.now();
            if (!trace.components.includes(this.componentId)) {
                trace.components.push(this.componentId);
            }
            this.saveSharedTraces();
        }
    }

    trackDetectionComplete(correlationId, detectionResult = {}) {
        let trace = this.eventTraces.get(correlationId);
        if (!trace) {
            this.loadSharedTraces();
            trace = this.eventTraces.get(correlationId);
        }

        if (trace && trace.status === 'pending') {
            trace.timestamps.T5_detection_complete = Date.now();
            trace.status = 'completed';
            trace.detectionResult = detectionResult;

            if (!trace.components.includes(this.componentId)) {
                trace.components.push(this.componentId);
            }

            this.calculateTraceMetrics(trace);
            this.aggregatedStats.completedTraces++;
            this.saveSharedTraces();
        }
    }

    generateCorrelationId() {
        return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    trackEmulatorEvent(entityName, processInstance, eventData) {
        const correlationId = this.generateCorrelationId();
        const timestamp = Date.now();

        const eventTrace = {
            correlationId: correlationId,
            processInstance: processInstance,
            entityName: entityName,
            eventData: eventData,
            timestamps: {
                T1_emulator_sent: timestamp,
                T2_worker_received: null,
                T3_engine_processed: null,
                T4_aggregator_received: null,
                T5_detection_complete: null
            },
            status: 'pending',
            relatedEvents: [],
            timeoutHandle: null
        };

        // Set timeout for incomplete traces
        eventTrace.timeoutHandle = setTimeout(() => {
            this.markTraceIncomplete(correlationId, 'timeout');
        }, this.timeoutDuration);

        this.eventTraces.set(correlationId, eventTrace);
        this.aggregatedStats.totalEvents++;

        // Initialize process metrics if not exists
        if (!this.processMetrics.has(processInstance)) {
            this.processMetrics.set(processInstance, {
                processInstance: processInstance,
                totalEvents: 0,
                completedEvents: 0,
                avgDetectionDelay: 0,
                detectionDelays: []
            });
        }

        this.processMetrics.get(processInstance).totalEvents++;

        LOG.logSystem('DEBUG', `Started tracking event ${correlationId} for ${entityName}/${processInstance}`, this.moduleId);
        return correlationId;
    }

    // Track when worker receives event
    trackWorkerReceived(correlationId, additionalData = {}) {
        const trace = this.eventTraces.get(correlationId);
        if (trace && trace.status === 'pending') {
            trace.timestamps.T2_worker_received = Date.now();
            trace.workerData = additionalData;
            LOG.logSystem('DEBUG', `Worker received event ${correlationId}`, this.moduleId);
        }
    }

    // Track when engine processes event (may generate multiple events)
    trackEngineProcessed(correlationId, generatedEvents = [], additionalData = {}) {
        const trace = this.eventTraces.get(correlationId);
        if (trace) {
            trace.timestamps.T3_engine_processed = Date.now();
            trace.engineData = additionalData;
            trace.relatedEvents = generatedEvents;

            // If engine generates no events, mark as incomplete
            if (generatedEvents.length === 0) {
                this.markTraceIncomplete(correlationId, 'no_engine_output');
            }

            LOG.logSystem('DEBUG', `Engine processed event ${correlationId}, generated ${generatedEvents.length} events`, this.moduleId);
        }
    }

    // Track when aggregator receives event
    trackAggregatorReceived(correlationId, additionalData = {}) {
        const trace = this.eventTraces.get(correlationId);
        if (trace && trace.status === 'pending') {
            trace.timestamps.T4_aggregator_received = Date.now();
            trace.aggregatorData = additionalData;
            LOG.logSystem('DEBUG', `Aggregator received event ${correlationId}`, this.moduleId);
        }
    }

    // Track when detection/deviation algorithm completes
    trackDetectionComplete(correlationId, detectionResult = {}) {
        const trace = this.eventTraces.get(correlationId);
        if (trace && trace.status === 'pending') {
            trace.timestamps.T5_detection_complete = Date.now();
            trace.detectionResult = detectionResult;
            trace.status = 'completed';

            // Clear timeout
            if (trace.timeoutHandle) {
                clearTimeout(trace.timeoutHandle);
            }

            // Calculate metrics
            this.calculateTraceMetrics(trace);
            this.aggregatedStats.completedTraces++;

            LOG.logSystem('DEBUG', `Detection completed for event ${correlationId}`, this.moduleId);
        }
    }

    // Mark trace as incomplete
    markTraceIncomplete(correlationId, reason) {
        const trace = this.eventTraces.get(correlationId);
        if (trace && trace.status === 'pending') {
            trace.status = 'incomplete';
            trace.incompleteReason = reason;

            if (trace.timeoutHandle) {
                clearTimeout(trace.timeoutHandle);
            }

            this.aggregatedStats.incompleteTraces++;
            LOG.logSystem('DEBUG', `Marked trace ${correlationId} as incomplete: ${reason}`, this.moduleId);
        }
    }

    // Calculate metrics for a completed trace
    calculateTraceMetrics(trace) {
        const timestamps = trace.timestamps;

        // Detection delay (T5 - T1)
        if (timestamps.T1_emulator_sent && timestamps.T5_detection_complete) {
            const detectionDelay = timestamps.T5_detection_complete - timestamps.T1_emulator_sent;
            trace.detectionDelay = detectionDelay;
            this.aggregatedStats.detectionDelays.push(detectionDelay);

            // Update process-specific metrics
            const processMetrics = this.processMetrics.get(trace.processInstance);
            if (processMetrics) {
                processMetrics.completedEvents++;
                processMetrics.detectionDelays.push(detectionDelay);
                processMetrics.avgDetectionDelay =
                    processMetrics.detectionDelays.reduce((a, b) => a + b, 0) / processMetrics.detectionDelays.length;
            }
        }

        // Processing latencies for each stage
        const latencies = {};
        if (timestamps.T1_emulator_sent && timestamps.T2_worker_received) {
            latencies.emulator_to_worker = timestamps.T2_worker_received - timestamps.T1_emulator_sent;
        }
        if (timestamps.T2_worker_received && timestamps.T3_engine_processed) {
            latencies.worker_to_engine = timestamps.T3_engine_processed - timestamps.T2_worker_received;
        }
        if (timestamps.T3_engine_processed && timestamps.T4_aggregator_received) {
            latencies.engine_to_aggregator = timestamps.T4_aggregator_received - timestamps.T3_engine_processed;
        }
        if (timestamps.T4_aggregator_received && timestamps.T5_detection_complete) {
            latencies.aggregator_processing = timestamps.T5_detection_complete - timestamps.T4_aggregator_received;
        }

        trace.processingLatencies = latencies;
        this.aggregatedStats.processingLatencies.push(latencies);
    }

    // Get performance statistics
    getStatistics() {
        const stats = {
            summary: {
                totalEvents: this.aggregatedStats.totalEvents,
                completedTraces: this.aggregatedStats.completedTraces,
                incompleteTraces: this.aggregatedStats.incompleteTraces,
                completionRate: this.aggregatedStats.totalEvents > 0 ?
                    (this.aggregatedStats.completedTraces / this.aggregatedStats.totalEvents * 100).toFixed(2) : 0
            },
            detectionDelays: this.calculateDelayStatistics(this.aggregatedStats.detectionDelays),
            processingLatencies: this.calculateLatencyStatistics(),
            processBreakdown: this.getProcessBreakdown()
        };

        return stats;
    }

    // Calculate delay statistics (like the original paper)
    calculateDelayStatistics(delays) {
        if (delays.length === 0) return null;

        const sorted = [...delays].sort((a, b) => a - b);
        return {
            count: delays.length,
            min: Math.min(...delays),
            max: Math.max(...delays),
            mean: delays.reduce((a, b) => a + b, 0) / delays.length,
            median: sorted[Math.floor(sorted.length / 2)],
            p95: sorted[Math.floor(sorted.length * 0.95)],
            p99: sorted[Math.floor(sorted.length * 0.99)]
        };
    }

    // Calculate latency statistics for each processing stage
    calculateLatencyStatistics() {
        const stages = ['emulator_to_worker', 'worker_to_engine', 'engine_to_aggregator', 'aggregator_processing'];
        const latencyStats = {};

        stages.forEach(stage => {
            const values = this.aggregatedStats.processingLatencies
                .map(l => l[stage])
                .filter(v => v !== undefined);

            if (values.length > 0) {
                latencyStats[stage] = this.calculateDelayStatistics(values);
            }
        });

        return latencyStats;
    }

    // Get breakdown by process instance
    getProcessBreakdown() {
        const breakdown = [];
        this.processMetrics.forEach((metrics, processInstance) => {
            breakdown.push({
                processInstance: processInstance,
                totalEvents: metrics.totalEvents,
                completedEvents: metrics.completedEvents,
                completionRate: metrics.totalEvents > 0 ?
                    (metrics.completedEvents / metrics.totalEvents * 100).toFixed(2) : 0,
                avgDetectionDelay: metrics.avgDetectionDelay.toFixed(2)
            });
        });
        return breakdown;
    }

    // Export data for analysis
    exportData() {
        const exportData = {
            timestamp: new Date().toISOString(),
            statistics: this.getStatistics(),
            rawTraces: Array.from(this.eventTraces.values()).map(trace => {
                // Create a clean copy without the timeout handle
                const cleanTrace = { ...trace };
                delete cleanTrace.timeoutHandle;
                return cleanTrace;
            }),
            processMetrics: Array.from(this.processMetrics.entries())
        };

        return exportData;
    }

    // Reset all tracking data
    reset() {
        // Clear all timeouts
        this.eventTraces.forEach(trace => {
            if (trace.timeoutHandle) {
                clearTimeout(trace.timeoutHandle);
            }
        });

        this.eventTraces.clear();
        this.processMetrics.clear();
        this.aggregatedStats = {
            totalEvents: 0,
            completedTraces: 0,
            incompleteTraces: 0,
            detectionDelays: [],
            processingLatencies: []
        };

        LOG.logSystem('INFO', 'Performance tracker reset', this.moduleId);
    }

    // Find correlation ID by entity and process instance (for cases where you need to match events)
    findCorrelationByEntity(entityName, processInstance, timeWindow = 5000) {
        const now = Date.now();

        for (const [correlationId, trace] of this.eventTraces.entries()) {
            if (trace.entityName === entityName &&
                trace.processInstance === processInstance &&
                trace.status === 'pending' &&
                (now - trace.timestamps.T1_emulator_sent) <= timeWindow) {
                return correlationId;
            }
        }

        return null;
    }

    // Add this method to export data to file
    exportToFile(prefix = 'perf-data') {
        try {
            const exportDir = this.sharedDir;
            if (!fs.existsSync(exportDir)) {
                fs.mkdirSync(exportDir, { recursive: true });
            }

            const sharedData = this.loadAndCombineAllTraces();

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `${prefix}-${this.componentId}-${timestamp}.json`;
            const filepath = path.join(exportDir, filename);

            fs.writeFileSync(filepath, JSON.stringify(sharedData, null, 2));

            LOG.logSystem('INFO', `Performance data exported to ${filepath}`, this.moduleId);
            return filepath;
        } catch (error) {
            LOG.logSystem('ERROR', `Failed to export performance data: ${error.message}`, this.moduleId);
        }
    }

    loadAndCombineAllTraces() {
        this.loadSharedTraces(); // Refresh from shared storage

        return {
            timestamp: new Date().toISOString(),
            statistics: this.getStatistics(),
            rawTraces: Array.from(this.eventTraces.values()).map(trace => {
                const cleanTrace = { ...trace };
                delete cleanTrace.timeoutHandle;
                return cleanTrace;
            }),
            processMetrics: Array.from(this.processMetrics.entries()),
            componentId: this.componentId
        };
    }

    // Generate summary CSV
    generateSummaryCSV(data) {
        const stats = data.statistics;
        let csv = 'Metric,Value\n';

        // General stats
        csv += `Total Events,${stats.summary.totalEvents}\n`;
        csv += `Completed Traces,${stats.summary.completedTraces}\n`;
        csv += `Incomplete Traces,${stats.summary.incompleteTraces}\n`;
        csv += `Completion Rate (%),${stats.summary.completionRate}\n\n`;

        // Detection delay stats
        if (stats.detectionDelays) {
            csv += 'Detection Delays (ms)\n';
            csv += `Count,${stats.detectionDelays.count}\n`;
            csv += `Min,${stats.detectionDelays.min}\n`;
            csv += `Max,${stats.detectionDelays.max}\n`;
            csv += `Mean,${stats.detectionDelays.mean}\n`;
            csv += `Median,${stats.detectionDelays.median}\n`;
            csv += `P95,${stats.detectionDelays.p95}\n`;
            csv += `P99,${stats.detectionDelays.p99}\n\n`;
        }

        // Process breakdown
        csv += 'Process,Total Events,Completed Events,Completion Rate (%),Avg Detection Delay (ms)\n';
        stats.processBreakdown.forEach(p => {
            csv += `${p.processInstance},${p.totalEvents},${p.completedEvents},${p.completionRate},${p.avgDetectionDelay}\n`;
        });

        return csv;
    }

    // Generate detailed traces CSV
    generateTracesCSV(traces) {
        if (!traces || traces.length === 0) return 'No traces available';

        // Headers
        let csv = 'Correlation ID,Process Instance,Entity,Status,';
        csv += 'T1_emulator_sent,T2_worker_received,T3_engine_processed,T4_aggregator_received,T5_detection_complete,';
        csv += 'Detection Delay (ms),Emulator→Worker (ms),Worker→Engine (ms),Engine→Aggregator (ms),Aggregator Processing (ms)\n';

        // Data rows
        traces.forEach(trace => {
            const t = trace.timestamps;
            const l = trace.processingLatencies || {};

            csv += `${trace.correlationId},${trace.processInstance},${trace.entityName},${trace.status},`;
            csv += `${t.T1_emulator_sent || ''},${t.T2_worker_received || ''},${t.T3_engine_processed || ''},`;
            csv += `${t.T4_aggregator_received || ''},${t.T5_detection_complete || ''},`;
            csv += `${trace.detectionDelay || ''},${l.emulator_to_worker || ''},${l.worker_to_engine || ''},`;
            csv += `${l.engine_to_aggregator || ''},${l.aggregator_processing || ''}\n`;
        });

        return csv;
    }

    // Add a proper cleanup method that exports data before clearing
    cleanup() {
        const exportPaths = this.exportToFile();
        this.reset();
        return exportPaths;
    }
}

// Create singleton instance
const componentId = process.env.EGSM_COMPONENT_ID || 'unknown';
const performanceTracker = new PerformanceTracker(componentId);

module.exports = performanceTracker;