var AWS = require('aws-sdk');
var LOG = require('../auxiliary/LogManager')
var AUX = require('../auxiliary/auxiliary')
//LOG.setLogLevel(5)

var DYNAMO = require('./dynamoconnector')
var DB = require('./databaseconnector')

async function initTables() {
    var promises = []
    promises.push(DYNAMO.initTable('PROCESS_TYPE', 'PROCESS_TYPE_NAME', undefined))
    promises.push(DYNAMO.initTable('PROCESS_INSTANCE', 'PROCESS_TYPE_NAME', 'INSTANCE_ID'))
    promises.push(DYNAMO.initTable('PROCESS_GROUP_DEFINITION', 'NAME', undefined, { indexname: 'RULE_INDEX', pk: { name: 'STAKEHOLDER_RULE', type: 'S' }, sk: { name: 'PROCESS_TYPE_RULE', type: 'S' } }))
    promises.push(DYNAMO.initTable('STAKEHOLDERS', 'STAKEHOLDER_ID', undefined))

    promises.push(DYNAMO.initTable('ARTIFACT_DEFINITION', 'ARTIFACT_TYPE', 'ARTIFACT_ID'))
    promises.push(DYNAMO.initTable('ARTIFACT_USAGE', 'ARTIFACT_NAME', 'CASE_ID'))
    promises.push(DYNAMO.initTable('ARTIFACT_EVENT', 'ARTIFACT_NAME', 'EVENT_ID', { indexname: 'PROCESSED_INDEX', pk: { name: 'ENTRY_PROCESSED', type: 'N' } }))
    promises.push(DYNAMO.initTable('STAGE_EVENT', 'PROCESS_NAME', 'EVENT_ID'))
    await Promise.all(promises)
}

async function deleteTables() {
    var TABLES = [
        'PROCESS_TYPE', 'PROCESS_INSTANCE', 'PROCESS_GROUP_DEFINITION', 'STAKEHOLDERS',
        'ARTIFACT_EVENT', 'ARTIFACT_USAGE', 'ARTIFACT_DEFINITION', 'STAGE_EVENT'
    ]
    var promises = []
    TABLES.forEach(element => {
        promises.push(DYNAMO.deleteTable(element))
    });
    await Promise.all(promises)
}

beforeAll(() => {
    DYNAMO.initDynamo('fakeMyKeyId', 'fakeSecretAccessKey', 'local', 'http://localhost:9000')
});

beforeEach(async () => {
    LOG.setLogLevel(5)
    await initTables()
});

afterEach(async () => {
    await deleteTables()
})

//TEST CASES BEGIN

test('[writeNewArtifactDefinition] [WRITE AND READ]', async () => {
    await DB.writeNewArtifactDefinition('truck', 'instance-1', ['Best Truck Company', 'Maintainer Company'], 'localhost', 1883)

    var pk = { name: 'ARTIFACT_TYPE', value: 'truck' }
    var sk = { name: 'ARTIFACT_ID', value: 'instance-1' }
    const data = await DYNAMO.readItem('ARTIFACT_DEFINITION', pk, sk)
    var expected = {
        Item: {
            ARTIFACT_TYPE: { S: 'truck' },
            ARTIFACT_ID: { S: 'instance-1' },
            //ATTACHED_TO: { SS: [] },
            FAULTY_RATES: { M: {} },
            TIMING_FAULTY_RATES: { M: {} },
            STAKEHOLDERS: { SS: ['Best Truck Company', 'Maintainer Company'] },
            HOST: { S: 'localhost' },
            PORT: { N: '1883' }
        }
    }
    expect(data).toEqual(expected)
})

test('[isArtifactDefined] [WRITE AND READ]', async () => {
    await DB.writeNewArtifactDefinition('truck', 'instance-1', ['Best Truck Company', 'Maintainer Company'], '192.168.0.1', 1883)

    const data = await DB.isArtifactDefined('truck', 'instance-1')
    expect(data).toEqual(true)

    const data2 = await DB.isArtifactDefined('truck', 'instance-2')
    expect(data2).toEqual(false)
})

test('[getArtifactStakeholders] [WRITE AND READ]', async () => {
    //Assumed that the list is not empty (There is always at least one stakeholder)
    await DB.writeNewArtifactDefinition('truck', 'instance-1', ['Best Truck Company', 'Maintainer Company'], 'localhost', 1888)

    const data = await DB.getArtifactStakeholders('truck', 'instance-1')
    var expected = ["Best Truck Company", "Maintainer Company"]
    expect(data).toEqual(expected)
})

