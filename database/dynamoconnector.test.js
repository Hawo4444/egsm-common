var LOG = require('../auxiliary/LogManager')
//LOG.setLogLevel(5)

var DYNAMO = require('./dynamoconnector')

beforeAll(() => {
    DYNAMO.initDynamo('fakeMyKeyId', 'fakeSecretAccessKey', 'local', 'http://localhost:8000')
});

beforeEach(async () => {
    LOG.setLogLevel(5)
    var promises = []
    promises.push(DYNAMO.initTable('TEST_TABLE_1', 'KEY_1', 'KEY_2'))
    promises.push(DYNAMO.initTable('TEST_TABLE_2', 'KEY_1', undefined))
    await Promise.all(promises)
});

afterEach(async () => {
    var promises = []
    promises.push(DYNAMO.deleteTable('TEST_TABLE_1'))
    promises.push(DYNAMO.deleteTable('TEST_TABLE_2'))
    await Promise.all(promises)
})


//TEST CASES BEGIN

test('[2 KEYS] [SINGLE ATTRIBUTE] [WRITE AND READ] [STRING ATTRIBUTE] [SUCCESSFUL]', async () => {
    var pk = { name: 'KEY_1', value: 'HASK_KEY_1' }
    var sk = { name: 'KEY_2', value: 'RANGE_KEY_1' }
    var attributes = []
    //await AUX.sleep(1000)
    attributes.push({ name: 'ATTRIBUTE_1', type: 'S', value: 'test_string' })
    await DYNAMO.writeItem('TEST_TABLE_1', pk, sk, attributes)

    const data = await DYNAMO.readItem('TEST_TABLE_1', pk, sk)
    var expected = {
        Item: {
            KEY_1: { S: 'HASK_KEY_1' },
            KEY_2: { S: 'RANGE_KEY_1' },
            ATTRIBUTE_1: { S: 'test_string' }
        }
    }
    expect(data).toEqual(expected)
})

test('[2 KEYS] [SINGLE ATTRIBUTE] [WRITE AND READ] [NUMERIX ATTRIBUTE] [SUCCESSFUL]', async () => {

    var pk = { name: 'KEY_1', value: 'HASK_KEY_1' }
    var sk = { name: 'KEY_2', value: 'RANGE_KEY_1' }
    var attributes = []
    //await AUX.sleep(1000)
    attributes.push({ name: 'ATTRIBUTE_1', type: 'N', value: '5555.1254' })
    await DYNAMO.writeItem('TEST_TABLE_1', pk, sk, attributes)

    const data = await DYNAMO.readItem('TEST_TABLE_1', pk, sk)
    var expected = {
        Item: {
            KEY_1: { S: 'HASK_KEY_1' },
            KEY_2: { S: 'RANGE_KEY_1' },
            ATTRIBUTE_1: { N: '5555.1254' }
        }
    }
    expect(data).toEqual(expected)
})

test('[2 KEYS] [SINGLE ATTRIBUTE] [WRITE AND READ] [STRING LIST ATTRIBUTE] [SUCCESSFUL]', async () => {

    var pk = { name: 'KEY_1', value: 'HASK_KEY_1' }
    var sk = { name: 'KEY_2', value: 'RANGE_KEY_1' }
    var attributes = []
    //await AUX.sleep(1000)
    attributes.push({ name: 'ATTRIBUTE_1', type: 'SS', value: ['list_element_1', 'list_element_2', 'list_element_3'] })
    await DYNAMO.writeItem('TEST_TABLE_1', pk, sk, attributes)

    const data = await DYNAMO.readItem('TEST_TABLE_1', pk, sk)
    var expected = {
        Item: {
            KEY_1: { S: 'HASK_KEY_1' },
            KEY_2: { S: 'RANGE_KEY_1' },
            ATTRIBUTE_1: { SS: ['list_element_1', 'list_element_2', 'list_element_3'] }
        }
    }
    expect(data).toEqual(expected)
})

