var LOG = require('../auxiliary/logManager')

module.id = "VALIDATOR"

function validateProcessType(processtypename) {
    if (processtypename.length < 1 || processtypename.includes('/')) {
        LOG('ERROR', `Process type name ${processtypename} is invalid`, module.id)
        return false
    }
    return true
}

function validateProcessInstance(processtypename, processinstancename) {
    var typeresult = validateProcessType(processtypename)
    if (!typeresult || processinstancename.length < 1 || processinstancename.includes('/')) {
        LOG('ERROR', `Process instance name ${processtypename}/${processinstancename} is invalid`, module.id)
        return false
    }
    return true
}

function validateArtifact(artifacttype, artifactinstancename) {
    if (artifacttype.length < 1 || artifacttype.includes('/') || artifactinstancename.length < 1 || artifactinstancename.includes('/')) {
        LOG('WARNING', `Artifact name ${artifacttype}/${artifactinstancename} is invalid`, module.id)
        return false
    }
    return true
}

function validateStageLogMessage(msgJson) {
    if (msgJson.process_type == undefined || msgJson.process_id == undefined || msgJson.process_perspective == undefined || msgJson.stage_name == undefined || msgJson.timestamp == undefined ||
        msgJson.status == undefined || msgJson.state == undefined || msgJson.compliance == undefined) {
        LOG.logWorker('WARNING', `Data is missing to write StageEvent log`, module.id)
        return false
    }
    return true
}

function validateArtifactLogMessage(msgJson) {
    if (msgJson.timestamp == undefined || msgJson.artifact_name == undefined || msgJson.artifact_state == undefined ||
        msgJson.process_type == undefined || msgJson.process_id == undefined) {
        LOG.logWorker('WARNING', `Data is missing to write ArtifactEvent log`, module.id)
        return false
    }
    return true
}

module.exports = {
    validateProcessType: validateProcessType,
    validateProcessInstance: validateProcessInstance,
    validateArtifact: validateArtifact,
    validateStageLogMessage: validateStageLogMessage,
    validateArtifactLogMessage: validateArtifactLogMessage,
}