test('[addNewFaultyRateWindow] [WRITE AND READ]', async () => {
    //Adding a new Artifact
    await DB.writeNewArtifactDefinition('truck', 'instance-2', ['Best Truck Company', 'Maintainer Company'], 'localhost', 1883)

    //Defining a new Faulty Rate Window
    await DB.addNewFaultyRateWindow('truck', 'instance-2', 10)

    var pk = { name: 'ARTIFACT_TYPE', value: 'truck' }
    var sk = { name: 'ARTIFACT_ID', value: 'instance-2' }
    const data = await DYNAMO.readItem('ARTIFACT_DEFINITION', pk, sk, 'FAULTY_RATES.w10')

    var expected = {
        Item: {
            FAULTY_RATES: {
                M: {
                    w10: {
                        L: []
                    }
                }
            }
        }
    }
    expect(data).toEqual(expected)

    const data2 = await DYNAMO.readItem('ARTIFACT_DEFINITION', pk, sk, 'FAULTY_RATE_10')
    var expected2 = {
        Item: {
            FAULTY_RATE_10: {
                N: '-1'
            }
        }
    }
    expect(data2).toEqual(expected2)
})

test('[addArtifactFaultyRateToWindow] [WRITE AND READ]', async () => {
    //Adding a new Artifact
    await DB.writeNewArtifactDefinition('truck', 'instance-2', ['Best Truck Company', 'Maintainer Company'], 'localhost', 1883)

    //Defining a new Faulty Rate Window
    await DB.addNewFaultyRateWindow('truck', 'instance-2', 10)

    //Adding the first faulty rate to the prepared data structures
    await DB.addArtifactFaultyRateToWindow('truck', 'instance-2', 10, 1000, 25.254, 'case_123')

    var pk = { name: 'ARTIFACT_TYPE', value: 'truck' }
    var sk = { name: 'ARTIFACT_ID', value: 'instance-2' }
    const data = await DYNAMO.readItem('ARTIFACT_DEFINITION', pk, sk, 'FAULTY_RATES.w10')

    var expected = {
        Item: {
            FAULTY_RATES: {
                M: {
                    w10: {
                        L: [{ L: [{ S: 'case_123' }, { N: '1000' }, { N: '25.254' }] }]
                    }
                }
            }
        }
    }
    expect(data).toEqual(expected)

    const data2 = await DYNAMO.readItem('ARTIFACT_DEFINITION', pk, sk, 'FAULTY_RATE_10')
    var expected2 = {
        Item: {
            FAULTY_RATE_10: {
                N: '25.254'
            }
        }
    }
    expect(data2).toEqual(expected2)

    //Adding a second value to the same window
    await DB.addArtifactFaultyRateToWindow('truck', 'instance-2', 10, 1100, 15.15, 'case_321')

    const data3 = await DYNAMO.readItem('ARTIFACT_DEFINITION', pk, sk, 'FAULTY_RATES.w10')

    var expected3 = {
        Item: {
            FAULTY_RATES: {
                M: {
                    w10: {
                        L: [{ L: [{ S: 'case_123' }, { N: '1000' }, { N: '25.254' }] },
                        { L: [{ S: 'case_321' }, { N: '1100' }, { N: '15.15' }] }]
                    }
                }
            }
        }
    }
    expect(data3).toEqual(expected3)

    const data4 = await DYNAMO.readItem('ARTIFACT_DEFINITION', pk, sk, 'FAULTY_RATE_10')
    var expected4 = {
        Item: {
            FAULTY_RATE_10: {
                N: '15.15'
            }
        }
    }
    expect(data4).toEqual(expected4)

    //Adding a second window
    //Defining a new Faulty Rate Window
    await DB.addNewFaultyRateWindow('truck', 'instance-2', 20)

    //Adding the first faulty rate to the prepared data structures
    await DB.addArtifactFaultyRateToWindow('truck', 'instance-2', 20, 2000, 99.99, 'case_555')

    const data5 = await DYNAMO.readItem('ARTIFACT_DEFINITION', pk, sk, 'FAULTY_RATES')

    var expected5 = {
        Item: {
            FAULTY_RATES: {
                M: {
                    w10: {
                        L: [{ L: [{ S: 'case_123' }, { N: '1000' }, { N: '25.254' }] },
                        { L: [{ S: 'case_321' }, { N: '1100' }, { N: '15.15' }] }]
                    },
                    w20: {
                        L: [{ L: [{ S: 'case_555' }, { N: '2000' }, { N: '99.99' }] }]
                    }
                }
            }
        }
    }
    expect(data5).toEqual(expected5)

    const data6 = await DYNAMO.readItem('ARTIFACT_DEFINITION', pk, sk, 'FAULTY_RATE_20')
    var expected6 = {
        Item: {
            FAULTY_RATE_20: {
                N: '99.99'
            }
        }
    }
    expect(data6).toEqual(expected6)
})