test('[2 KEYS] [SINGLE ATTRIBUTE] [WRITE AND READ] [LIST ATTRIBUTE] [SUCCESSFUL]', async () => {

    var pk = { name: 'KEY_1', value: 'HASK_KEY_1' }
    var sk = { name: 'KEY_2', value: 'RANGE_KEY_1' }
    var attributes = []
    //await AUX.sleep(1000)
    attributes.push({ name: 'ATTRIBUTE_1', type: 'L', value: [{ S: 'list_element_1' }, { S: 'list_element_2' }, { N: '5555.555' }] })
    await DYNAMO.writeItem('TEST_TABLE_1', pk, sk, attributes)

    const data = await DYNAMO.readItem('TEST_TABLE_1', pk, sk)
    var expected = {
        Item: {
            KEY_1: { S: 'HASK_KEY_1' },
            KEY_2: { S: 'RANGE_KEY_1' },
            ATTRIBUTE_1: { L: [{ S: 'list_element_1' }, { S: 'list_element_2' }, { N: '5555.555' }] }
        }
    }
    expect(data).toEqual(expected)
})

test('[2 KEYS] [SINGLE ATTRIBUTE] [WRITE AND READ] [MAP ATTRIBUTE] [SUCCESSFUL]', async () => {

    var pk = { name: 'KEY_1', value: 'HASK_KEY_1' }
    var sk = { name: 'KEY_2', value: 'RANGE_KEY_1' }
    var attributes = []
    //await AUX.sleep(1000)
    attributes.push({
        name: 'ATTRIBUTE_1', type: 'M', value: {
            'key1': { S: 'list_element_1' },
            'key2': { S: 'list_element_2' }, 'key3': { N: '5555.555' }
        }
    })
    await DYNAMO.writeItem('TEST_TABLE_1', pk, sk, attributes)

    const data = await DYNAMO.readItem('TEST_TABLE_1', pk, sk)
    var expected = {
        Item: {
            KEY_1: { S: 'HASK_KEY_1' },
            KEY_2: { S: 'RANGE_KEY_1' },
            ATTRIBUTE_1: {
                M: {
                    'key1': { S: 'list_element_1' },
                    'key2': { S: 'list_element_2' }, 'key3': { N: '5555.555' }
                }
            }
        }
    }
    expect(data).toEqual(expected)
})


test('[1 KEYS] [SINGLE ATTRIBUTE] [WRITE AND READ] [STRING ATTRIBUTE] [SUCCESSFUL]', async () => {

    var pk = { name: 'KEY_1', value: 'HASK_KEY_1' }
    var attributes = []
    attributes.push({ name: 'ATTRIBUTE_1', type: 'S', value: 'test_string' })
    await DYNAMO.writeItem('TEST_TABLE_2', pk, undefined, attributes)

    const data = await DYNAMO.readItem('TEST_TABLE_2', pk)
    var expected = {
        Item: {
            KEY_1: { S: 'HASK_KEY_1' },
            ATTRIBUTE_1: { S: 'test_string' }
        }
    }
    expect(data).toEqual(expected)
})

test('[1 KEYS] [SINGLE ATTRIBUTE] [WRITE AND READ] [NUMERIX ATTRIBUTE] [SUCCESSFUL]', async () => {

    var pk = { name: 'KEY_1', value: 'HASK_KEY_1' }
    var attributes = []
    attributes.push({ name: 'ATTRIBUTE_1', type: 'N', value: '5555.1254' })
    await DYNAMO.writeItem('TEST_TABLE_2', pk, undefined, attributes)

    const data = await DYNAMO.readItem('TEST_TABLE_2', pk)
    var expected = {
        Item: {
            KEY_1: { S: 'HASK_KEY_1' },
            ATTRIBUTE_1: { N: '5555.1254' }
        }
    }
    expect(data).toEqual(expected)
})

