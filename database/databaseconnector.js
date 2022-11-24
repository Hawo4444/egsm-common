var DYNAMO = require('./dynamoconnector')
var LOG = require('../auxiliary/logManager');

module.id = 'DB-CONNECTOR'

//ARTIFACT-related operations
//Stakeholders should be a list of Strings
async function writeNewArtifactDefinition(artifactType, artifactId, stakeholders, host, port) {
    var pk = { name: 'ARTIFACT_TYPE', value: artifactType }
    var sk = { name: 'ARTIFACT_ID', value: artifactId }
    var attributes = []
    attributes.push({ name: 'STAKEHOLDERS', type: 'SS', value: stakeholders })
    //attributes.push({ name: 'ATTACHED_TO', type: 'SS', value: ['ROOT'] })
    attributes.push({ name: 'FAULTY_RATES', type: 'M', value: {} }) // Empty map for faulty rates
    attributes.push({ name: 'TIMING_FAULTY_RATES', type: 'M', value: {} })
    attributes.push({ name: 'HOST', type: 'S', value: host })
    attributes.push({ name: 'PORT', type: 'N', value: port.toString() })
    const result = await DYNAMO.writeItem('ARTIFACT_DEFINITION', pk, sk, attributes)
    return result
}

//TODO
/*async function readArtifactDefinition(artifactType, artifactId) {
    var pk = { name: 'ARTIFACT_TYPE', value: artifactType }
    var sk = { name: 'ARTIFACT_ID', value: artifactId }
    const data = await DYNAMO.readItem('ARTIFACT_DEFINITION', pk, sk)
    var final = undefined
    if (!data?.Item) {
        final = {
            artifacttype: data.Item?.ARTIFACT_TYPE.S,
            artifactid: data.Item?.ARTIFACT_ID.S,
            stakeholders: data.Item?.STAKEHOLDERS.L,
            attachedto: data.Item?.ATTACHED_TO.L,
            //faultyrates: data.Item?.FAULTY_RATES,
            //timingfaultyrates: data.Item?.TIMING_FAULTY_RATES,
            host: data.Item?.HOST,
            port: data.Item?.PORT,
        }
    }
}

async function writeArtifactAttachment(artifactType, artifactId, processid) {

}

async function writeArtifactDetachment(artifactType, artifactId, processid) {

}*/

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
        final.push({
            process_type: element.PROCESS_TYPE.S,
            entry_processed: Number(element.ENTRY_PROCESSED.N),
            artifact_state: element.ARTIFACT_STATE.S,
            artifact_name: element.ARTIFACT_NAME.S,
            event_id: element.EVENT_ID.S,
            timestamp: Number(element.UTC_TIME.N),
            process_id: element.PROCESS_ID.S,
        })
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
        final.push({
            process_type: element.PROCESS_TYPE.S,
            entry_processed: Number(element.ENTRY_PROCESSED.N),
            artifact_state: element.ARTIFACT_STATE.S,
            artifact_name: element.ARTIFACT_NAME.S,
            event_id: element.EVENT_ID.S,
            timestamp: Number(element.UTC_TIME.N),
            process_id: element.PROCESS_ID.S,
        })
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
        var buff = {
            CASE_ID: result[i]['CASE_ID']['S'],
            OUTCOME: result[i]['OUTCOME']['S'],
            PROCESS_TYPE: result[i]['PROCESS_TYPE']['S'],
            ARTIFACT_NAME: result[i]['ARTIFACT_NAME']['S'],
            DETACHED_TIME: result[i]['DETACHED_TIME']['N'],
            ATTACHED_TIME: result[i]['ATTACHED_TIME']['N'],
            PROCESS_ID: result[i]['PROCESS_ID']['S'],
        }
        final.push(buff)
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
async function writeNewProcessInstance(processtype, instanceid, stakeholders, startingtime, attached, host, port) {
    var pk = { name: 'PROCESS_TYPE_NAME', value: processtype }
    var sk = { name: 'INSTANCE_ID', value: instanceid }
    var attributes = []
    if (stakeholders && stakeholders.length > 0) {
        attributes.push({ name: 'STAKEHOLDERS', type: 'SS', value: stakeholders })
    }
    /*if (groups && groups.length > 0) {
        attributes.push({ name: 'GROUPS', type: 'SS', value: groups })
    }*/
    var attachedbuff = []
    if (attached) {
        attached.forEach(element => {
            attachedbuff.push({ S: element })
        });
    }

    attributes.push({ name: 'ATTACHED_TO', type: 'L', value: attachedbuff })
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
        final = {
            processtype: data['Item']['PROCESS_TYPE_NAME']['S'],
            instanceid: data['Item']['INSTANCE_ID']['S'],

            startingtime: Number(data['Item']['STARTING_TIME']['N']),
            endingtime: Number(data['Item']['ENDING_TIME']['N']),
            status: data['Item']['STATUS']['S'],
            stakeholders: data['Item']?.STAKEHOLDERS?.SS || [],
            //groups: data['Item']?.GROUPS?.SS || [],
            attached: [],
            host: data['Item']?.HOST?.S || 'localhost',
            port: Number(data['Item']?.PORT?.N) || 1883,
            outcome: data['Item']?.OUTCOME?.S
        }
    }
    var attachedbuff = data['Item']?.ATTACHED_TO?.L || []
    attachedbuff.forEach(element => {
        final['attached'].push(element['S'])
    });
    return final
}

