var UUID = require("uuid");

var DYNAMO = require('./dynamoconnector')
var LOG = require('../auxiliary/logManager');
const { Artifact, ArtifactEvent, ArtifactUsageEntry, ProcessInstance, Stakeholder, ProcessGroup } = require('../auxiliary/primitives')

module.id = 'DB-CONNECTOR'

//ARTIFACT-related operations
//Stakeholders should be a list of Strings
async function writeNewArtifactDefinition(artifactType, artifactId, stakeholders, host, port) {
    var pk = { name: 'ARTIFACT_TYPE', value: artifactType }
    var sk = { name: 'ARTIFACT_ID', value: artifactId }
    var attributes = []
    attributes.push({ name: 'STAKEHOLDERS', type: 'SS', value: stakeholders })
    attributes.push({ name: 'FAULTY_RATES', type: 'M', value: {} }) // Empty map for faulty rates
    attributes.push({ name: 'TIMING_FAULTY_RATES', type: 'M', value: {} })
    attributes.push({ name: 'HOST', type: 'S', value: host })
    attributes.push({ name: 'PORT', type: 'N', value: port.toString() })
    try {
        const result = await DYNAMO.writeItem('ARTIFACT_DEFINITION', pk, sk, attributes)
        return result
    } catch (error) {
        return 'error'
    }
}

async function readArtifactDefinition(artifactType, artifactId) {
    if (artifactType == undefined || artifactId == undefined || artifactType.length == 0 || artifactId.length == 0) {
        return undefined
    }
    var pk = { name: 'ARTIFACT_TYPE', value: artifactType }
    var sk = { name: 'ARTIFACT_ID', value: artifactId }
    const data = await DYNAMO.readItem('ARTIFACT_DEFINITION', pk, sk)
    var final = undefined
    if (data.Item?.ARTIFACT_TYPE != undefined) {
        final = new Artifact(data.Item?.ARTIFACT_TYPE.S,
            data.Item?.ARTIFACT_ID.S,
            data.Item?.STAKEHOLDERS.SS,
            data.Item?.FAULTY_RATES.M,
            data.Item?.TIMING_FAULTY_RATES.M,
            data.Item?.HOST.S,
            data.Item?.PORT.N)
    }
    return final
}

async function isArtifactDefined(artifactType, artifactId) {
    var pk = { name: 'ARTIFACT_TYPE', value: artifactType }
    var sk = { name: 'ARTIFACT_ID', value: artifactId }
    const data = await DYNAMO.readItem('ARTIFACT_DEFINITION', pk, sk)
    if (data.Item?.ARTIFACT_TYPE) {
        return true
    }
    return false
}


async function getArtifactStakeholders(artifactType, artifactId) {
    var keyexpression = 'ARTIFACT_TYPE = :a and ARTIFACT_ID = :b'
    var expressionattributevalues = {
        ':a': { S: artifactType },
        ':b': { S: artifactId },
    }
    var projectionexpression = `STAKEHOLDERS`
    const result = await DYNAMO.query('ARTIFACT_DEFINITION', keyexpression, expressionattributevalues, undefined, projectionexpression)
    if (result != undefined) {
        return result[0]['STAKEHOLDERS']['SS']
    }
    return []
}

async function addNewFaultyRateWindow(artifactType, artifactId, window) {
    var pk = { name: 'ARTIFACT_TYPE', value: artifactType }
    var sk = { name: 'ARTIFACT_ID', value: artifactId }

    await DYNAMO.initNestedList('ARTIFACT_DEFINITION', pk, sk, `FAULTY_RATES.w${window.toString()}`)

    var attributes = []
    attributes.push({ name: `FAULTY_RATE_${window.toString()}`, type: 'N', value: '-1' })
    return await DYNAMO.updateItem('ARTIFACT_DEFINITION', pk, sk, attributes)
}

async function addArtifactFaultyRateToWindow(artifactType, artifactId, window, timestamp, faultyrate, lastcaseid) {
    var pk = { name: 'ARTIFACT_TYPE', value: artifactType }
    var sk = { name: 'ARTIFACT_ID', value: artifactId }
    var item = { type: 'L', value: [{ 'S': lastcaseid }, { 'N': timestamp.toString() }, { 'N': faultyrate.toString() }] }

    const result = await DYNAMO.appendNestedListItem('ARTIFACT_DEFINITION', pk, sk, `FAULTY_RATES.w${window.toString()}`, [item])
    var attributes = []
    attributes.push({ name: `FAULTY_RATE_${window.toString()}`, type: 'N', value: `${faultyrate}` })
    await DYNAMO.updateItem('ARTIFACT_DEFINITION', pk, sk, attributes)
    return result
}