test('[1 KEYS] [SINGLE ATTRIBUTE] [WRITE AND READ] [STRING LIST ATTRIBUTE] [SUCCESSFUL]', async () => {

    var pk = { name: 'KEY_1', value: 'HASK_KEY_1' }
    var attributes = []
    attributes.push({ name: 'ATTRIBUTE_1', type: 'SS', value: ['list_element_1', 'list_element_2', 'list_element_3'] })
    await DYNAMO.writeItem('TEST_TABLE_2', pk, undefined, attributes)

    const data = await DYNAMO.readItem('TEST_TABLE_2', pk)
    var expected = {
        Item: {
            KEY_1: { S: 'HASK_KEY_1' },
            ATTRIBUTE_1: { SS: ['list_element_1', 'list_element_2', 'list_element_3'] }
        }
    }
    expect(data).toEqual(expected)
})

test('[1 KEYS] [SINGLE ATTRIBUTE] [WRITE AND READ] [LIST ATTRIBUTE] [SUCCESSFUL]', async () => {

    var pk = { name: 'KEY_1', value: 'HASK_KEY_1' }
    var attributes = []
    attributes.push({ name: 'ATTRIBUTE_1', type: 'L', value: [{ S: 'list_element_1' }, { S: 'list_element_2' }, { N: '5555.555' }] })
    await DYNAMO.writeItem('TEST_TABLE_2', pk, undefined, attributes)

    const data = await DYNAMO.readItem('TEST_TABLE_2', pk)
    var expected = {
        Item: {
            KEY_1: { S: 'HASK_KEY_1' },
            ATTRIBUTE_1: { L: [{ S: 'list_element_1' }, { S: 'list_element_2' }, { N: '5555.555' }] }
        }
    }
    expect(data).toEqual(expected)
})

test('[1 KEYS] [SINGLE ATTRIBUTE] [WRITE AND READ] [MAP ATTRIBUTE] [SUCCESSFUL]', async () => {

    var pk = { name: 'KEY_1', value: 'HASK_KEY_1' }
    var attributes = []
    attributes.push({
        name: 'ATTRIBUTE_1', type: 'M', value: {
            'key1': { S: 'list_element_1' },
            'key2': { S: 'list_element_2' }, 'key3': { N: '5555.555' }
        }
    })
    await DYNAMO.writeItem('TEST_TABLE_2', pk, undefined, attributes)

    const data = await DYNAMO.readItem('TEST_TABLE_2', pk)
    var expected = {
        Item: {
            KEY_1: { S: 'HASK_KEY_1' },
            ATTRIBUTE_1: {
                M: {
                    'key1': { S: 'list_element_1' },
                    'key2': { S: 'list_element_2' }, 'key3': { N: '5555.555' }
                }
            }
        }
    }
    expect(data).toEqual(expected)
})

//UpdateItem tests
test('[2 KEYS] [SINGLE ATTRIBUTE] [WRITE AND UPDATE AND READ] [STRING ATTRIBUTE] [SUCCESSFUL]', async () => {

    var pk = { name: 'KEY_1', value: 'HASK_KEY_1' }
    var sk = { name: 'KEY_2', value: 'RANGE_KEY_1' }
    var attributes = []
    attributes.push({ name: 'ATTRIBUTE_1', type: 'S', value: 'test_string' })
    await DYNAMO.writeItem('TEST_TABLE_1', pk, sk, attributes)

    var attributes2 = []
    attributes2.push({ name: 'ATTRIBUTE_1', type: 'S', value: 'updated_test_string' })
    await DYNAMO.updateItem('TEST_TABLE_1', pk, sk, attributes2)
    const data = await DYNAMO.readItem('TEST_TABLE_1', pk, sk)
    var expected = {
        Item: {
            KEY_1: { S: 'HASK_KEY_1' },
            KEY_2: { S: 'RANGE_KEY_1' },
            ATTRIBUTE_1: { S: 'updated_test_string' }
        }
    }
    expect(data).toEqual(expected)
})