test('[getArtifactFaultyRateValues] [WRITE AND READ]', async () => {
    //Adding a new Artifact
    await DB.writeNewArtifactDefinition('truck', 'instance-2', ['Best Truck Company', 'Maintainer Company'], 'localhost', 1883)

    //Defining a new Faulty Rate Window
    await DB.addNewFaultyRateWindow('truck', 'instance-2', 10)

    //Adding the first faulty rate to the prepared data structures
    await DB.addArtifactFaultyRateToWindow('truck', 'instance-2', 10, 1000, 25.254, 'case_123')

    const data = await DB.getArtifactFaultyRateValues('truck', 'instance-2', 10)

    var expected = [{ case_id: 'case_123', timestamp: 1000, faulty_rate: 25.254 }]
    expect(data).toEqual(expected)

    //Adding a second entry
    await DB.addArtifactFaultyRateToWindow('truck', 'instance-2', 10, 2000, 99.99, 'case_555')

    const data2 = await DB.getArtifactFaultyRateValues('truck', 'instance-2', 10)

    var expected2 = [{ case_id: 'case_123', timestamp: 1000, faulty_rate: 25.254 },
    { case_id: 'case_555', timestamp: 2000, faulty_rate: 99.99 }]
    expect(data2).toEqual(expected2)
})


test('[getArtifactFaultyRateLatest] [WRITE AND READ]', async () => {
    //Adding a new Artifact
    await DB.writeNewArtifactDefinition('truck', 'instance-3', ['Best Truck Company', 'Maintainer Company'], 'localhost', 1883)

    //Defining a new Faulty Rate Window
    await DB.addNewFaultyRateWindow('truck', 'instance-3', 10)

    const data = await DB.getArtifactFaultyRateLatest('truck', 'instance-3', 10)

    var expected = -1
    expect(data).toEqual(expected)

    //Adding the first faulty rate to the prepared data structures
    await DB.addArtifactFaultyRateToWindow('truck', 'instance-3', 10, 1000, 25.254, 'case_123')

    const data1 = await DB.getArtifactFaultyRateLatest('truck', 'instance-3', 10)

    var expected1 = 25.254
    expect(data1).toEqual(expected1)

    //Adding a second entry
    await DB.addArtifactFaultyRateToWindow('truck', 'instance-3', 10, 2000, 99.99, 'case_555')

    const data2 = await DB.getArtifactFaultyRateLatest('truck', 'instance-3', 10)

    var expected2 = 99.99
    expect(data2).toEqual(expected2)
})


//EVENT RELATED TESTS
test('[writeArtifactEvent] [WRITE AND READ]', async () => {
    //Writing Artifact Event
    var eventDetailJson = {
        timestamp: 1000,
        artifact_name: 'artifact/instance1',
        artifact_state: 'attached',
        process_type: 'process_type1',
        process_id: '001',
        event_id: 'event-001'
    }
    await DB.writeArtifactEvent(eventDetailJson)

    var pk = { name: 'ARTIFACT_NAME', value: 'artifact/instance1' }
    var sk = { name: 'EVENT_ID', value: 'event-001' }
    const data = await DYNAMO.readItem('ARTIFACT_EVENT', pk, sk)
    var expected = {
        Item: {
            ARTIFACT_NAME: { S: 'artifact/instance1' },
            EVENT_ID: { S: 'event-001' },
            UTC_TIME: { N: '1000' },
            ARTIFACT_STATE: { S: 'attached' },
            PROCESS_TYPE: { S: 'process_type1' },
            PROCESS_ID: { S: '001' },
            ENTRY_PROCESSED: { N: '0' }
        }
    }
    expect(data).toEqual(expected)

})