async function getArtifactFaultyRateValues(artifactType, artifactId, window) {
    var keyexpression = 'ARTIFACT_TYPE = :a and ARTIFACT_ID = :b'
    var expressionattributevalues = {
        ':a': { S: artifactType },
        ':b': { S: artifactId },
    }
    var projectionexpression = `FAULTY_RATES.w${window.toString()}`
    const result = await DYNAMO.query('ARTIFACT_DEFINITION', keyexpression, expressionattributevalues, undefined, projectionexpression)
    var final = []
    var list = result[0]['FAULTY_RATES']['M'][`w${window.toString()}`]['L']
    for (var i in list) {
        final.push({
            case_id: list[i]['L'][0]['S'],
            timestamp: Number(list[i]['L'][1]['N']),
            faulty_rate: Number(list[i]['L'][2]['N']),
        })
    }
    return final
}

async function getArtifactFaultyRateLatest(artifactType, artifactId, window) {
    var pk = { name: 'ARTIFACT_TYPE', value: artifactType }
    var sk = { name: 'ARTIFACT_ID', value: artifactId }
    const result = await DYNAMO.readItem('ARTIFACT_DEFINITION', pk, sk, `FAULTY_RATE_${window}`)
    var final = Number(result['Item'][`FAULTY_RATE_${window.toString()}`]['N'])
    return final
}

//Time faulty rate-related functions
//TODO: check (probably the code from the artifact faulty rate functions can be used)
/*async function addNewTimeFaultyRateWindow(artifactType, artifactId, window) {
    var pk = { name: 'ARTIFACT_TYPE', value: artifactType }
    var sk = { name: 'ARTIFACT_ID', value: artifactId }
    return DYNAMO.initNestedList('ARTIFACT_DEFINITION', pk, sk, `TIME_FAULTY_RATES.${window}`)
}

async function addArtifactTimeFaultyRateToWindow(artifactType, artifactId, window, timestamp, faultyrate, lastcaseid) {
    var pk = { name: 'ARTIFACT_TYPE', value: artifactType }
    var sk = { name: 'ARTIFACT_ID', value: artifactId }
    var item = { type: 'L', value: [{ 'S': lastcaseid }, { 'N': timestamp.toString() }, { 'N': faultyrate.toString() }] }

    return DYNAMO.appendNestedListItem('ARTIFACT_DEFINITION', pk, sk, `TIME_FAULTY_RATES.${window}`, [item])
}*/

function writeArtifactEvent(eventDetailsJson) {
    var pk = { name: 'ARTIFACT_NAME', value: eventDetailsJson.artifact_name }
    var sk = { name: 'EVENT_ID', value: eventDetailsJson.event_id.toString() }
    var attributes = []
    attributes.push({ name: 'UTC_TIME', type: 'N', value: eventDetailsJson.timestamp.toString() })
    attributes.push({ name: 'ARTIFACT_STATE', type: 'S', value: eventDetailsJson.artifact_state })
    attributes.push({ name: 'PROCESS_TYPE', type: 'S', value: eventDetailsJson.process_type })
    attributes.push({ name: 'PROCESS_ID', type: 'S', value: eventDetailsJson.process_id })
    attributes.push({ name: 'ENTRY_PROCESSED', type: 'N', value: '0' })

    return DYNAMO.writeItem('ARTIFACT_EVENT', pk, sk, attributes)
}

async function readUnprocessedArtifactEvents(artifactName) {
    var result = []
    if (artifactName == undefined) {
        var keyexpression = 'ENTRY_PROCESSED = :a'
        var expressionattributevalues = {
            ':a': { N: '0' },
        }
        result = await DYNAMO.query('ARTIFACT_EVENT', keyexpression, expressionattributevalues, undefined, undefined, 'PROCESSED_INDEX')
    }
    else {
        var keyexpression = 'ARTIFACT_NAME = :a'
        var expressionattributevalues = {
            ':a': { S: artifactName },
            ':b': { N: '0' }
        }
        var filterexpression = 'ENTRY_PROCESSED = :b'
        result = await DYNAMO.query('ARTIFACT_EVENT', keyexpression, expressionattributevalues, filterexpression)
    }
    var final = []
    result.forEach(element => {
        final.push(
            new ArtifactEvent(element.ARTIFACT_NAME.S, element.ARTIFACT_STATE.S, Number(element.UTC_TIME.N), element.PROCESS_TYPE.S, element.PROCESS_ID.S, element.EVENT_ID.S, Number(element.ENTRY_PROCESSED.N)))
    });
    return final
}

