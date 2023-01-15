var AWS = require('aws-sdk');
var LOG = require('../auxiliary/LogManager')
var AUX = require('../auxiliary/auxiliary')
//LOG.setLogLevel(5)

var DYNAMO = require('../database/dynamoconnector')
var DB = require('../database/databaseconnector');
const { Artifact, ArtifactEvent, ArtifactUsageEntry, ProcessInstance, Stakeholder, ProcessGroup, StageEvent, FaultyRateWindow, ProcessType, Perspective } = require('../auxiliary/primitives');

async function initTables() {
    var promises = []
    promises.push(DYNAMO.initTable('PROCESS_TYPE', 'PROCESS_TYPE_NAME', undefined))
    promises.push(DYNAMO.initTable('PROCESS_INSTANCE', 'PROCESS_TYPE_NAME', 'INSTANCE_ID'))
    promises.push(DYNAMO.initTable('PROCESS_GROUP_DEFINITION', 'NAME', undefined))
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
    DYNAMO.initDynamo('fakeMyKeyId', 'fakeSecretAccessKey', 'local', 'http://localhost:8000')
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
            FAULTY_RATES: { M: {} },
            TIMING_FAULTY_RATES: { M: {} },
            STAKEHOLDERS: { SS: ['Best Truck Company', 'Maintainer Company'] },
            HOST: { S: 'localhost' },
            PORT: { N: '1883' }
        }
    }
    expect(data).toEqual(expected)
})

test('[writeNewArtifactDefinition] [readArtifactDefinition]', async () => {
    await DB.writeNewArtifactDefinition('truck', 'instance-1', ['Best Truck Company', 'Maintainer Company'], 'localhost', 1883)
    const data = await DB.readArtifactDefinition('truck', 'instance-1')
    var expected = new Artifact('truck', 'instance-1', ['Best Truck Company', 'Maintainer Company'], new Map(), new Map(), 'localhost', '1883')
    expect(data).toEqual(expected)
})

test('[writeNewArtifactDefinition] [readArtifactDefinition] [not found]', async () => {
    await DB.writeNewArtifactDefinition('truck', 'instance-1', ['Best Truck Company', 'Maintainer Company'], 'localhost', 1883)
    const data = await DB.readArtifactDefinition('truck', 'instance-1')
    var expected = new Artifact('truck', 'instance-1', ['Best Truck Company', 'Maintainer Company'], new Map(), new Map(), 'localhost', '1883')
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
    await DB.addNewFaultyRateWindow('truck', 'instance-2', 15)

    const data = await DB.readArtifactDefinition('truck', 'instance-2')

    expect(data.faulty_rates.get(10).value).toEqual(-1)
    expect(data.faulty_rates.get(10).window_size).toEqual(10)
    expect(data.faulty_rates.get(10).earliest_usage_entry_time).toEqual(-1)
})

test('[updateArtifactFaultyRate] [WRITE AND READ]', async () => {
    //Adding a new Artifact
    await DB.writeNewArtifactDefinition('truck', 'instance-2', ['Best Truck Company', 'Maintainer Company'], 'localhost', 1883)

    //Defining a new Faulty Rate Window
    await DB.addNewFaultyRateWindow('truck', 'instance-2', 10)
    await DB.addNewFaultyRateWindow('truck', 'instance-2', 20)

    //Adding the first faulty rate to the prepared data structures
    var updateObj = new FaultyRateWindow(10, 55, 1000, 10)
    await DB.updateArtifactFaultyRate('truck', 'instance-2', updateObj)

    var updateObj2 = new FaultyRateWindow(20, 35, 1500, 5)
    await DB.updateArtifactFaultyRate('truck', 'instance-2', updateObj2)

    const data1 = await DB.readArtifactDefinition('truck', 'instance-2')
    expect(data1.faulty_rates.get(10).value).toEqual(55)
    expect(data1.faulty_rates.get(10).window_size).toEqual(10)
    expect(data1.faulty_rates.get(10).earliest_usage_entry_time).toEqual(10)
    expect(data1.faulty_rates.get(10).updated).toEqual(1000)

    const data2 = await DB.readArtifactDefinition('truck', 'instance-2')
    expect(data2.faulty_rates.get(20).value).toEqual(35)
    expect(data2.faulty_rates.get(20).window_size).toEqual(20)
    expect(data2.faulty_rates.get(20).earliest_usage_entry_time).toEqual(5)
    expect(data2.faulty_rates.get(20).updated).toEqual(1500)
})