async function attachArtifactToProcessInstance(processtype, instanceid, artifact) {
    var reading = await readProcessInstance(processtype, instanceid)
    if (!reading) {
        LOG.logSystem('ERROR', `Cannot attach artifact to ${processtype}/${instanceid}, because process instance is not defined in database`, module.id)
        return
    }

    const found = reading.attached.find(element => element == artifact);
    if (found) {
        LOG.logSystem('WARNING', `Artifact ${artifact} is already attached to ${processtype}/${instanceid}`, module.id)
        return
    }
    var updatedattached = reading.attached
    updatedattached.push(artifact)
    var attachedbuff = []
    updatedattached.forEach(element => {
        attachedbuff.push({ S: element })
    });
    var pk = { name: 'PROCESS_TYPE_NAME', value: processtype }
    var sk = { name: 'INSTANCE_ID', value: instanceid }
    var attributes = []
    attributes.push({ name: 'ATTACHED_TO', type: 'L', value: attachedbuff })
    return DYNAMO.updateItem('PROCESS_INSTANCE', pk, sk, attributes)
}

async function deattachArtifactFromProcessInstance(processtype, instanceid, artifact) {
    var reading = await readProcessInstance(processtype, instanceid)
    if (!reading) {
        LOG.logSystem('ERROR', `Cannot attach artifact to ${processtype}/${instanceid}, because process instance is not defined in database`, module.id)
        return
    }
    const index = reading.attached.indexOf(artifact)
    if (index == -1) {
        LOG.logSystem('WARNING', `Artifact ${artifact} is not attached to ${processtype}/${instanceid}, cannot be deattached`, module.id)
        return
    }
    var updatedattached = reading.attached
    updatedattached.splice(index, 1)
    var attachedbuff = []
    updatedattached.forEach(element => {
        attachedbuff.push({ S: element })
    });
    var pk = { name: 'PROCESS_TYPE_NAME', value: processtype }
    var sk = { name: 'INSTANCE_ID', value: instanceid }
    var attributes = []
    attributes.push({ name: 'ATTACHED_TO', type: 'L', value: attachedbuff })
    return DYNAMO.updateItem('PROCESS_INSTANCE', pk, sk, attributes)
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
        final = {
            id: data['Item']['STAKEHOLDER_ID']['S'],
            notificationdetails: data['Item']['NOTIFICATION_DETAILS']['S']
        }
    }
    return final
}

//PROCESS GROUP operations
async function writeNewProcessGroup(processgroupid, memberprocesses, grouptype, stakeholderrule, processtyperule) {
    var pk = { name: 'NAME', value: processgroupid }
    var attributes = []
    if (grouptype == undefined) {
        grouptype = 'static'
    }
    attributes.push({ name: 'GROUP_TYPE', type: 'S', value: grouptype })
    if (memberprocesses && memberprocesses.length > 0 && grouptype == 'static') {
        var buffer = []
        for (var i = 0; i < memberprocesses.length; i++) {
            buffer.push({ S: memberprocesses[i] })
        }
        attributes.push({ name: 'PROCESSES', type: 'L', value: buffer })
    }
    if (grouptype == 'dynamic') {
        attributes.push({ name: 'STAKEHOLDER_RULE', type: 'S', value: stakeholderrule })
        attributes.push({ name: 'PROCESS_TYPE_RULE', type: 'S', value: processtyperule })
    }
    return await DYNAMO.writeItem('PROCESS_GROUP_DEFINITION', pk, undefined, attributes)
}