test('[readUnprocessedArtifactEvents] [WRITE AND READ]', async () => {
    //Writing Artifact Events
    for (var i = 0; i < 5; i++) {
        var eventDetailJson = {
            timestamp: 1000,
            artifact_name: 'artifact1/instance1',
            artifact_state: 'attached',
            process_type: 'process_type1',
            process_id: '001',
            event_id: `event-${i}`
        }
        await DB.writeArtifactEvent(eventDetailJson)
    }

    //Read unprocessed entries (all should be unprocessed)
    var data1 = await DB.readUnprocessedArtifactEvents('artifact1/instance1')
    var expected1 = []
    for (var i = 0; i < 5; i++) {
        expected1.push({
            timestamp: 1000,
            artifact_name: 'artifact1/instance1',
            artifact_state: 'attached',
            process_type: 'process_type1',
            process_id: '001',
            event_id: `event-${i}`,
            entry_processed: 0
        })
    }
    expect(data1).toEqual(expected1)

    //Add some further entries and read unprocessed entries
    //without specifying artifact
    for (var i = 0; i < 5; i++) {
        var eventDetailJson = {
            timestamp: 1000 + i,
            artifact_name: `artifact${i}/instance${i}`,
            artifact_state: 'detached',
            process_type: 'process_type1',
            process_id: '001',
            event_id: `event-${4 + i}`
        }
        await DB.writeArtifactEvent(eventDetailJson)
    }
    var data2 = await DB.readUnprocessedArtifactEvents()
    expect(data2.length).toEqual(10)
})

test('[readOlderArtifactEvents] [WRITE AND READ]', async () => {
    //Writing Artifact Events
    for (var i = 0; i < 15; i++) {
        var eventDetailJson = {
            timestamp: 1000 + i,
            artifact_name: 'artifact1/instance1',
            artifact_state: 'attached',
            process_type: 'process_type1',
            process_id: '001',
            event_id: `event-${i}`
        }
        await DB.writeArtifactEvent(eventDetailJson)
    }

    //Read unprocessed entries (all should be unprocessed)
    var data1 = await DB.readOlderArtifactEvents('artifact1/instance1', 1004)
    var expected1 = []
    for (var i = 0; i < 5; i++) {
        expected1.push({
            timestamp: 1000 + i,
            artifact_name: 'artifact1/instance1',
            artifact_state: 'attached',
            process_type: 'process_type1',
            process_id: '001',
            event_id: `event-${i}`,
            entry_processed: 0
        })
    }
    expect(data1).toEqual(expected1)
})

test('[setArtifactEventToProcessed] [WRITE AND READ]', async () => {
    //Writing Artifact Events
    for (var i = 0; i < 2; i++) {
        var eventDetailJson = {
            timestamp: 1000 + i,
            artifact_name: 'artifact1/instance1',
            artifact_state: 'attached',
            process_type: 'process_type1',
            process_id: '001',
            event_id: `event-${i}`
        }
        await DB.writeArtifactEvent(eventDetailJson)
    }

    for (var i = 0; i < 1; i++) {
        await DB.setArtifactEventToProcessed('artifact1/instance1', `event-${i}`)
    }

    //Read unprocessed entries (all should be unprocessed)
    var data1 = await DB.readUnprocessedArtifactEvents('artifact1/instance1')
    var expected1 = []
    for (var i = 1; i < 2; i++) {
        expected1.push({
            timestamp: 1000 + i,
            artifact_name: 'artifact1/instance1',
            artifact_state: 'attached',
            process_type: 'process_type1',
            process_id: '001',
            event_id: `event-${i}`,
            entry_processed: 0
        })
    }
    expect(data1).toEqual(expected1)
})

test('[deleteArtifactEvent] [WRITE AND READ]', async () => {
    //Writing Artifact Events
    for (var i = 0; i < 15; i++) {
        var eventDetailJson = {
            timestamp: 1000 + i,
            artifact_name: 'artifact1/instance1',
            artifact_state: 'attached',
            process_type: 'process_type1',
            process_id: '001',
            event_id: `event-${i}`
        }
        await DB.writeArtifactEvent(eventDetailJson)
    }

    for (var i = 0; i < 15; i++) {
        await DB.deleteArtifactEvent('artifact1/instance1', `event-${i}`)
    }

    //Read unprocessed entries (all should be unprocessed)
    var data1 = await DB.readUnprocessedArtifactEvents('artifact1/instance1')
    var expected1 = []

    expect(data1).toEqual(expected1)
})