async function readOlderArtifactEvents(artifactName, upperutctime) {
    var keyexpression = 'ARTIFACT_NAME = :a'
    var expressionattributevalues = {
        ':a': { S: artifactName },
        ':b': { N: upperutctime.toString() }
    }
    var filterexpression = 'UTC_TIME <= :b'
    const result = await DYNAMO.query('ARTIFACT_EVENT', keyexpression, expressionattributevalues, filterexpression)
    var final = []
    result.forEach(element => {
        final.push(new ArtifactEvent(element.ARTIFACT_NAME.S, element.ARTIFACT_STATE.S, Number(element.UTC_TIME.N), element.PROCESS_TYPE.S, element.PROCESS_ID.S, element.EVENT_ID.S, Number(element.ENTRY_PROCESSED.N)))
    });
    return final
}

function setArtifactEventToProcessed(artifactname, eventid) {
    return DYNAMO.updateItem('ARTIFACT_EVENT', { name: 'ARTIFACT_NAME', value: artifactname },
        { name: 'EVENT_ID', value: eventid }, [{ name: 'ENTRY_PROCESSED', type: 'N', value: '1' }])
}

function deleteArtifactEvent(artifactname, eventid) {
    return DYNAMO.deleteItem('ARTIFACT_EVENT', { name: 'ARTIFACT_NAME', value: artifactname },
        { name: 'EVENT_ID', value: eventid })
}

function writeArtifactUsageEntry(artifactname, caseid, attachedtime, detachedtime, processtype, processid, outcome) {
    var pk = { name: 'ARTIFACT_NAME', value: artifactname }
    var sk = { name: 'CASE_ID', value: caseid }

    var attributes = []
    attributes.push({ name: 'ATTACHED_TIME', type: 'N', value: attachedtime.toString() })
    attributes.push({ name: 'DETACHED_TIME', type: 'N', value: detachedtime.toString() })
    attributes.push({ name: 'PROCESS_TYPE', type: 'S', value: processtype })
    attributes.push({ name: 'PROCESS_ID', type: 'S', value: processid })
    attributes.push({ name: 'OUTCOME', type: 'S', value: outcome })
    return DYNAMO.writeItem('ARTIFACT_USAGE', pk, sk, attributes)
}

async function readArtifactUsageEntries(artifactname, earliestdetachedtime, latestdetachedtime) {
    var keyexpression = 'ARTIFACT_NAME = :a'
    var expressionattributevalues = {
        ':a': { S: artifactname },
        ':b': { N: earliestdetachedtime.toString() },
        ':c': { N: latestdetachedtime.toString() },
    }
    var filterexpression = 'DETACHED_TIME >= :b AND DETACHED_TIME <= :c'
    const result = await DYNAMO.query('ARTIFACT_USAGE', keyexpression, expressionattributevalues, filterexpression)

    var final = []
    //var list = result[0]['FAULTY_RATES']['M']['w60']['L']
    for (var i in result) {
        final.push(new ArtifactUsageEntry(
            result[i]['ARTIFACT_NAME']['S'],
            result[i]['CASE_ID']['S'],
            Number(result[i]['ATTACHED_TIME']['N']),
            Number(result[i]['DETACHED_TIME']['N']),
            result[i]['PROCESS_TYPE']['S'],
            result[i]['PROCESS_ID']['S'],
            result[i]['OUTCOME']['S']))
    }
    return final
}

function deleteArtifactUsageEntries(artifactname, caseid) {
    return DYNAMO.deleteItem('ARTIFACT_USAGE', { name: 'ARTIFACT_NAME', value: artifactname },
        { name: 'CASE_ID', value: caseid })
}

//PROCESS_TYPE related operations
function writeNewProcessType(proccesstype, egsm_info, egsm_model, bpmn) {
    var pk = { name: 'PROCESS_TYPE_NAME', value: proccesstype }
    var attributes = []
    attributes.push({ name: 'EGSM_INFO', type: 'S', value: egsm_info })
    attributes.push({ name: 'EGSM_MODEL', type: 'S', value: egsm_model })
    attributes.push({ name: 'BPMN_MODEL', type: 'S', value: bpmn })
    return DYNAMO.writeItem('PROCESS_TYPE', pk, undefined, attributes)
}

