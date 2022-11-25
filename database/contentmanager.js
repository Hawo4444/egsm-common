var LOG = require('../auxiliary/logManager')
var DDB = require('./databaseconnector')

module.id = "CONTMAN"

async function defineProcessType(processtype, egsm_info, egsm_model, bpmn_model) {
    var existingProcess = await DDB.readProcessType(processtype)
    if (existingProcess) {
        LOG.logSystem('WARNING', `A process type is already defined with  ${processtype} name. Has not been modified!`, module.id)
        return false
    }
    await DDB.writeNewProcessType(processtype, egsm_info, egsm_model, bpmn_model).then((data, err) => {
        if (err) {
            LOG.logSystem('WARNING', `Error while adding process type ${processtype}`, module.id)
            return false
        }
        else {
            LOG.logSystem('DEBUG', `Process type ${processtype} added`, module.id)
            return true
        }
    })
}

async function defineAndStartProcessInstance(processtype, instanceid, stakeholders, host, port) {
    var existingProcess = DDB.readProcessInstance(processtype, instanceid)
    var existingProcessType = DDB.readProcessType(processtype)
    var value = await Promise.all([existingProcess, existingProcessType])
    //await Promise.all([existingProcess,existingProcessType])
    if (value[0] != undefined) {
        LOG.logSystem('WARNING', `Process instance ${processtype}/${instanceid} is already exist`, module.id)
        return false
    }
    if (value[1] == undefined) {
        LOG.logSystem('WARNING', `Process type ${processtype} is not defined yet, although ${instanceid} is an instance of that`, module.id)
    }

    var startingTime = Math.floor(new Date().getTime() / 1000)
    await DDB.writeNewProcessInstance(processtype, instanceid, stakeholders, startingTime, [], host, port).then((data, err) => {
        if (err) {
            LOG.logSystem('WARNING', `Error while adding process ${processtype}/${instanceid}`, module.id)
            return false
        }
        else {
            LOG.logSystem('DEBUG', `Process ${processtype}/${instanceid} added`, module.id)
            return true
        }
    })
}

async function closeProcessInstance(processtype, instanceid) {
    var read = await DDB.readProcessInstance(processtype, instanceid)
    if (read == undefined) {
        LOG.logSystem('WARNING', `Process instance ${processtype}/${instanceid} is not existing, cannot be closed`, module.id)
        return false
    }
    var closingTime = Math.floor(new Date().getTime() / 1000)
    await DDB.closeOngoingProcessInstance(processtype, instanceid, closingTime).then((data, err) => {
        if (err) {
            LOG.logSystem('WARNING', `Error while closing process type ${processtype}/${instanceid}`, module.id)
            return false
        }
        else {
            LOG.logSystem('DEBUG', `Process ${processtype}/${instanceid} closed`, module.id)
            return true
        }
    })
}

async function defineProcessGroup(groupid, memberprocesses, grouptype, stakeholderrule, processtyperule) {
    var reading = await DDB.readProcessGroup(groupid)
    if (reading) {
        LOG.logSystem('WARNING', `Process Group with name ${groupid} is already defined, has not been modified!`, module.id)
        return false
    }
    DDB.writeNewProcessGroup(groupid, memberprocesses, grouptype, stakeholderrule, processtyperule).then((data, err) => {
        if (err) {
            LOG.logSystem('WARNING', `Adding new Process Group with name ${groupid} was not successfull`, module.id)
            return false
        }
        else {
            LOG.logSystem('DEBUG', `New Process Group with name ${groupid} created`, module.id)
            return true
        }
    })
}

async function addProcessToProcessGroup(groupid, processid) {
    DDB.addProcessToProcessGroup(groupid, processid).then((data, err) => {
        if (err) {
            LOG.logSystem('WARNING', `Error while adding new Process with name ${processid} to group ${groupid}`, module.id)
            return false
        } else {
            LOG.logSystem('DEBUG', `${processid} added to Process Group ${groupid} created`, module.id)
            return true
        }
    })
}

async function defineArtifact(artifactType, artifactId, stakeholders, host, port) {
    var defined = await DDB.isArtifactDefined(artifactType, artifactId)

    if (defined) {
        LOG.logSystem('WARNING', `An Artifact is already defined with name ${artifactType}/${artifactId}`, module.id)
        return false
    }
    if (stakeholders == undefined) {
        stakeholders = []
    }
    DDB.writeNewArtifactDefinition(artifactType, artifactId, stakeholders, host, port).then((data, err) => {
        if (err) {
            LOG.logSystem('WARNING', `Error while defining new Artifact: ${artifactType}/${artifactId}`, module.id)
            return false
        }
        else {
            LOG.logSystem('DEBUG', `New Artifact ${artifactType}/${artifactId} added successfully`, module.id)
            return true
        }
    })
}

async function defineStakeholder(stakeholdername, notificationdetails) {
    const read = await DDB.readStakeholder(stakeholdername)
    if (read != undefined) {
        LOG.logSystem('WARNING', `Stakeholder with name ${stakeholdername} is alredy exist`, module.id)
        return false
    }
    DDB.writeNewStakeholder(stakeholdername, notificationdetails).then((data, err) => {
        if (err) {
            LOG.logSystem('WARNING', `Error while defining new Stakeholder: ${stakeholdername}`, module.id)
            return false
        }
        else {
            LOG.logSystem('DEBUG', `New Stakeholder ${stakeholdername} added successfully`, module.id)
            return true
        }
    })
}



module.exports = {
    defineProcessType: defineProcessType,
    defineAndStartProcessInstance: defineAndStartProcessInstance,
    closeProcessInstance: closeProcessInstance,
    //Defines a new process group (id and containing process instance id-s)
    defineProcessGroup: defineProcessGroup,
    addProcessToProcessGroup: addProcessToProcessGroup,
    defineArtifact: defineArtifact,
    defineStakeholder: defineStakeholder,
}