test('[writeArtifactUsageEntry][readArtifactUsageEntries] [WRITE AND READ]', async () => {
    for (var i = 0; i < 5; i++) {
        await DB.writeArtifactUsageEntry('truck/001', `case_${i}`, 1000 + 1, 1500 + i, 'dummy', 'instance_1', 'success')
    }
    for (var i = 0; i < 5; i++) {
        await DB.writeArtifactUsageEntry('truck/001', `case_${i + 10}`, 1000 + 1, 1250 + i, 'dummy', 'instance_1', 'success')
    }

    var data1 = await DB.readArtifactUsageEntries('truck/001', 1500, 1500)
    var expected1 = [{
        "ARTIFACT_NAME": "truck/001",
        "ATTACHED_TIME": "1001",
        "CASE_ID": "case_0",
        "DETACHED_TIME": "1500",
        "OUTCOME": "success",
        "PROCESS_ID": "instance_1",
        "PROCESS_TYPE": "dummy",
    }]

    expect(data1).toEqual(expected1)

    var data2 = await DB.readArtifactUsageEntries('truck/001', 1250, 1499)
    var expected2 = []
    for (var i = 0; i < 5; i++) {
        expected2.push({
            "ARTIFACT_NAME": "truck/001",
            "ATTACHED_TIME": "1001",
            "CASE_ID": `case_${i + 10}`,
            "DETACHED_TIME": `${1250 + i}`,
            "OUTCOME": "success",
            "PROCESS_ID": "instance_1",
            "PROCESS_TYPE": "dummy",
        })
    }

    expect(data2).toEqual(expected2)
})

test('[writeArtifactUsageEntry][deleteArtifactUsageEntries] [WRITE AND DELETE]', async () => {
    for (var i = 0; i < 10; i++) {
        await DB.writeArtifactUsageEntry('truck/001', `case_${i}`, 1000 + 1, 1500 + i, 'dummy', 'instance_1', 'success')
    }

    for (var i = 0; i < 10; i++) {
        await DB.deleteArtifactUsageEntries('truck/001', `case_${i}`)
    }
    var data1 = await DB.readArtifactUsageEntries('truck/001', 1500, 1500)
    var expected1 = []

    expect(data1).toEqual(expected1)
})

test('[writeNewProcessType][WRITE AND READ]', async () => {

    await DB.writeNewProcessType('dummy', 'egsm', 'egsm_model', 'bpmn')
    var pk = { name: 'PROCESS_TYPE_NAME', value: 'dummy' }
    var data1 = await DYNAMO.readItem('PROCESS_TYPE', pk)
    var expected1 = {
        Item: {
            PROCESS_TYPE_NAME: { S: 'dummy' },
            EGSM_INFO: { S: 'egsm' },
            EGSM_MODEL: { S: 'egsm_model' },
            BPMN_MODEL: { S: 'bpmn' }
        }
    }
    expect(data1).toEqual(expected1)
})

test('[readProcessType][WRITE AND READ]', async () => {

    await DB.writeNewProcessType('dummy', 'egsm1', 'egsm_model', 'bpmn1')
    var data1 = await DB.readProcessType('dummy')
    var expected1 = {
        processtype: 'dummy',
        egsminfo: 'egsm1',
        egsmmodel: 'egsm_model',
        bpmnmodel: 'bpmn1'
    }
    expect(data1).toEqual(expected1)

    var data2 = await DB.readProcessType('dummy2')
    var expected2 = undefined
    expect(data2).toEqual(expected2)
})

test('[writeNewProcessInstance][readProcessInstance][WRITE AND READ]', async () => {
    await DB.writeNewProcessInstance('dummy1', 'instance-1', ['stakeholder1', 'stakeholder2', 'stakeholder3'], 1000, ['truck/instance-1'], 'localhost', 1883)
    const data1 = await DB.readProcessInstance('dummy1', 'instance-1')
    var expected1 = {
        processtype: 'dummy1',
        instanceid: 'instance-1',
        startingtime: 1000,
        endingtime: -1,
        status: 'ongoing',
        stakeholders: ['stakeholder1', 'stakeholder2', 'stakeholder3'],
        attached: ['truck/instance-1'],
        host: 'localhost',
        port: 1883,
        outcome: 'NA'
    }
    expect(data1).toEqual(expected1)

    //With empty arrays
    await DB.writeNewProcessInstance('dummy2', 'instance-1', [], 1000, [], '192.168.0.1', 1885)
    const data2 = await DB.readProcessInstance('dummy2', 'instance-1')
    var expected2 = {
        processtype: 'dummy2',
        instanceid: 'instance-1',
        startingtime: 1000,
        endingtime: -1,
        status: 'ongoing',
        stakeholders: [],
        attached: [],
        host: '192.168.0.1',
        port: 1885,
        outcome: 'NA'
    }
    expect(data2).toEqual(expected2)

    //Read undefined process
    const data3 = await DB.readProcessInstance('dummy22', 'instance-2')
    var expected3 = undefined
    expect(data3).toEqual(expected3)
})