test('[2 KEYS] [SINGLE ATTRIBUTE] [WRITE AND UPDATE AND READ] [NUMERIC ATTRIBUTE] [SUCCESSFUL]', async () => {

    var pk = { name: 'KEY_1', value: 'HASK_KEY_1' }
    var sk = { name: 'KEY_2', value: 'RANGE_KEY_1' }
    var attributes = []
    attributes.push({ name: 'ATTRIBUTE_1', type: 'N', value: '154.111' })
    await DYNAMO.writeItem('TEST_TABLE_1', pk, sk, attributes)

    var attributes2 = []
    attributes2.push({ name: 'ATTRIBUTE_1', type: 'N', value: '1252455.55' })
    await DYNAMO.updateItem('TEST_TABLE_1', pk, sk, attributes2)
    const data = await DYNAMO.readItem('TEST_TABLE_1', pk, sk)
    var expected = {
        Item: {
            KEY_1: { S: 'HASK_KEY_1' },
            KEY_2: { S: 'RANGE_KEY_1' },
            ATTRIBUTE_1: { N: '1252455.55' }
        }
    }
    expect(data).toEqual(expected)
})

test('[2 KEYS] [SINGLE ATTRIBUTE] [WRITE AND UPDATE AND READ] [STRING LIST ATTRIBUTE] [SUCCESSFUL]', async () => {

    var pk = { name: 'KEY_1', value: 'HASK_KEY_1' }
    var sk = { name: 'KEY_2', value: 'RANGE_KEY_1' }
    var attributes = []
    attributes.push({ name: 'ATTRIBUTE_1', type: 'SS', value: ['element_1', 'element_2', 'element_3'] })
    await DYNAMO.writeItem('TEST_TABLE_1', pk, sk, attributes)

    var attributes2 = []
    attributes2.push({ name: 'ATTRIBUTE_1', type: 'SS', value: ['element_1_updated', 'element_2_updated', 'element_3_updated'] })
    await DYNAMO.updateItem('TEST_TABLE_1', pk, sk, attributes2)
    const data = await DYNAMO.readItem('TEST_TABLE_1', pk, sk)
    var expected = {
        Item: {
            KEY_1: { S: 'HASK_KEY_1' },
            KEY_2: { S: 'RANGE_KEY_1' },
            ATTRIBUTE_1: { SS: ['element_1_updated', 'element_2_updated', 'element_3_updated'] }
        }
    }
    expect(data).toEqual(expected)
})

test('[2 KEYS] [SINGLE ATTRIBUTE] [WRITE AND UPDATE AND READ] [MAP ATTRIBUTE] [SUCCESSFUL]', async () => {

    var pk = { name: 'KEY_1', value: 'HASK_KEY_1' }
    var sk = { name: 'KEY_2', value: 'RANGE_KEY_1' }
    var attributes = []
    attributes.push({ name: 'ATTRIBUTE_1', type: 'M', value: { key_1: { S: 'value_1' }, key_2: { S: 'value_2' } } })
    await DYNAMO.writeItem('TEST_TABLE_1', pk, sk, attributes)

    var attributes2 = []
    attributes2.push({ name: 'ATTRIBUTE_1', type: 'M', value: { key_3: { S: 'value_1_updated' }, key_4: { S: 'value_2_updated' } } })
    await DYNAMO.updateItem('TEST_TABLE_1', pk, sk, attributes2)
    const data = await DYNAMO.readItem('TEST_TABLE_1', pk, sk)
    var expected = {
        Item: {
            KEY_1: { S: 'HASK_KEY_1' },
            KEY_2: { S: 'RANGE_KEY_1' },
            ATTRIBUTE_1: { M: { key_3: { S: 'value_1_updated' }, key_4: { S: 'value_2_updated' } } }
        }
    }
    expect(data).toEqual(expected)
})

test('[1 KEYS] [SINGLE ATTRIBUTE] [WRITE AND UPDATE AND READ] [STRING ATTRIBUTE] [SUCCESSFUL]', async () => {

    var pk = { name: 'KEY_1', value: 'HASK_KEY_1' }
    var attributes = []
    attributes.push({ name: 'ATTRIBUTE_1', type: 'S', value: 'test_string' })
    await DYNAMO.writeItem('TEST_TABLE_2', pk, undefined, attributes)

    var attributes2 = []
    attributes2.push({ name: 'ATTRIBUTE_1', type: 'S', value: 'updated_test_string' })
    await DYNAMO.updateItem('TEST_TABLE_2', pk, undefined, attributes2)
    const data = await DYNAMO.readItem('TEST_TABLE_2', pk)
    var expected = {
        Item: {
            KEY_1: { S: 'HASK_KEY_1' },
            ATTRIBUTE_1: { S: 'updated_test_string' }
        }
    }
    expect(data).toEqual(expected)
})

