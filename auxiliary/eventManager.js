// dependencies
var events = require('events');
var LogManager = require('./logManager');

// Import performance tracker - adjust path as needed for your structure
let performanceTracker;
try {
  performanceTracker = require('./monitoring/performance-tracker');
} catch (e) {
  // Fallback if performance tracker not available
  performanceTracker = null;
  LogManager.logEvent('Performance tracker not available: ' + e.message);
}

// generic event handling module
module.exports = {
  EventManager: function (engineID) {
    return {
      id: engineID,
      // initialize event handler instance
      eventEmitter: new events.EventEmitter(),
      // array of registered events
      events: [],

      emit: function (event, arg1, arg2) {
        // Handle performance tracking for emitted events
        if (performanceTracker && this.shouldTrackEvent(event, arg1, arg2)) {
          this.trackEmittedEvent(event, arg1, arg2);
        }

        //LogManager.logEvent('EMIT event emitted - ' + event + ' - ' + arg1 + ' - ' + arg2);
        this.eventEmitter.emit(event, arg1, arg2);
      },

      //handle listener registration (with custom logging)
      on: function (source, eventName, listener) {
        // Wrap the listener to add performance tracking
        const wrappedListener = this.wrapListenerForTracking(source, eventName, listener);
        
        //LogManager.logEvent('ON listener registered - ' + source + ' - ' + eventName);
        this.eventEmitter.on(eventName, wrappedListener);
        this.events.push(eventName);
      },

      //reset registered events
      reset: function () {
        for (var key in this.events) {
          //remove all listeners
          this.eventEmitter.removeAllListeners(this.events[key]);
          //LogManager.logEvent('REMOVE listener removed - ' + this.events[key]);
        }
      },

      // NEW: Check if event should be tracked for performance
      shouldTrackEvent: function(event, arg1, arg2) {
        if (!performanceTracker) return false;
        
        // Track events that have correlation IDs or are process-related
        if (typeof arg1 === 'object' && arg1 !== null) {
          return arg1._correlationId || arg1.correlationId || 
                 arg1.processInstance || arg1.process_instance;
        }
        
        if (typeof arg2 === 'object' && arg2 !== null) {
          return arg2._correlationId || arg2.correlationId || 
                 arg2.processInstance || arg2.process_instance;
        }
        
        // Track specific event types that are likely process-related
        const trackableEvents = [
          'process_event',
          'state_change', 
          'activity_start',
          'activity_end',
          'process_complete',
          'deviation_detected'
        ];
        
        return trackableEvents.includes(event);
      },

      // NEW: Track emitted events
      trackEmittedEvent: function(event, arg1, arg2) {
        try {
          const correlationId = this.extractCorrelationId(arg1, arg2);
          const eventData = this.extractEventData(event, arg1, arg2);
          
          if (correlationId) {
            // This is an engine processing completion
            performanceTracker.trackEngineProcessed(correlationId, 
              eventData.generatedEvents || [], 
              {
                engineId: this.id,
                eventType: event,
                timestamp: Date.now(),
                eventData: eventData
              }
            );
            
            LogManager.logEvent(`Performance tracked - Engine ${this.id} processed ${correlationId}`);
          }
        } catch (e) {
          LogManager.logEvent('Error in performance tracking: ' + e.message);
        }
      },

      // NEW: Wrap listeners to track received events
      wrapListenerForTracking: function(source, eventName, originalListener) {
        if (!performanceTracker) return originalListener;
        
        const engineId = this.id;
        
        return function(arg1, arg2) {
          // Track that this engine received an event
          try {
            const correlationId = extractCorrelationId(arg1, arg2);
            if (correlationId) {
              // This could be either worker->engine or a different internal event
              // We'll track it as a worker received event if it looks like an external input
              if (isExternalEvent(source, eventName, arg1, arg2)) {
                performanceTracker.trackWorkerReceived(correlationId, {
                  engineId: engineId,
                  source: source,
                  eventName: eventName,
                  timestamp: Date.now()
                });
              }
            }
          } catch (e) {
            LogManager.logEvent('Error in listener tracking: ' + e.message);
          }
          
          // Call the original listener
          return originalListener.call(this, arg1, arg2);
        };
      },

      // NEW: Extract correlation ID from arguments
      extractCorrelationId: function(arg1, arg2) {
        // Check first argument
        if (typeof arg1 === 'object' && arg1 !== null) {
          if (arg1._correlationId) return arg1._correlationId;
          if (arg1.correlationId) return arg1.correlationId;
          if (arg1.event && arg1.event._correlationId) return arg1.event._correlationId;
        }
        
        // Check second argument
        if (typeof arg2 === 'object' && arg2 !== null) {
          if (arg2._correlationId) return arg2._correlationId;
          if (arg2.correlationId) return arg2.correlationId;
          if (arg2.event && arg2.event._correlationId) return arg2.event._correlationId;
        }
        
        // Check if argument is a JSON string
        if (typeof arg1 === 'string') {
          try {
            const parsed = JSON.parse(arg1);
            if (parsed._correlationId) return parsed._correlationId;
            if (parsed.event && parsed.event._correlationId) return parsed.event._correlationId;
          } catch (e) {
            // Not JSON, ignore
          }
        }
        
        return null;
      },

      // NEW: Extract event data for tracking
      extractEventData: function(event, arg1, arg2) {
        const data = {
          eventType: event,
          generatedEvents: []
        };
        
        // If this is a response that generates new events, capture them
        if (typeof arg1 === 'object' && arg1 !== null) {
          if (arg1.events) data.generatedEvents = arg1.events;
          if (arg1.responses) data.generatedEvents = arg1.responses;
          if (arg1.processInstance) data.processInstance = arg1.processInstance;
        }
        
        return data;
      }
    }
  }
}

// Helper function to determine if this is an external event (from worker/queue)
function isExternalEvent(source, eventName, arg1, arg2) {
  // Events from external sources typically have these characteristics
  const externalSources = ['worker', 'queue', 'mqtt', 'message-handler'];
  const externalEvents = ['message_received', 'process_event', 'external_event'];
  
  return externalSources.includes(source) || 
         externalEvents.includes(eventName) ||
         (typeof arg1 === 'object' && arg1 !== null && arg1.external === true);
}

// Helper function to extract correlation ID (standalone version)
function extractCorrelationId(arg1, arg2) {
  // Check first argument
  if (typeof arg1 === 'object' && arg1 !== null) {
    if (arg1._correlationId) return arg1._correlationId;
    if (arg1.correlationId) return arg1.correlationId;
    if (arg1.event && arg1.event._correlationId) return arg1.event._correlationId;
  }
  
  // Check second argument  
  if (typeof arg2 === 'object' && arg2 !== null) {
    if (arg2._correlationId) return arg2._correlationId;
    if (arg2.correlationId) return arg2.correlationId;
    if (arg2.event && arg2.event._correlationId) return arg2.event._correlationId;
  }
  
  return null;
}