test('[getArtifactFaultyRateValue] [WRITE AND READ]', async () => {

    //Adding a new Artifact
    await DB.writeNewArtifactDefinition('truck', 'instance-2', ['Best Truck Company', 'Maintainer Company'], 'localhost', 1883)

    //Defining a new Faulty Rate Window
    await DB.addNewFaultyRateWindow('truck', 'instance-2', 10)
    await DB.addNewFaultyRateWindow('truck', 'instance-2', 20)

    //Adding the first faulty rate to the prepared data structures
    var updateObj = new FaultyRateWindow(10, 55, 1000, 10)
    await DB.updateArtifactFaultyRate('truck', 'instance-2', updateObj)

    var updateObj2 = new FaultyRateWindow(20, 35, 1500, 5)
    await DB.updateArtifactFaultyRate('truck', 'instance-2', updateObj2)

    var updateObj3 = new FaultyRateWindow(10, 80, 1200, 15)
    await DB.updateArtifactFaultyRate('truck', 'instance-2', updateObj3)

    const data1 = await DB.getArtifactFaultyRateValue('truck', 'instance-2', 10)
    expect(data1.value).toEqual(80)
    expect(data1.window_size).toEqual(10)
    expect(data1.earliest_usage_entry_time).toEqual(15)
    expect(data1.updated).toEqual(1200)
})


//EVENT RELATED TESTS
test('[writeArtifactEvent] [WRITE AND READ]', async () => {
    //Writing Artifact Event

    var artifactEvent = new ArtifactEvent('artifact/instance1', 'attached', 1000, 'process_type1', '001', 'event-001')
    await DB.writeArtifactEvent(artifactEvent)

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
        var artifactEvent = new ArtifactEvent('artifact1/instance1', 'attached', 1000, 'process_type1', '001', `event-${i}`)
        await DB.writeArtifactEvent(artifactEvent)
    }

    //Read unprocessed entries (all should be unprocessed)
    var data1 = await DB.readUnprocessedArtifactEvents('artifact1/instance1')
    var expected1 = []
    for (var i = 0; i < 5; i++) {
        expected1.push(
            new ArtifactEvent('artifact1/instance1', 'attached', 1000, 'process_type1', '001', `event-${i}`, 0)
        )
    }
    expect(data1).toEqual(expected1)

    //Add some further entries and read unprocessed entries
    //without specifying artifact
    for (var i = 0; i < 5; i++) {
        var artifactEvent = new ArtifactEvent(`artifact${i}/instance${i}`, 'detached', 1000 + i, 'process_type1', '001', `event-${4 + i}`)
        await DB.writeArtifactEvent(artifactEvent)
    }
    var data2 = await DB.readUnprocessedArtifactEvents()
    expect(data2.length).toEqual(10)
})

test('[readOlderArtifactEvents] [WRITE AND READ]', async () => {
    //Writing Artifact Events
    for (var i = 0; i < 15; i++) {
        var artifactEvent = new ArtifactEvent('artifact1/instance1', 'attached', 1000 + i, 'process_type1', '001', `event-${i}`)
        await DB.writeArtifactEvent(artifactEvent)
    }

    //Read unprocessed entries (all should be unprocessed)
    var data1 = await DB.readOlderArtifactEvents('artifact1/instance1', 1004)
    var expected1 = []
    for (var i = 0; i < 5; i++) {

        expected1.push(
            new ArtifactEvent('artifact1/instance1', 'attached', 1000 + i, 'process_type1', '001', `event-${i}`, 0)
        )
    }
    expect(data1).toEqual(expected1)
})

test('[setArtifactEventToProcessed] [WRITE AND READ]', async () => {
    //Writing Artifact Events
    for (var i = 0; i < 2; i++) {
        var artifactEvent = new ArtifactEvent('artifact1/instance1', 'attached', 1000 + i, 'process_type1', '001', `event-${i}`)
        await DB.writeArtifactEvent(artifactEvent)
    }

    for (var i = 0; i < 1; i++) {
        await DB.setArtifactEventToProcessed('artifact1/instance1', `event-${i}`)
    }

    //Read unprocessed entries (all should be unprocessed)
    var data1 = await DB.readUnprocessedArtifactEvents('artifact1/instance1')
    var expected1 = []
    for (var i = 1; i < 2; i++) {
        expected1.push(
            new ArtifactEvent('artifact1/instance1', 'attached', 1000 + i, 'process_type1', '001', `event-${i}`, 0))
    }
    expect(data1).toEqual(expected1)
})