test('[1 KEYS] [SINGLE ATTRIBUTE] [WRITE AND UPDATE AND READ] [NUMERIC ATTRIBUTE] [SUCCESSFUL]', async () => {

    var pk = { name: 'KEY_1', value: 'HASK_KEY_1' }
    var attributes = []
    attributes.push({ name: 'ATTRIBUTE_1', type: 'N', value: '154.111' })
    await DYNAMO.writeItem('TEST_TABLE_2', pk, undefined, attributes)

    var attributes2 = []
    attributes2.push({ name: 'ATTRIBUTE_1', type: 'N', value: '1252455.55' })
    await DYNAMO.updateItem('TEST_TABLE_2', pk, undefined, attributes2)
    const data = await DYNAMO.readItem('TEST_TABLE_2', pk)
    var expected = {
        Item: {
            KEY_1: { S: 'HASK_KEY_1' },
            ATTRIBUTE_1: { N: '1252455.55' }
        }
    }
    expect(data).toEqual(expected)
})

test('[1 KEYS] [SINGLE ATTRIBUTE] [WRITE AND UPDATE AND READ] [STRING LIST ATTRIBUTE] [SUCCESSFUL]', async () => {

    var pk = { name: 'KEY_1', value: 'HASK_KEY_1' }
    var attributes = []
    attributes.push({ name: 'ATTRIBUTE_1', type: 'SS', value: ['element_1', 'element_2', 'element_3'] })
    await DYNAMO.writeItem('TEST_TABLE_2', pk, undefined, attributes)

    var attributes2 = []
    attributes2.push({ name: 'ATTRIBUTE_1', type: 'SS', value: ['element_1_updated', 'element_2_updated', 'element_3_updated'] })
    await DYNAMO.updateItem('TEST_TABLE_2', pk, undefined, attributes2)
    const data = await DYNAMO.readItem('TEST_TABLE_2', pk)
    var expected = {
        Item: {
            KEY_1: { S: 'HASK_KEY_1' },
            ATTRIBUTE_1: { SS: ['element_1_updated', 'element_2_updated', 'element_3_updated'] }
        }
    }
    expect(data).toEqual(expected)
})

test('[1 KEYS] [SINGLE ATTRIBUTE] [WRITE AND UPDATE AND READ] [MAP ATTRIBUTE] [SUCCESSFUL]', async () => {

    var pk = { name: 'KEY_1', value: 'HASK_KEY_1' }
    var attributes = []
    attributes.push({ name: 'ATTRIBUTE_1', type: 'M', value: { key_1: { S: 'value_1' }, key_2: { S: 'value_2' } } })
    await DYNAMO.writeItem('TEST_TABLE_2', pk, undefined, attributes)

    var attributes2 = []
    attributes2.push({ name: 'ATTRIBUTE_1', type: 'M', value: { key_3: { S: 'value_1_updated' }, key_4: { S: 'value_2_updated' } } })
    await DYNAMO.updateItem('TEST_TABLE_2', pk, undefined, attributes2)
    const data = await DYNAMO.readItem('TEST_TABLE_2', pk)
    var expected = {
        Item: {
            KEY_1: { S: 'HASK_KEY_1' },
            ATTRIBUTE_1: { M: { key_3: { S: 'value_1_updated' }, key_4: { S: 'value_2_updated' } } }
        }
    }
    expect(data).toEqual(expected)
})