async function readProcessType(proccesstype) {
    var pk = { name: 'PROCESS_TYPE_NAME', value: proccesstype }
    const data = await DYNAMO.readItem('PROCESS_TYPE', pk, undefined)
    var final = undefined
    if (data['Item']) {
        final =
        {
            processtype: data['Item']['PROCESS_TYPE_NAME']['S'],
            egsminfo: data['Item']['EGSM_INFO']['S'],
            egsmmodel: data['Item']['EGSM_MODEL']['S'],
            bpmnmodel: data['Item']['BPMN_MODEL']['S']
        }
    }
    return final
}

//PROCESS_INSTANCE-related operations

//Function to create a new process instance
//Process instance status is automatically set to 'ongoing'
//Status can be changed and end time can be added by closeOngoingProcessInstance function 
async function writeNewProcessInstance(processtype, instanceid, stakeholders, startingtime, host, port) {
    var pk = { name: 'PROCESS_TYPE_NAME', value: processtype }
    var sk = { name: 'INSTANCE_ID', value: instanceid }
    var attributes = []
    if (stakeholders && stakeholders.length > 0) {
        attributes.push({ name: 'STAKEHOLDERS', type: 'SS', value: stakeholders })
    }

    attributes.push({ name: 'STARTING_TIME', type: 'N', value: startingtime.toString() })
    attributes.push({ name: 'ENDING_TIME', type: 'N', value: '-1' })
    attributes.push({ name: 'STATUS', type: 'S', value: 'ongoing' })
    attributes.push({ name: 'HOST', type: 'S', value: host })
    attributes.push({ name: 'PORT', type: 'N', value: port.toString() })
    attributes.push({ name: 'OUTCOME', type: 'S', value: 'NA' })
    return DYNAMO.writeItem('PROCESS_INSTANCE', pk, sk, attributes)
}

async function readProcessInstance(processtype, instanceid) {
    var pk = { name: 'PROCESS_TYPE_NAME', value: processtype }
    var sk = { name: 'INSTANCE_ID', value: instanceid }

    const data = await DYNAMO.readItem('PROCESS_INSTANCE', pk, sk)
    var final = undefined
    if (data['Item']) {
        final = new ProcessInstance(data['Item']['PROCESS_TYPE_NAME']['S'],
            data['Item']['INSTANCE_ID']['S'],
            Number(data['Item']['STARTING_TIME']['N']),
            Number(data['Item']['ENDING_TIME']['N']),
            data['Item']['STATUS']['S'],
            data['Item']?.STAKEHOLDERS?.SS || [],
            data['Item']?.HOST?.S || 'localhost',
            Number(data['Item']?.PORT?.N) || 1883,
            data['Item']?.OUTCOME?.S)
    }
    return final
}

async function closeOngoingProcessInstance(processtype, instanceid, endtime, outcome) {
    var pk = { name: 'PROCESS_TYPE_NAME', value: processtype }
    var sk = { name: 'INSTANCE_ID', value: instanceid }
    var attributes = []
    attributes.push({ name: 'ENDING_TIME', type: 'N', value: endtime.toString() })
    attributes.push({ name: 'STATUS', type: 'S', value: 'finished' })
    attributes.push({ name: 'OUTCOME', type: 'S', value: outcome })
    await DYNAMO.updateItem('PROCESS_INSTANCE', pk, sk, attributes)
}

//STAKEHOLDER operations
async function writeNewStakeholder(stakeholderid, notificationdetails) {
    var pk = { name: 'STAKEHOLDER_ID', value: stakeholderid }
    var attributes = []
    attributes.push({ name: 'NOTIFICATION_DETAILS', type: 'S', value: notificationdetails })
    await DYNAMO.writeItem('STAKEHOLDERS', pk, undefined, attributes)
}

async function readStakeholder(stakeholderid) {
    var pk = { name: 'STAKEHOLDER_ID', value: stakeholderid }
    const data = await DYNAMO.readItem('STAKEHOLDERS', pk, undefined)
    var final = undefined
    if (data['Item']) {
        final = new Stakeholder(data['Item']['STAKEHOLDER_ID']['S'], data['Item']['NOTIFICATION_DETAILS']['S'])
    }
    return final
}

