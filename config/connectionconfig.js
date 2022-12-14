var xml2js = require('xml2js');

var LOG = require('../auxiliary/logManager')
const { Broker } = require('../auxiliary/primitives');

module.id = "CONFIG"


valid = false
primary_broker = undefined

database_host = undefined
database_port = undefined
database_region = undefined
database_access_key_id = undefined
database_secret_access_key = undefined

self_id = undefined //This is a unique ID, will be set after startup, not from the config file


/**
 * Parses an XML string
 * @param {string} config Config input 
 * @returns The parsed XML file
 */
function parseConfigFile(config) {
    var final
    try {
        xml2js.parseString(config, function (err, result) {
            if (err) {
                LOG.logSystem('FATAL', `Error while parsing initialization file: ${err}`, module.id)
            }
            final = result
        })
    } catch (err) {
        LOG.logSystem('FATAL', `Error while parsing initialization file: ${err}`, module.id)
        return
    }
    return final
}

function applyConfig(configfilestr) {
    var config = parseConfigFile(configfilestr)
    try {
        var host = config['content']['broker'][0]['host'][0]
        var port = config['content']['broker'][0]['port'][0]
        var username = config['content']['broker'][0]['username'][0]
        var userpassword = config['content']['broker'][0]['user-password'][0]
        primary_broker = new Broker(host, port, username, userpassword)

        database_host = config['content']['database'][0]['host'][0]
        database_port = config['content']['database'][0]['port'][0]
        database_region = config['content']['database'][0]['region'][0]
        database_access_key_id = config['content']['database'][0]['access-key-id'][0]
        database_secret_access_key = config['content']['database'][0]['secret-access-key'][0]

        valid = true
        LOG.logSystem('DEBUG', `Configuration loaded successfully`, module.id)
    } catch (error) {
        LOG.logSystem('FATAL', `Error while parsing configuration file: ${error}`, module.id)
    }
}

function setSelfId(id) {
    self_id = id
}

function getConfig() {
    return {
        valid: valid,
        primary_broker: primary_broker,
        database_host: database_host,
        database_port: database_port,
        database_region: database_region,
        database_access_key_id: database_access_key_id,
        database_secret_access_key: database_secret_access_key,
        self_id: self_id
    }
}

module.exports = {
    applyConfig: applyConfig,
    setSelfId: setSelfId,
    getConfig: getConfig,
}