async function readProcessGroup(processgroupid) {
    var pk = { name: 'NAME', value: processgroupid }
    const data = await DYNAMO.readItem('PROCESS_GROUP_DEFINITION', pk, undefined)
    var final = undefined
    if (data['Item'] != undefined) {
        final = {
            name: data['Item']['NAME']['S'],
            type: data['Item']['GROUP_TYPE']['S'],
            processes: []
        }
        if (final.type == 'dynamic') {
            final['stakeholder_rule'] = data['Item']?.STAKEHOLDER_RULE?.S || undefined
            final['process_type_rule'] = data['Item']?.PROCESS_TYPE_RULE?.S || undefined
        }
        var processesBuff = data['Item']?.PROCESSES?.L
        if (processesBuff) {
            processesBuff.forEach(element => {
                final.processes.push(element.S)
            });
        }
    }
    return final
}

async function addProcessToProcessGroup(processgroupid, newprocessid) {
    const reading = await readProcessGroup(processgroupid)
    if (reading == undefined) {
        LOG.logSystem('ERROR', `Cannot add process ${newprocessid} to process group ${processgroupid}, since the group is not defined`)
        return
        //return writeNewProcessGroup(processgroupid, [newprocessid])
    }

    //If the group is already defined
    var oldarray = reading?.processes || []
    if (!oldarray.includes(newprocessid)) {
        oldarray.push(newprocessid)
    }
    var newArray = []
    oldarray.forEach(element => {
        newArray.push({ S: element })
    });
    var pk = { name: 'NAME', value: processgroupid }
    var attributes = []
    attributes.push({ name: 'PROCESSES', type: 'L', value: newArray })
    const data = await DYNAMO.updateItem('PROCESS_GROUP_DEFINITION', pk, undefined, attributes)
    return data
}

async function removeProcessFromProcessGroup(processgroupid, processid) {
    const reading = await readProcessGroup(processgroupid)
    if (reading == undefined) {
        LOG.logSystem("WARNING", `Group not found ${processgroupid}`, module.id)
        return
    }

    //If the group is already defined
    var oldarray = reading?.processes || []
    if (oldarray.indexOf(processid) != -1) {
        var index = oldarray.indexOf(processid)
        oldarray.splice(index, 1)
    }

    var newArray = []
    oldarray.forEach(element => {
        newArray.push({ S: element })
    });
    var pk = { name: 'NAME', value: processgroupid }
    var attributes = []
    attributes.push({ name: 'PROCESSES', type: 'L', value: newArray })
    const data = await DYNAMO.updateItem('PROCESS_GROUP_DEFINITION', pk, undefined, attributes)
    return data
}

async function readProcessGroupByRules(stakeholderrule, processtyperule) {
    var keyexpression = 'STAKEHOLDER_RULE = :a'
    var expressionattributevalues = {
        ':a': { S: stakeholderrule },
        // ':b': { S: processtyperule },
    }
    if (processtyperule != undefined) {
        keyexpression += ' AND PROCESS_TYPE_RULE = :b'
        expressionattributevalues[':b'] = { S: processtyperule }
    }
    result = await DYNAMO.query('PROCESS_GROUP_DEFINITION', keyexpression, expressionattributevalues, undefined, undefined, 'RULE_INDEX')
    var final = []
    result.forEach(element => {
        final.push({
            name: element.NAME.S,
            type: element.GROUP_TYPE.S,
            processes: [],//element.ARTIFACT_STATE.S,
            stakeholder_rule: element?.STAKEHOLDER_RULE?.S || undefined,
            process_type_rule: element?.PROCESS_TYPE_RULE?.S || undefined,
        })
        var processesBuff = element?.PROCESSES?.SS
        if (processesBuff) {
            processesBuff.forEach(element => {
                final.processes.push(element)
            });
        }
    });
    return final
}

//STAGE EVENTS
async function writeStageEvent(stagelog) {
    var pk = { name: 'PROCESS_NAME', value: stagelog.processid }
    var sk = { name: 'EVENT_ID', value: stagelog.eventid }
    var attributes = []
    attributes.push({ name: 'TIMESTAMP', type: 'N', value: stagelog.timestamp.toString() })
    attributes.push({ name: 'STAGE_NAME', value: stagelog.stagename })
    attributes.push({ name: 'STAGE_STATUS', value: stagelog.status })
    attributes.push({ name: 'STAGE_STATE', value: stagelog.state })
    attributes.push({ name: 'STAGE_COMPLIANCE', value: stagelog.compliance })
    return DYNAMO.writeItem('STAGE_EVENT', pk, sk, attributes)
}