test('[deleteArtifactEvent] [WRITE AND READ]', async () => {
    //Writing Artifact Events
    for (var i = 0; i < 15; i++) {
        var artifactEvent = new ArtifactEvent('artifact1/instance1', 'attached', 1000 + i, 'process_type1', '001', `event-${i}`)
        await DB.writeArtifactEvent(artifactEvent)
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
        await DB.writeArtifactUsageEntry('truck/001', `case_${i}`, 1001 + i, 1500 + i, 'dummy', 'instance_1', 'success')
    }
    for (var i = 0; i < 5; i++) {
        await DB.writeArtifactUsageEntry('truck/001', `case_${i + 10}`, 1000 + i, 1250 + i, 'dummy', 'instance_1', 'success')
    }

    var data1 = await DB.readArtifactUsageEntries('truck/001', 1500, 1500)
    var expected1 = [
        new ArtifactUsageEntry('truck/001', 'case_0', 1001, 1500, 'dummy', 'instance_1', 'success')]

    expect(data1).toEqual(expected1)

    var data2 = await DB.readArtifactUsageEntries('truck/001', 1250, 1499)
    var expected2 = []
    for (var i = 0; i < 5; i++) {
        expected2.push(
            new ArtifactUsageEntry('truck/001', `case_${i + 10}`, i + 1000, 1250 + i, 'dummy', 'instance_1', 'success')
        )
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

    var perspective1 = new Perspective('pers-1', 'bpmn', 'egsm', 'info', 'bindings', ['egsm-1', 'egsm-2'])
    var perspective2 = new Perspective('pers-2', 'bpmn', 'egsm', 'info', 'bindings', ['egsm-3', 'egsm-4'])
    var processType = new ProcessType('type-1', ['Stakeholder-1'], 'Desc-1', 'BPMN', [perspective1, perspective2])
    await DB.writeNewProcessType(processType)
    var data1 = await DB.readProcessType('type-1')
    var expected1 = {
        process_type: 'type-1',
        definition: processType,
        instance_cnt: 0,
        bpmn_job_cnt: 0,
        statistics: {
            'pers-1': {
                'egsm-1': {
                    regular: 0,
                    faulty: 0,
                    unopened: 0,
                    opened: 0,
                    skipped: 0,
                    ontime: 0,
                    outoforder: 0,
                    skipdeviation_skipped: 0,
                    skipdeviation_outoforder: 0,
                    flow_violation: 0,
                    incomplete_execution: 0,
                    multi_execution: 0
                },
                'egsm-2': {
                    regular: 0,
                    faulty: 0,
                    unopened: 0,
                    opened: 0,
                    skipped: 0,
                    ontime: 0,
                    outoforder: 0,
                    skipdeviation_skipped: 0,
                    skipdeviation_outoforder: 0,
                    flow_violation: 0,
                    incomplete_execution: 0,
                    multi_execution: 0
                }

            },
            'pers-2': {
                'egsm-3': {
                    regular: 0,
                    faulty: 0,
                    unopened: 0,
                    opened: 0,
                    skipped: 0,
                    ontime: 0,
                    outoforder: 0,
                    skipdeviation_skipped: 0,
                    skipdeviation_outoforder: 0,
                    flow_violation: 0,
                    incomplete_execution: 0,
                    multi_execution: 0
                },
                'egsm-4': {
                    regular: 0,
                    faulty: 0,
                    unopened: 0,
                    opened: 0,
                    skipped: 0,
                    ontime: 0,
                    outoforder: 0,
                    skipdeviation_skipped: 0,
                    skipdeviation_outoforder: 0,
                    flow_violation: 0,
                    incomplete_execution: 0,
                    multi_execution: 0
                }
            },
        }
    }
    expect(data1).toEqual(expected1)
})

test('[writeProcessType][INCREASE COUNTERS][WRITE AND UPDATE AND READ]', async () => {
    var perspective1 = new Perspective('pers-1', 'bpmn', 'egsm', 'info', 'bindings', ['egsm-1', 'egsm-2'])
    var perspective2 = new Perspective('pers-2', 'bpmn', 'egsm', 'info', 'bindings', ['egsm-3', 'egsm-4'])
    var processType = new ProcessType('type-1', ['Stakeholder-1'], 'Desc-1', 'BPMN', [perspective1, perspective2])
    await DB.writeNewProcessType(processType)
    await DB.increaseProcessTypeInstanceCounter('type-1')
    var data1 = await DB.readProcessType('type-1')
    expect(data1.instance_cnt).toEqual(1)
    expect(data1.bpmn_job_cnt).toEqual(0)

    await DB.increaseProcessTypeBpmnJobCounter('type-1')
    var data2 = await DB.readProcessType('type-1')
    expect(data2.instance_cnt).toEqual(1)
    expect(data2.bpmn_job_cnt).toEqual(1)

    await DB.increaseProcessTypeInstanceCounter('type-1')
    await DB.increaseProcessTypeBpmnJobCounter('type-1')
    var data3 = await DB.readProcessType('type-1')
    expect(data3.instance_cnt).toEqual(2)
    expect(data3.bpmn_job_cnt).toEqual(2)
})

test('[updateProcessTypeStatistics][WRITE AND UPDATE AND READ]', async () => {
    var perspective1 = new Perspective('pers-1', 'bpmn', 'egsm', 'info', 'bindings', ['egsm-1', 'egsm-2'])
    var perspective2 = new Perspective('pers-2', 'bpmn', 'egsm', 'info', 'bindings', ['egsm-3', 'egsm-4'])
    var processType = new ProcessType('type-1', ['Stakeholder-1'], 'Desc-1', 'BPMN', [perspective1, perspective2])
    await DB.writeNewProcessType(processType)

    await DB.increaseProcessTypeStatisticsCounter('type-1','pers-1','egsm-2','skipped')
    var reading1 = await DB.readProcessType('type-1')
    expect(reading1.statistics['pers-1']['egsm-2']['skipped']).toEqual(1)

    await DB.increaseProcessTypeStatisticsCounter('type-1','pers-1','egsm-2','skipped')
    var reading2 = await DB.readProcessType('type-1')
    expect(reading2.statistics['pers-1']['egsm-2']['skipped']).toEqual(2)

    await DB.increaseProcessTypeStatisticsCounter('type-1','pers-1','egsm-1','outoforder')
    var reading3 = await DB.readProcessType('type-1')
    expect(reading3.statistics['pers-1']['egsm-1']['outoforder']).toEqual(1)

})

test('[writeNewProcessInstance][readProcessInstance][WRITE AND READ]', async () => {
    await DB.writeNewProcessInstance('dummy1', 'instance-1', ['stakeholder1', 'stakeholder2', 'stakeholder3'], 1000, 'localhost', 1883)
    const data1 = await DB.readProcessInstance('dummy1', 'instance-1')
    var expected1 = new ProcessInstance('dummy1', 'instance-1', 1000, -1, 'ongoing', ['stakeholder1', 'stakeholder2', 'stakeholder3'], 'localhost', 1883, 'NA')
    expect(data1).toEqual(expected1)

    //With empty arrays
    await DB.writeNewProcessInstance('dummy2', 'instance-1', [], 1000, '192.168.0.1', 1885)
    const data2 = await DB.readProcessInstance('dummy2', 'instance-1')
    var expected2 = new ProcessInstance('dummy2', 'instance-1', 1000, -1, 'ongoing', [], '192.168.0.1', 1885, 'NA')
    expect(data2).toEqual(expected2)

    //Read undefined process
    const data3 = await DB.readProcessInstance('dummy22', 'instance-2')
    var expected3 = undefined
    expect(data3).toEqual(expected3)
})

test('[closeOngoingProcessInstance][WRITE AND READ]', async () => {
    await DB.writeNewProcessInstance('dummy1', 'instance-1', ['stakeholder1', 'stakeholder2', 'stakeholder3'], 1000, 'localhost', 1883)
    await DB.closeOngoingProcessInstance('dummy1', 'instance-1', 1550, 'success')

    const data1 = await DB.readProcessInstance('dummy1', 'instance-1')
    var expected1 = new ProcessInstance('dummy1', 'instance-1', 1000, 1550, 'finished', ['stakeholder1', 'stakeholder2', 'stakeholder3'], 'localhost', 1883, 'success')
    expect(data1).toEqual(expected1)

    //With empty arrays
    await DB.writeNewProcessInstance('dummy2', 'instance-1', [], 1000, 'localhost', 1883)
    await DB.closeOngoingProcessInstance('dummy2', 'instance-1', 2560, 'failure')
    const data2 = await DB.readProcessInstance('dummy2', 'instance-1')
    var expected2 = new ProcessInstance('dummy2', 'instance-1', 1000, 2560, 'finished', [], 'localhost', 1883, 'failure')
    expect(data2).toEqual(expected2)

    //Try to close undefined process
    expect(() => { DB.closeOngoingProcessInstance('dummy22', 'instance-3', 2560, 'ok') }).not.toThrow()
})

test('[writeNewStakeholder][readStakeholder][WRITE AND READ]', async () => {
    await DB.writeNewStakeholder('company1', 'mqtt')
    const data1 = await DB.readStakeholder('company1')
    var expected1 = new Stakeholder('company1', 'mqtt')
    expect(data1).toEqual(expected1)

    //Try to read undefined
    const data2 = await DB.readStakeholder('company21')
    var expected2 = undefined
    expect(data2).toEqual(expected2)
})

test('[readAllStakeholder][WRITE AND READ]', async () => {
    await DB.writeNewStakeholder('company1', 'mqtt')
    await DB.writeNewStakeholder('company2', 'mqtt')
    await DB.writeNewStakeholder('company3', 'mqtt')
    await DB.writeNewStakeholder('company4', 'mqtt')

    data = await DB.readAllStakeholder()
    var expected = [
        new Stakeholder('company1', 'mqtt'),
        new Stakeholder('company2', 'mqtt'),
        new Stakeholder('company3', 'mqtt'),
        new Stakeholder('company4', 'mqtt')
    ]
    data.sort((a, b) => {
        if (a.name < b.name) {
            return -1;
        }
        if (a.name > b.name) {
            return 1;
        }
        return 0;
    })
    expected.sort((a, b) => {
        if (a.name < b.name) {
            return -1;
        }
        if (a.name > b.name) {
            return 1;
        }
        return 0;
    })
    expect(data).toEqual(expected)
})

test('[writeNewProcessGroup][readProcessGroup][WRITE AND READ]', async () => {
    //Define process group with non-empty process list and read back and no type definition
    await DB.writeNewProcessGroup('group-1', { PROCESS_TYPE: 'rule-1' })
    const data1 = await DB.readProcessGroup('group-1')
    var expected1 = new ProcessGroup('group-1', { PROCESS_TYPE: 'rule-1' })
    expect(data1).toEqual(expected1)

    //Try to read non-defined process group
    const data3 = await DB.readProcessGroup('group-3')
    var expected3 = undefined
    expect(data3).toEqual(expected3)
})

test('[writeStageEvent][WRITE AND READ]', async () => {
    var stageLog1 = new StageEvent('dummy', 'instance-1', 'Truck', '0001', 10001, 'Stage-1', 'Regular', 'Opened', 'onTime')
    await DB.writeStageEvent(stageLog1)
    var stageLog2 = new StageEvent('dummy', 'instance-1', 'Truck', '0002', 10003, 'Stage-2', 'Regular', 'Opened', 'OutOfOrder')

    await DB.writeStageEvent(stageLog2)

    var pk = { name: 'PROCESS_NAME', value: 'dummy/instance-1__Truck' }
    var sk = { name: 'EVENT_ID', value: '0001' }
    const data = await DYNAMO.readItem('STAGE_EVENT', pk, sk)
    var expected = {
        Item: {
            PROCESS_NAME: { S: 'dummy/instance-1__Truck' },
            PERSPECTIVE: { S: 'Truck' },
            EVENT_ID: { S: '0001' },
            TIMESTAMP: { N: '10001' },
            STAGE_NAME: { S: 'Stage-1' },
            STAGE_STATUS: { S: 'Regular' },
            STAGE_STATE: { S: 'Opened' },
            STAGE_COMPLIANCE: { S: 'onTime' }
        }
    }
    expect(data).toEqual(expected)
})
