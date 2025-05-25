const LOG = require('../auxiliary/logManager');
const fs = require('fs');
const path = require('path');

class PerformanceTracker {
    constructor() {
        this.eventTraces = new Map(); // correlationId -> EventTrace
        this.processMetrics = new Map(); // processInstanceId -> ProcessMetrics
        this.aggregatedStats = {
            totalEvents: 0,
            completedTraces: 0,
            incompleteTraces: 0,
            detectionDelays: [],
            processingLatencies: []
        };
        this.timeoutDuration = 30000; // 30 seconds timeout for incomplete traces
        this.moduleId = "PERF_TRACKER";
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
    calculateLatencyStatencies() {
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
            rawTraces: Array.from(this.eventTraces.values()),
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
    exportToFile(directory = './performance-logs', prefix = 'perf-data') {
        try {
            // Create directory if it doesn't exist
            if (!fs.existsSync(directory)) {
                fs.mkdirSync(directory, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/:/g, '-');
            const data = this.exportData();

            // Export raw JSON data (contains everything)
            const jsonFilePath = path.join(directory, `${prefix}-${timestamp}.json`);
            fs.writeFileSync(jsonFilePath, JSON.stringify(data, null, 2));

            // Export summary CSV (easier to import to Excel)
            const csvFilePath = path.join(directory, `${prefix}-summary-${timestamp}.csv`);
            const csvContent = this.generateSummaryCSV(data);
            fs.writeFileSync(csvFilePath, csvContent);

            // Export trace details CSV
            const tracesCsvPath = path.join(directory, `${prefix}-traces-${timestamp}.csv`);
            const tracesCsv = this.generateTracesCSV(data.rawTraces);
            fs.writeFileSync(tracesCsvPath, tracesCsv);

            LOG.logSystem('INFO', `Performance data exported to ${jsonFilePath}, ${csvFilePath}, and ${tracesCsvPath}`, this.moduleId);

            return {
                jsonPath: jsonFilePath,
                summaryPath: csvFilePath,
                tracesPath: tracesCsvPath
            };
        } catch (error) {
            LOG.logSystem('ERROR', `Failed to export performance data: ${error.message}`, this.moduleId);
            return null;
        }
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
const performanceTracker = new PerformanceTracker();

// Add shutdown handler to auto-export data
process.on('SIGINT', () => {
    LOG.logSystem('INFO', 'Received shutdown signal, exporting performance data...', "PERF_TRACKER");
    performanceTracker.exportToFile();
    process.exit(0);
});

module.exports = performanceTracker;