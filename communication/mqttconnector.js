var mqtt = require("mqtt")
var LOG = require('../auxiliary/logManager')

module.id = "MQTT"

function MqttBroker(hostname, port, userName, userPassword, clientId) {
    var opts = { clean: true, host: hostname, port: port, username: userName, password: userPassword, keepalive: 30, clientId: clientId, protocolVersion: 5 };
    return {
        mqttclient: mqtt.connect(opts)
            .on('connect', function () {
                LOG.logWorker('DEBUG', `Connected to broker: ${hostname}:${port}`, module.id)
            })
            .on('disconnect', function () {
                LOG.logWorker('DEBUG', `Disconnected from broker: ${hostname}:${port}`, module.id)
            })
            .on('reconnect', function () {
                LOG.logWorker('DEBUG', `Reconnected to broker: ${hostname}:${port}`, module.id)
            })
            .on('error', function (error) {
                LOG.logWorker('DEBUG', `Broker error [${error}] at Broker: ${hostname}:${port}`, module.id)
            })
            .on('message', function (topic, message) {
                LOG.logWorker('DEBUG', `New message: [${hostname}:${port}]::[${topic}]->[${message}]`, module.id)
                ON_RECEIVED.forEach(element => {
                    element(hostname, port, topic, message)
                });
            })
    }
}

let BROKERS = new Map(); // {IP, PORT} -> BROKER_DETAILS
var ON_RECEIVED = []; //Array of function references called when a new message available from a topic
module.exports = {

    init: function (onReceivedFunction) {
        LOG.logWorker('DEBUG', `init called`, module.id)
        ON_RECEIVED.push(onReceivedFunction)
    },

    createConnection: function (hostname, port, username, userpassword, clientid) {
        LOG.logWorker('DEBUG', `createConnection called: ${hostname}:${port}`, module.id)
        if (!BROKERS.has([hostname, port].join(":"))) {
            var newBroker = new MqttBroker(hostname, port, username, userpassword, clientid)
            BROKERS.set([hostname, port].join(":"), newBroker)
            LOG.logWorker('DEBUG', `Connection created: ${hostname}:${port}`, module.id)
            return 'created'
        }
        LOG.logWorker('DEBUG', `Connection is already existing: ${hostname}:${port}`, module.id)
        return 'connection_exists'
    },

    closeConnection: function (hostname, port) {
        LOG.logWorker('DEBUG', `closeConnection called: ${hostname}:${port}`, module.id)
        if (BROKERS.has([hostname, port].join(":"))) {
            BROKERS.get([hostname, port].join(":")).mqttclient.end()
            BROKERS.delete([hostname, port].join(":"))
            LOG.logWorker('DEBUG', `Connection closed: ${hostname}:${port}`, module.id)
        }
    },

    publishTopic: function (hostname, port, topic, message, options = {}) {
        LOG.logWorker('DEBUG', `Publishing to: [${hostname}]:[${port}] -> [${topic}] :: [${message}]`, module.id)
        if (!BROKERS.has([hostname, port].join(":"))) {
            LOG.logWorker('WARNING', `Specified Broker is not defined: [${hostname}]:[${port}]`, module.id)
            return
        }

        const publishOptions = { qos: options.qos !== undefined ? options.qos : 0 };
        BROKERS.get([hostname, port].join(":")).mqttclient.publish(topic, message, publishOptions);
    },

    subscribeTopic: function (hostname, port, topic, nl = true) {
        return new Promise((resolve, reject) => {
            LOG.logWorker('DEBUG', `Subscribing to: [${hostname}]:[${port}] -> [${topic}]`, module.id);

            if (ON_RECEIVED.length < 1) {
                LOG.logWorker('WARNING', `ON_RECEIVED function not defined yet, use init() function!`, module.id);
            }

            if (!BROKERS.has([hostname, port].join(":"))) {
                LOG.logWorker('WARNING', `Specified Broker is not defined: [${hostname}]:[${port}]`, module.id);
                return reject(new Error(`Broker not defined: ${hostname}:${port}`));
            }

            const mqttclient = BROKERS.get([hostname, port].join(":")).mqttclient;

            mqttclient.subscribe(topic, { nl: nl }, (err, granted) => {
                if (err) {
                    LOG.logWorker('ERROR', `Subscribe failed for topic ${topic}: ${err}`, module.id);
                    return reject(err);
                } else {
                    LOG.logWorker('DEBUG', `Subscribed to ${topic} with granted: ${JSON.stringify(granted)}`, module.id);
                    return resolve(granted);
                }
            });
        });
    },

    unsubscribeTopic: function (hostname, port, topic) {
        return new Promise((resolve, reject) => {
            LOG.logWorker('DEBUG', `Unsubscribing from: [${hostname}]:[${port}] -> [${topic}]`, module.id);

            if (!BROKERS.has([hostname, port].join(":"))) {
                LOG.logWorker('WARNING', `Specified Broker is not defined: [${hostname}]:[${port}]`, module.id);
                return reject(new Error(`Broker not defined: ${hostname}:${port}`));
            }

            const mqttclient = BROKERS.get([hostname, port].join(":")).mqttclient;

            mqttclient.unsubscribe(topic, (err) => {
                if (err) {
                    LOG.logWorker('ERROR', `Unsubscribe failed for topic ${topic}: ${err}`, module.id);
                    return reject(err);
                } else {
                    LOG.logWorker('DEBUG', `Unsubscribed from ${topic}`, module.id);
                    return resolve();
                }
            });
        });
    },
};