//async function writeStageEvent(stagelog) {
//    var pk = { name: 'PROCESS_NAME', value: stagelog.processid }
//    var sk = { name: 'EVENT_ID', value: stagelog.eventid }
//    var attributes = []
//    attributes.push({ name: 'TIMESTAMP', type: 'N', value: stagelog.timestamp.toString() })
//    attributes.push({ name: 'STAGE_NAME', value: stagelog.stagename })
//    attributes.push({ name: 'STAGE_STATUS', value: stagelog.status })
//    attributes.push({ name: 'STAGE_STATE', value: stagelog.state })
//    attributes.push({ name: 'STAGE_COMPLIANCE', value: stagelog.compliance })
//    return DYNAMO.writeItem('STAGE_EVENT', pk, sk, attributes)
//}


/*function writeNewProcessGroup(groupname) {
    var pk = { name: 'NAME', value: groupname }
    var attributes = []
    attributes.push({ name: 'PROCESSES', type: 'SS', value: ['ROOT'] })
    DYNAMO.writeItem('PROCESS_GROUP_DEFINITION', pk, undefined, attributes)
}

function addProcessToProcessGroup(groupname, processName) {
    DYNAMO.readItem('PROCESS_GROUP_DEFINITION', { name: 'NAME', value: groupname })
        .then(function (data) {
            var processes = []
            if (data.Item.PROCESSES) {
                console.log(data.Item.PROCESSES.SS)
                if (data.Item.PROCESSES.SS.includes(processName)) {
                    return
                }
                processes = [...data.Item.PROCESSES.SS];
            }
            processes.push(processName)
            DYNAMO.updateItem('PROCESS_GROUP_DEFINITION',
                { name: 'NAME', value: groupname },
                undefined,
                [{ name: 'PROCESSES', type: 'SS', value: processes }])
        }).catch(err => { console.log('error:' + err) })
}

function removeProcessFromProcessGroup(groupname, processName) {
    DYNAMO.readItem('PROCESS_GROUP_DEFINITION', { name: 'NAME', value: groupname })
        .then(function (data) {
            var processes = []
            if (!data.Item.PROCESSES) {
                return
            }
            else {
                console.log(data.Item.PROCESSES.SS)
                if (!data.Item.PROCESSES.SS.includes(processName)) {
                    return
                }
                for (var i = 0; i < data.Item.PROCESSES.SS.length; i++) {
                    if (data.Item.PROCESSES.SS[i] === processName) {
                        data.Item.PROCESSES.SS.splice(i, 1);
                    }
                }
                processes = [...data.Item.PROCESSES.SS];
                DYNAMO.updateItem('PROCESS_GROUP_DEFINITION',
                    { name: 'NAME', value: groupname },
                    undefined,
                    [{ name: 'PROCESSES', type: 'SS', value: processes }])
            }
        }).catch(err => { console.log('error:' + err) })
}*/

module.exports = {
    writeNewArtifactDefinition: writeNewArtifactDefinition,
    isArtifactDefined: isArtifactDefined,
    getArtifactStakeholders: getArtifactStakeholders,
    addNewFaultyRateWindow: addNewFaultyRateWindow,
    getArtifactFaultyRateLatest: getArtifactFaultyRateLatest,
    addArtifactFaultyRateToWindow: addArtifactFaultyRateToWindow,
    getArtifactFaultyRateValues: getArtifactFaultyRateValues,

    writeArtifactUsageEntry: writeArtifactUsageEntry,
    readArtifactUsageEntries: readArtifactUsageEntries,
    deleteArtifactUsageEntries: deleteArtifactUsageEntries,

    writeArtifactEvent: writeArtifactEvent,
    readUnprocessedArtifactEvents: readUnprocessedArtifactEvents,
    setArtifactEventToProcessed: setArtifactEventToProcessed,
    attachArtifactToProcessInstance: attachArtifactToProcessInstance,
    deattachArtifactFromProcessInstance: deattachArtifactFromProcessInstance,
    readOlderArtifactEvents: readOlderArtifactEvents,
    deleteArtifactEvent: deleteArtifactEvent,
    writeNewProcessType: writeNewProcessType,
    readProcessType: readProcessType,
    writeNewProcessInstance: writeNewProcessInstance,
    readProcessInstance: readProcessInstance,
    closeOngoingProcessInstance: closeOngoingProcessInstance,
    writeNewStakeholder: writeNewStakeholder,
    readStakeholder: readStakeholder,

    writeNewProcessGroup: writeNewProcessGroup,
    readProcessGroup: readProcessGroup,
    addProcessToProcessGroup: addProcessToProcessGroup,
    removeProcessFromProcessGroup: removeProcessFromProcessGroup,
    readProcessGroupByRules: readProcessGroupByRules,

    writeStageEvent: writeStageEvent,
}