test('[closeOngoingProcessInstance][WRITE AND READ]', async () => {
    await DB.writeNewProcessInstance('dummy1', 'instance-1', ['stakeholder1', 'stakeholder2', 'stakeholder3'], 1000, [], 'localhost', 1883)
    await DB.closeOngoingProcessInstance('dummy1', 'instance-1', 1550, 'success')

    const data1 = await DB.readProcessInstance('dummy1', 'instance-1')
    var expected1 = {
        processtype: 'dummy1',
        instanceid: 'instance-1',
        startingtime: 1000,
        endingtime: 1550,
        status: 'finished',
        stakeholders: ['stakeholder1', 'stakeholder2', 'stakeholder3'],
        attached: [],
        host: 'localhost',
        port: 1883,
        outcome: 'success'
    }
    expect(data1).toEqual(expected1)

    //With empty arrays
    await DB.writeNewProcessInstance('dummy2', 'instance-1', [], 1000, [], 'localhost', 1883)
    await DB.closeOngoingProcessInstance('dummy2', 'instance-1', 2560, 'failure')
    const data2 = await DB.readProcessInstance('dummy2', 'instance-1')
    var expected2 = {
        processtype: 'dummy2',
        instanceid: 'instance-1',
        startingtime: 1000,
        endingtime: 2560,
        status: 'finished',
        stakeholders: [],
        attached: [],
        host: 'localhost',
        port: 1883,
        outcome: 'failure'
    }
    expect(data2).toEqual(expected2)

    //Try to close undefined process
    expect(() => { DB.closeOngoingProcessInstance('dummy22', 'instance-3', 2560, 'ok') }).not.toThrow()
})

test('[attachArtifactToProcessInstance][WRITE AND READ]', async () => {
    await DB.writeNewProcessInstance('dummy1', 'instance-1', ['stakeholder1', 'stakeholder2', 'stakeholder3'], 1000, [], 'localhost', 1883)
    await DB.attachArtifactToProcessInstance('dummy1', 'instance-1', 'truck/instance-1')

    const data1 = await DB.readProcessInstance('dummy1', 'instance-1')
    var expected1 = {
        processtype: 'dummy1',
        instanceid: 'instance-1',
        startingtime: 1000,
        endingtime: -1,
        status: 'ongoing',
        stakeholders: ['stakeholder1', 'stakeholder2', 'stakeholder3'],
        attached: ['truck/instance-1'],
        host: 'localhost',
        port: 1883,
        outcome: 'NA'
    }
    expect(data1).toEqual(expected1)

    await DB.attachArtifactToProcessInstance('dummy1', 'instance-1', 'truck/instance-2')

    const data2 = await DB.readProcessInstance('dummy1', 'instance-1')
    var expected2 = {
        processtype: 'dummy1',
        instanceid: 'instance-1',
        startingtime: 1000,
        endingtime: -1,
        status: 'ongoing',
        stakeholders: ['stakeholder1', 'stakeholder2', 'stakeholder3'],
        attached: ['truck/instance-1', 'truck/instance-2'],
        host: 'localhost',
        port: 1883,
        outcome: 'NA'
    }
    expect(data2).toEqual(expected2)

    await DB.attachArtifactToProcessInstance('dummy1', 'instance-1', 'truck/instance-2')
    const data3 = await DB.readProcessInstance('dummy1', 'instance-1')
    expect(data3).toEqual(expected2)
})

test('[deattachArtifactFromProcessInstance][WRITE AND READ]', async () => {
    await DB.writeNewProcessInstance('dummy1', 'instance-1', ['stakeholder1', 'stakeholder2', 'stakeholder3'], 1000, [], 'localhost', 1883)
    await DB.deattachArtifactFromProcessInstance('dummy1', 'instance-1', 'truck1')
    const data1 = await DB.readProcessInstance('dummy1', 'instance-1')
    var expected1 = {
        processtype: 'dummy1',
        instanceid: 'instance-1',
        startingtime: 1000,
        endingtime: -1,
        status: 'ongoing',
        stakeholders: ['stakeholder1', 'stakeholder2', 'stakeholder3'],
        attached: [],
        host: 'localhost',
        port: 1883,
        outcome: 'NA'
    }
    expect(data1).toEqual(expected1)

    await DB.attachArtifactToProcessInstance('dummy1', 'instance-1', 'truck/instance-1')
    await DB.attachArtifactToProcessInstance('dummy1', 'instance-1', 'truck/instance-2')

    const data2 = await DB.readProcessInstance('dummy1', 'instance-1')
    var expected2 = {
        processtype: 'dummy1',
        instanceid: 'instance-1',
        startingtime: 1000,
        endingtime: -1,
        status: 'ongoing',
        stakeholders: ['stakeholder1', 'stakeholder2', 'stakeholder3'],
        attached: ['truck/instance-1', 'truck/instance-2'],
        host: 'localhost',
        port: 1883,
        outcome: 'NA'
    }
    expect(data2).toEqual(expected2)

    await DB.deattachArtifactFromProcessInstance('dummy1', 'instance-1', 'truck/instance-1')
    const data3 = await DB.readProcessInstance('dummy1', 'instance-1')
    var expected3 = {
        processtype: 'dummy1',
        instanceid: 'instance-1',
        startingtime: 1000,
        endingtime: -1,
        status: 'ongoing',
        stakeholders: ['stakeholder1', 'stakeholder2', 'stakeholder3'],
        attached: ['truck/instance-2'],
        host: 'localhost',
        port: 1883,
        outcome: 'NA'
    }
    expect(data3).toEqual(expected3)

    await DB.deattachArtifactFromProcessInstance('dummy1', 'instance-1', 'truck/instance-3')
    const data4 = await DB.readProcessInstance('dummy1', 'instance-1')
    expect(data4).toEqual(expected3)

    await DB.deattachArtifactFromProcessInstance('dummy1', 'instance-1', 'truck/instance-2')
    const data5 = await DB.readProcessInstance('dummy1', 'instance-1')
    var expected5 = {
        processtype: 'dummy1',
        instanceid: 'instance-1',
        startingtime: 1000,
        endingtime: -1,
        status: 'ongoing',
        stakeholders: ['stakeholder1', 'stakeholder2', 'stakeholder3'],
        attached: [],
        host: 'localhost',
        port: 1883,
        outcome: 'NA'
    }
    expect(data5).toEqual(expected5)

})