async function readAllStakeholder() {
    const data = await DYNAMO.scanTable('STAKEHOLDERS')
    var final = []
    if (data) {
        data.forEach(element => {
            final.push(
                new Stakeholder(element['STAKEHOLDER_ID']['S'], element['NOTIFICATION_DETAILS']['S']))
        })
    }

    return final
}

//PROCESS GROUP operations
async function writeNewProcessGroup(processgroupid, membershiprules) {
    var pk = { name: 'NAME', value: processgroupid }
    var attributes = []
    attributes.push({ name: 'MEMBERSHIP_RULES', type: 'S', value: JSON.stringify(membershiprules) })
    return await DYNAMO.writeItem('PROCESS_GROUP_DEFINITION', pk, undefined, attributes)
}

/**
 * 
 * @param {string} processgroupid 
 * @returns {ProcessGroup}
 */
async function readProcessGroup(processgroupid) {
    var pk = { name: 'NAME', value: processgroupid }
    const data = await DYNAMO.readItem('PROCESS_GROUP_DEFINITION', pk, undefined)
    var final = undefined
    if (data['Item'] != undefined) {
        final = new ProcessGroup(data['Item']['NAME']['S'], JSON.parse(data['Item']['MEMBERSHIP_RULES']['S']))
    }
    return final
}


//STAGE EVENTS
async function writeStageEvent(stagelog) {

    var pk = { name: 'PROCESS_NAME', value: stagelog.process_type + '/' + stagelog.process_id + '__' + stagelog.process_perspective }
    var sk = { name: 'EVENT_ID', value: stagelog.event_id }
    var attributes = []
    attributes.push({ name: 'PERSPECTIVE', value: stagelog.process_perspective })
    attributes.push({ name: 'TIMESTAMP', type: 'N', value: stagelog.timestamp.toString() })
    attributes.push({ name: 'STAGE_NAME', value: stagelog.stage_name })
    attributes.push({ name: 'STAGE_STATUS', value: stagelog.status })
    attributes.push({ name: 'STAGE_STATE', value: stagelog.state })
    attributes.push({ name: 'STAGE_COMPLIANCE', value: stagelog.compliance })
    return DYNAMO.writeItem('STAGE_EVENT', pk, sk, attributes)
}

module.exports = {
    //[ARTIFACT_DEFINITION] operations
    writeNewArtifactDefinition: writeNewArtifactDefinition,
    isArtifactDefined: isArtifactDefined,
    readArtifactDefinition: readArtifactDefinition,
    getArtifactStakeholders: getArtifactStakeholders,
    addNewFaultyRateWindow: addNewFaultyRateWindow,
    getArtifactFaultyRateLatest: getArtifactFaultyRateLatest,
    addArtifactFaultyRateToWindow: addArtifactFaultyRateToWindow,
    getArtifactFaultyRateValues: getArtifactFaultyRateValues,

    //[ARTIFACT_USAGE] operations
    writeArtifactUsageEntry: writeArtifactUsageEntry,
    readArtifactUsageEntries: readArtifactUsageEntries,
    deleteArtifactUsageEntries: deleteArtifactUsageEntries,

    //[ARTIFACT_EVENT] operations
    writeArtifactEvent: writeArtifactEvent,
    readUnprocessedArtifactEvents: readUnprocessedArtifactEvents,
    readOlderArtifactEvents: readOlderArtifactEvents,
    setArtifactEventToProcessed: setArtifactEventToProcessed,
    deleteArtifactEvent: deleteArtifactEvent,

    //[PROCESS_TYPE] operations
    writeNewProcessType: writeNewProcessType,
    readProcessType: readProcessType,

    //[PROCESS_INSTANCE] operations
    writeNewProcessInstance: writeNewProcessInstance,
    readProcessInstance: readProcessInstance,
    closeOngoingProcessInstance: closeOngoingProcessInstance,

    //[STAKEHOLDERS] operations
    writeNewStakeholder: writeNewStakeholder,
    readStakeholder: readStakeholder,
    readAllStakeholder: readAllStakeholder,

    //[PROCESS_GROUP_DEFINITION] operations
    writeNewProcessGroup: writeNewProcessGroup,
    readProcessGroup: readProcessGroup,

    //[STAGE_EVENT]
    writeStageEvent: writeStageEvent,
}