//INIT NESTED LIST TESTS
test('[2 KEYS] [INIT NESTED LIST] [WRITE READ] [SUCCESSFUL]', async () => {

    var pk = { name: 'KEY_1', value: 'HASK_KEY_1' }
    var sk = { name: 'KEY_2', value: 'RANGE_KEY_1' }
    var attributes = []
    attributes.push({ name: 'ATTRIBUTE_1', type: 'M', value: {} })
    await DYNAMO.writeItem('TEST_TABLE_1', pk, sk, attributes)
    await DYNAMO.initNestedList('TEST_TABLE_1', pk, sk, 'ATTRIBUTE_1.the_list_attribute')
    const data = await DYNAMO.readItem('TEST_TABLE_1', pk, sk, 'ATTRIBUTE_1')
    var expected = {
        Item: {
            ATTRIBUTE_1: { M: { the_list_attribute: { L: [] } } }
        }
    }
    expect(data).toEqual(expected)
})

test('[1 KEYS] [INIT NESTED LIST] [WRITE READ] [SUCCESSFUL]', async () => {

    var pk = { name: 'KEY_1', value: 'HASK_KEY_1' }
    var attributes = []
    attributes.push({ name: 'ATTRIBUTE_1', type: 'M', value: {} })
    await DYNAMO.writeItem('TEST_TABLE_2', pk, undefined, attributes)
    await DYNAMO.initNestedList('TEST_TABLE_2', pk, undefined, 'ATTRIBUTE_1.the_list_attribute')
    const data = await DYNAMO.readItem('TEST_TABLE_2', pk, undefined, 'ATTRIBUTE_1')
    var expected = {
        Item: {
            ATTRIBUTE_1: { M: { the_list_attribute: { L: [] } } }
        }
    }
    expect(data).toEqual(expected)
})

//APPEND NESTED LIST ITEM tests
test('[2 KEYS] [APPEND NESTED LIST] [WRITE READ WRITE READ] [SUCCESSFUL]', async () => {

    var pk = { name: 'KEY_1', value: 'HASK_KEY_1' }
    var sk = { name: 'KEY_2', value: 'RANGE_KEY_1' }
    var attributes = []
    attributes.push({ name: 'ATTRIBUTE_1', type: 'M', value: {} })
    await DYNAMO.writeItem('TEST_TABLE_1', pk, sk, attributes)

    //Create empty nested list
    await DYNAMO.initNestedList('TEST_TABLE_1', pk, sk, 'ATTRIBUTE_1.the_list_attribute')
    var data = await DYNAMO.readItem('TEST_TABLE_1', pk, sk, 'ATTRIBUTE_1')
    var expected = {
        Item: {
            ATTRIBUTE_1: {
                M: { the_list_attribute: { L: [] } }
            }
        }
    }
    expect(data).toEqual(expected)


    //Add the first element to the list
    var item = { type: 'S', value: 'data1' }
    await DYNAMO.appendNestedListItem('TEST_TABLE_1', pk, sk, 'ATTRIBUTE_1.the_list_attribute', [item])

    data = await DYNAMO.readItem('TEST_TABLE_1', pk, sk, 'ATTRIBUTE_1')
    expected = {
        Item: {
            ATTRIBUTE_1: {
                M: { the_list_attribute: { L: [{ S: 'data1' }] } }
            }
        }
    }
    expect(data).toEqual(expected)

    //Add the second and third element to the list

    var item2 = [{ type: 'S', value: 'data2' }, { type: 'N', value: '6656.55' }]
    await DYNAMO.appendNestedListItem('TEST_TABLE_1', pk, sk, 'ATTRIBUTE_1.the_list_attribute', item2)

    data = await DYNAMO.readItem('TEST_TABLE_1', pk, sk, 'ATTRIBUTE_1')
    expected = {
        Item: {
            ATTRIBUTE_1: {
                M: { the_list_attribute: { L: [{ S: 'data1' }, { S: 'data2' }, { N: '6656.55' }] } }
            }
        }
    }
    expect(data).toEqual(expected)
})