test('[writeNewStakeholder][readStakeholder][WRITE AND READ]', async () => {
    await DB.writeNewStakeholder('company1', 'mqtt')
    const data1 = await DB.readStakeholder('company1')
    var expected1 = {
        id: 'company1',
        notificationdetails: 'mqtt'
    }
    expect(data1).toEqual(expected1)

    //Try to read undefined
    const data2 = await DB.readStakeholder('company21')
    var expected2 = undefined
    expect(data2).toEqual(expected2)
})

test('[writeNewProcessGroup][readProcessGroup][WRITE AND READ]', async () => {
    //Define process group with non-empty process list and read back and no type definition
    await DB.writeNewProcessGroup('group-1', ['process-1', 'process-2'])
    const data1 = await DB.readProcessGroup('group-1')
    var expected1 = {
        name: 'group-1',
        processes: ['process-1', 'process-2'],
        type: 'static'
    }
    expect(data1).toEqual(expected1)

    //Define process group with empty process list and read back
    await DB.writeNewProcessGroup('group-2', [])

    const data2 = await DB.readProcessGroup('group-2')
    var expected2 = {
        name: 'group-2',
        processes: [],
        type: 'static'
    }
    expect(data2).toEqual(expected2)

    //Try to read non-defined process group
    const data3 = await DB.readProcessGroup('group-3')
    var expected3 = undefined
    expect(data3).toEqual(expected3)

    //Define type and rules as well
    await DB.writeNewProcessGroup('group-4', [], 'dynamic', 'Truck Company', 'Dummy Process')

    const data4 = await DB.readProcessGroup('group-4')
    var expected4 = {
        name: 'group-4',
        processes: [],
        type: 'dynamic',
        stakeholder_rule: 'Truck Company',
        process_type_rule: 'Dummy Process'
    }
    expect(data4).toEqual(expected4)

    //Define static type and no rules
    await DB.writeNewProcessGroup('group-5', [], 'static')

    const data5 = await DB.readProcessGroup('group-5')
    var expected5 = {
        name: 'group-5',
        processes: [],
        type: 'static'
    }
    expect(data5).toEqual(expected5)
})

test('[writeNewProcessGroup][addProcessToProcessGroup][readProcessGroup][WRITE AND READ]', async () => {
    //Define process group with non-empty process list and read back
    await DB.writeNewProcessGroup('group-1', ['process-1', 'process-2'])
    await DB.addProcessToProcessGroup('group-1', 'process-3')
    const data1 = await DB.readProcessGroup('group-1')
    var expected1 = {
        name: 'group-1',
        processes: ['process-1', 'process-2', 'process-3'],
        type: 'static'
    }
    expect(data1).toEqual(expected1)

    //Try to add the same instance again
    await DB.addProcessToProcessGroup('group-1', 'process-3')
    const data2 = await DB.readProcessGroup('group-1')
    var expected2 = {
        name: 'group-1',
        processes: ['process-1', 'process-2', 'process-3'],
        type: 'static'
    }
    expect(data2).toEqual(expected2)

    //Define process group with empty process list and read back
    await DB.writeNewProcessGroup('group-2', [])
    await DB.addProcessToProcessGroup('group-2', 'process-1')
    const data3 = await DB.readProcessGroup('group-2')
    var expected3 = {
        name: 'group-2',
        processes: ['process-1'],
        type: 'static'
    }
    expect(data3).toEqual(expected3)

    //Try to add process to non-defined process group
    await DB.addProcessToProcessGroup('group-4', 'process-1')
    const data4 = await DB.readProcessGroup('group-4')
    var expected4 = undefined
    expect(data4).toEqual(expected4)
})

