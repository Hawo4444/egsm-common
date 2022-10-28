module.id = "PRIM"

module.exports = {
    Broker: function (host, port, username, password) {
        return {
            host: host,
            port: port,
            username: username,
            password: password
        }
    },

    Engine(engineid, brokers, default_broker) {
        return {
            engineid: engineid,
            brokers: brokers,
            default_broker: default_broker,
        }
    },

    Worker: function (workerid, capacity, host, port) {
        return {
            id: workerid,
            capacity: capacity,
            host: host,
            port: port,
            engines: [],
            brokerconnections: []
        }
    },

    Agent: function (agentid, host, port) {
        return {
            id: agentid,
            host: host,
            port: port,
            processClasses: [],
            processes: []
        }
    },

}