//DELETE ITEM tests
test('[2 KEYS] [SINGLE ATTRIBUTE] [WRITE AND DELETE AND READ] [STRING ATTRIBUTE] [NO CONDITION] [SUCCESSFUL]', async () => {

    var pk = { name: 'KEY_1', value: 'HASK_KEY_1' }
    var sk = { name: 'KEY_2', value: 'RANGE_KEY_1' }
    var attributes = []
    attributes.push({ name: 'ATTRIBUTE_1', type: 'S', value: 'data_1' })
    await DYNAMO.writeItem('TEST_TABLE_1', pk, sk, attributes)

    await DYNAMO.deleteItem('TEST_TABLE_1', pk, sk)
    const data = await DYNAMO.readItem('TEST_TABLE_1', pk, sk)
    var expected = {
    }
    expect(data).toEqual(expected)
})

test('[2 KEYS] [SINGLE ATTRIBUTE] [WRITE AND DELETE AND READ] [LIST ATTRIBUTE] [NO CONDITION] [SUCCESSFUL]', async () => {

    var pk = { name: 'KEY_1', value: 'HASK_KEY_1' }
    var sk = { name: 'KEY_2', value: 'RANGE_KEY_1' }
    var attributes = []
    attributes.push({ name: 'ATTRIBUTE_1', type: 'L', value: [{ S: 'data_1' }, { N: '456' }] })
    await DYNAMO.writeItem('TEST_TABLE_1', pk, sk, attributes)

    await DYNAMO.deleteItem('TEST_TABLE_1', pk, sk)
    const data = await DYNAMO.readItem('TEST_TABLE_1', pk, sk)
    var expected = {
    }
    expect(data).toEqual(expected)
})



/*test('[2 KEYS] [MULTIPLE ATTRIBUTES] [WRITE AND DELETE AND READ] [NUMBER ATTRIBUTES] [WITH CONDITION] [SUCCESSFUL]', async () => {

    var promises = []
    for (var i = 0; i < 10; i++) {
        var pk = { name: 'KEY_1', value: `HASK_KEY_${i}` }
        var sk = { name: 'KEY_2', value: `RANGE_KEY_${i}` }
        var attributes = [{ name: 'ATTRIBUTE_1', type: 'N', value: `${i * 10}` }]
        promises.push(DYNAMO.writeItem('TEST_TABLE_1', pk, sk, attributes))
    }
    await Promise.all(promises)

    var expressionattributevalues = {}

    expressionattributevalues[':a'] = { 'N': '80' }
    expressionattributevalues[':b'] = { 'N': '90' }

    var conditionexpression = 'ATTRIBUTE_1 > :a AND ATTRIBUTE_1 < :b '
    await DYNAMO.deleteItem('TEST_TABLE_1', pk, sk, expressionattributevalues, conditionexpression)
    const data = await DYNAMO.query('TEST_TABLE_1', pk, )
    var expected = {

    }
    expect(data).toEqual(expected)
})*/


/*test('[2 KEYS] [QUERY TEST]] [WRITE AND QUERY] [SUCCESSFUL]', async () => {

    var promises = []
    for (var i = 0; i < 10; i++) {
        var pk = { name: 'KEY_1', value: 'HASK_KEY_1' }
        var sk = { name: 'KEY_2', value: `RANGE_KEY_${i}` }
        var attributes = []
        attributes.push({ name: 'ATTRIBUTE_1', type: 'L', value: [{ S: 'data_1' }, { N: `${i}` }] })
        promises.push(DYNAMO.writeItem('TEST_TABLE_1', pk, sk, attributes))
    }
    await Promise.all(promises)

    var keyexpression = 'KEY_1 = :a'
    var expressionattributevalues = {
        ':a': { S: 'HASK_KEY_1' },
        ':b': { N: '5' },
    }
    var projectionexpression = `ATTRIBUTE_1`
    var filterexpression = 'ATTRIBUTE_1 >= :b'
    const data = await DYNAMO.query('ARTIFACT_DEFINITION', keyexpression, expressionattributevalues, filterexpression, projectionexpression)

    var expected = {
        Item: {
            ATTRIBUTE_1: {}
        }
    }

    expect(data).toEqual(expected)
}
)*/