test('[writeNewProcessGroup][removeProcessFromProcessGroup][readProcessGroup][WRITE AND REMOVE AND READ]', async () => {
    //Define process group with non-empty process list and read back
    await DB.writeNewProcessGroup('group-1', ['process-1', 'process-2', 'process-3'])
    await DB.removeProcessFromProcessGroup('group-1', 'process-2')
    const data1 = await DB.readProcessGroup('group-1')
    var expected1 = {
        name: 'group-1',
        processes: ['process-1', 'process-3'],
        type: 'static'
    }
    expect(data1).toEqual(expected1)

    //Define process group with empty process list and read back
    await DB.writeNewProcessGroup('group-2', ['process-1'], 'dynamic', 'stakeholder1', 'dummy1')
    await DB.removeProcessFromProcessGroup('group-2', 'process-1')
    const data2 = await DB.readProcessGroup('group-2')
    var expected2 = {
        name: 'group-2',
        processes: [],
        type: 'dynamic',
        stakeholder_rule: 'stakeholder1',
        process_type_rule: 'dummy1'
    }
    expect(data2).toEqual(expected2)
})

test('[writeNewProcessGroup][readProcessGroupByRules][readProcessGroup][WRITE AND READ]', async () => {
    await DB.writeNewProcessGroup('group-1', [], 'dynamic', 'Stakeholder 1', 'Dummy Process 1')
    await DB.writeNewProcessGroup('group-2', [], 'dynamic', 'Stakeholder 1', 'Dummy Process 2')
    await DB.writeNewProcessGroup('group-3', [], 'dynamic', 'Stakeholder 2', 'Dummy Process 3')

    const data1 = await DB.readProcessGroupByRules('Stakeholder 1', 'Dummy Process 1')
    const expected1 = [{
        name: 'group-1',
        processes: [],
        type: 'dynamic',
        stakeholder_rule: 'Stakeholder 1',
        process_type_rule: 'Dummy Process 1'
    }]
    expect(data1).toEqual(expected1)

    const data2 = await DB.readProcessGroupByRules('Stakeholder 2', 'Dummy Process 1')
    const expected2 = []
    expect(data2).toEqual(expected2)

    const data3 = await DB.readProcessGroupByRules('Stakeholder 1')
    const expected3 = [{
        name: 'group-1',
        processes: [],
        type: 'dynamic',
        stakeholder_rule: 'Stakeholder 1',
        process_type_rule: 'Dummy Process 1'
    },
    {
        name: 'group-2',
        processes: [],
        type: 'dynamic',
        stakeholder_rule: 'Stakeholder 1',
        process_type_rule: 'Dummy Process 2'
    }]
    expect(data3).toEqual(expected3)
})

test('[writeStageEvent][WRITE AND READ]', async () => {
    var stageLog1 = {
        processid: 'dummy/instance-1',
        eventid: '0001',
        timestamp: 10001,
        stagename: 'Stage-1',
        status: 'onTime',
        state: 'Opened',
        compliance: 'Compliant'
    }

    await DB.writeStageEvent(stageLog1)

    var stageLog2 = {
        processid: 'dummy/instance-1',
        eventid: '0002',
        timestamp: 10003,
        stagename: 'Stage-2',
        status: 'onTime',
        state: 'Opened',
        compliance: 'Compliant'
    }

    await DB.writeStageEvent(stageLog2)

    var pk = { name: 'PROCESS_NAME', value: 'dummy/instance-1' }
    var sk = { name: 'EVENT_ID', value: '0001' }
    const data = await DYNAMO.readItem('STAGE_EVENT', pk, sk)
    var expected = {
        Item: {
            PROCESS_NAME: { S: 'dummy/instance-1' },
            EVENT_ID: { S: '0001' },
            TIMESTAMP: { N: '10001' },
            STAGE_NAME: { S: 'Stage-1' },
            STAGE_STATUS: { S: 'onTime' },
            STAGE_STATE: { S: 'Opened' },
            STAGE_COMPLIANCE: { S: 'Compliant' }
        }
    }
    expect(data).toEqual(expected)
})