/**
 * Module provides API to an AWS Dynamo DB instance
 */
var AWS = require('aws-sdk');
var LOG = require('../auxiliary/logManager');

module.id = 'DDB'
SUPPRESS_NO_CONFIG_WARNING = 1

var DDB = undefined

/**
 * Initializes DynamoDB connection
 * Should be called before any other operation in the module! 
 * @param {string} accessKeyId 
 * @param {string} secretAccessKey 
 * @param {string} region AWS region, or "local" in case of local deployment
 * @param {string} endpoint DB host address
 */
function initDynamo(accessKeyId, secretAccessKey, region, endpoint) {
    AWS.config.update({
        region: region,
        endpoint: endpoint,
        accessKeyId,
        secretAccessKey,
    });

    DDB = new AWS.DynamoDB({ apiVersion: '2012-08-10' });
}

/**
 * Verifies if the DB connection has been established, throws runtime error if not
 * @returns Return true if the DB connection is established
 */
function verifyInit() {
    if (DDB == undefined) {
        LOG.logSystem('ERROR', 'Attempted to use Dynamo API before it was initialized')
        throw Error('DYNAMO API not initialized')
    }
    return true
}

/**
 * Creates a new table in the database
 * @param {string} tablename 
 * @param {string} pk primary(hash) key (required)
 * @param {string} sk secondary key (optional, use "undefined" for tables without secondary key)
 * @param {*} globalsecondaryIndex Field name of required secondary index (optional, leave empty or use "undefined")
 * @returns Returns a Promise to the result of the operation
 */
async function initTable(tablename, pk, sk, globalsecondaryIndex) {
    verifyInit()
    var params = {
        AttributeDefinitions: [
            {
                AttributeName: pk,
                AttributeType: 'S'
            }
        ],
        KeySchema: [
            {
                AttributeName: pk,
                KeyType: 'HASH'
            }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        },
        TableName: tablename,
        StreamSpecification: {
            StreamEnabled: false
        },
    };
    if (globalsecondaryIndex != undefined) {
        params.AttributeDefinitions.push({
            AttributeName: globalsecondaryIndex.pk.name,
            AttributeType: globalsecondaryIndex.pk?.type || 'S'
        })
        if (globalsecondaryIndex?.sk != undefined) {
            params.AttributeDefinitions.push({
                AttributeName: globalsecondaryIndex.sk.name,
                AttributeType: globalsecondaryIndex.sk?.type || 'S'
            })
        }
        params.GlobalSecondaryIndexes = [{
            IndexName: globalsecondaryIndex.indexname,
            KeySchema: [
                { AttributeName: globalsecondaryIndex.pk.name, KeyType: "HASH" },  //Partition key
                //{ AttributeName: "tm", KeyType: "RANGE" }  //Sort key
            ],
            Projection: {
                ProjectionType: 'ALL'
            },
            ProvisionedThroughput: {
                ReadCapacityUnits: 10,
                WriteCapacityUnits: 10
            }
        }]
        if (globalsecondaryIndex?.sk != undefined) {
            params.GlobalSecondaryIndexes[0].KeySchema.push({ AttributeName: globalsecondaryIndex.sk.name, KeyType: "RANGE" })//Sort key
        }
    }
    if (sk != undefined) {
        params.AttributeDefinitions.push(
            {
                AttributeName: sk,
                AttributeType: 'S'
            })
        params.KeySchema.push(
            {
                AttributeName: sk,
                KeyType: 'RANGE'
            })
    }

    // Call DynamoDB to create the table
    return new Promise((resolve, reject) => {
        DDB.createTable(params, function (err, data) {
            if (err) {
                reject(err)
            } else {
                resolve(data)
            }
        });
    })
}

/**
 * Delete a table from the DB
 * @param {string} tablename 
 * @returns Promise to the result of the operation 
 */
function deleteTable(tablename) {
    var params = {
        TableName: tablename
    };
    return new Promise((resolve, reject) => {
        DDB.deleteTable(params, function (err, data) {
            if (err) {
                reject(err)
            } else {
                resolve(data)
            }
        });
    })
}

/**
 * Writes one item into a table, attributes arguments
 * @param {string} tablename 
 * @param {Object} pk 
 * @param {Object} sk 
 * @param {[Object]} attr A list containing {name, data, type} elements
 * @returns 
 */
function writeItem(tablename, pk, sk, attr) {
    verifyInit()
    if (!sk) {
        var sk = { value: '' }
    }
    LOG.logWorker('DEBUG', `DDB writing: [${tablename}] ->[${pk.value}]:[${sk.value} ]`, module.id)
    var item = {}
    item[pk.name] = { 'S': pk.value }
    if (sk && sk.value != '') {
        item[sk.name] = { 'S': sk.value }
    }
    for (var i in attr) {
        //If the type is specified
        if (attr[i].type) {
            var buff = {}
            buff[attr[i].type] = attr[i].value
            item[attr[i].name] = buff
        }
        //Otherwise assuming string
        else {
            item[attr[i].name] = { 'S': attr[i].value }
        }
    }
    var params = {
        TableName: tablename,
        Item: item
    }

    // Call DynamoDB to add the item to the table
    return new Promise((resolve, reject) => {
        DDB.putItem(params, function (err, data) {
            if (err) {
                LOG.logWorker('ERROR', `DDB writing to [${tablename}] ->[${pk.value}]:[${sk.value}] was not successfull`, module.id)
                reject(err)
            } else {
                LOG.logWorker('DEBUG', `DDB writing to [${tablename}] ->[${pk.value}]:[${sk.value}] finished`, module.id)
                resolve(data)
            }
        })
    });
}

/**
 * Retrieved an entry (ot its specified fields) from a table 
 * @param {string} tablename 
 * @param {Object} pk 
 * @param {Object} sk 
 * @param {string/undefined} requestedfields Specifies required fields. Left it out, or use "undefined" if all fields are required  
 * @returns An Object cantaining the fields of retrieved entry
 */
async function readItem(tablename, pk, sk, requestedfields) {
    verifyInit()
    if (!sk) {
        var sk = { value: '' }
    }
    LOG.logWorker('DEBUG', `DDB reading: [${tablename}] ->[${pk.value}]:[${sk.value}]`, module.id)
    var key = {}
    key[pk.name] = { 'S': pk.value }
    if (sk && sk.value != '') {
        key[sk.name] = { 'S': sk.value }
    }
    var params = {
        TableName: tablename,
        Key: key
    };
    if (requestedfields) {
        params['ProjectionExpression'] = requestedfields
    }


    // Call DynamoDB to read the item from the table
    return new Promise((resolve, reject) => {
        DDB.getItem(params, function (err, data) {
            if (err) {
                LOG.logWorker('ERROR', `DDB reading: [${tablename}] ->[${pk.value}]:[${sk.value}] was not successful`, module.id)
                reject(err)
            } else {
                LOG.logWorker('DEBUG', `[${tablename}] ->[${pk.value}]:[${sk.value}] data retrieved`, module.id)
                resolve(data)
            }
        });
    });
}

/**
 * Updates an item in a table
 * @param {string} tablename 
 * @param {Object} pk 
 * @param {Object} sk 
 * @param {Object} attr Attributes should be updated and the new data
 * @returns Returns the updated entry
 */
async function updateItem(tablename, pk, sk, attr) {
    LOG.logSystem('DEBUG', `Updating [${tablename}] ->[${pk.value}]:[${sk?.value}]`, module.id)
    verifyInit()
    if (!sk) {
        var sk = { value: '' }
    }
    var key = {}
    key[pk.name] = { 'S': pk.value }
    if (sk && sk.value != '') {
        key[sk.name] = { 'S': sk.value }
    }
    var expressionattributenames = {}
    var expressionattributevalues = {}
    var updateexpression = 'SET '
    for (var i in attr) {
        if (i != 0) {
            updateexpression += ','
        }
        //If the type is specified
        expressionattributenames['#' + i.toString()] = attr[i].name
        if (attr[i].type) {
            var buff = {}
            buff[attr[i].type] = attr[i].value
            expressionattributevalues[':' + i.toString()] = buff
        }
        //Otherwise assuming string
        else {
            expressionattributevalues[':' + i.toString()] = { 'S': attr[i].value }
        }
        updateexpression += '#' + i.toString() + ' = ' + ':' + i.toString()
    }
    var params = {
        ExpressionAttributeNames: expressionattributenames,
        ExpressionAttributeValues: expressionattributevalues,
        Key: key,
        ReturnValues: "ALL_NEW",
        TableName: tablename,
        UpdateExpression: updateexpression//"SET #0 = :0"
    };
    return new Promise((resolve, reject) => {
        DDB.updateItem(params, function (err, data) {
            if (err) {
                reject(err)
            }
            else {
                resolve(data)
            }
        })
    })
}

/**
 * Creates an empty list in an already existing field which type is MAP
 * @param {string} tablename 
 * @param {Object} pk 
 * @param {Object} sk 
 * @param {Object} listattribute Special Object to define the field name and the key in the map
 * @returns Promise to the changed data
 */
async function initNestedList(tablename, pk, sk, listattribute) {
    verifyInit()
    if (!sk) {
        var sk = { value: '' }
    }
    var key = {}
    key[pk.name] = { 'S': pk.value }
    if (sk && sk.value != '') {
        key[sk.name] = { 'S': sk.value }
    }

    var updateexpression = `SET ${listattribute} = :newlist`
    var expressionattributevalues = { ":newlist": { L: [] } }

    var params = {
        ExpressionAttributeValues: expressionattributevalues,
        Key: key,
        ReturnValues: "ALL_NEW",
        TableName: tablename,
        UpdateExpression: updateexpression//"SET #0 = :0"
    };
    return new Promise((resolve, reject) => {
        DDB.updateItem(params, function (err, data) {
            if (err) { reject(err) }
            else {
                resolve(data)
            }
        })
    })
}

/**
 * Append to a list created by "initNestedList" 
 * @param {string} tablename 
 * @param {Object} pk 
 * @param {Object} sk 
 * @param {Object} listattribute Field name and Map key to the list
 * @param {[Object]} newelements List of elements append to the list
 * @returns Promise to the changed data
 */
async function appendNestedListItem(tablename, pk, sk, listattribute, newelements) {
    verifyInit()
    if (!sk) {
        var sk = { value: '' }
    }
    var key = {}
    key[pk.name] = { 'S': pk.value }
    if (sk && sk.value != '') {
        key[sk.name] = { 'S': sk.value }
    }
    var updateexpression = `SET ${listattribute} = list_append(${listattribute}, :newdata)`
    var expressionattributevalues = { ":newdata": { L: [] } }
    for (i in newelements) {
        var buff = {}
        buff[newelements[i].type] = newelements[i].value
        expressionattributevalues[':newdata']['L'].push(buff)
    }

    var params = {
        ExpressionAttributeValues: expressionattributevalues,
        Key: key,
        ReturnValues: "ALL_NEW",
        TableName: tablename,
        UpdateExpression: updateexpression//"SET #0 = :0"
    };
    return new Promise((resolve, reject) => {
        DDB.updateItem(params, function (err, data) {
            if (err) {
                reject(err)
            }
            else {
                resolve(data)
            }
        })
    })
}

/**
 * Deletes a item from the map
 * @param {string} tablename 
 * @param {Object} pk 
 * @param {Object} sk 
 * @param {Object} expressionattributevalues 
 * @param {Object} conditionexpression 
 * @returns Promise to the result of the operation
 */
function deleteItem(tablename, pk, sk, expressionattributevalues, conditionexpression) {
    verifyInit()
    if (!sk) {
        var sk = { value: '' }
    }
    var key = {}
    key[pk.name] = { 'S': pk.value }
    if (sk && sk.value != '') {
        key[sk.name] = { 'S': sk.value }
    }
    var params = {
        TableName: tablename,
        Key: key
    };
    if (expressionattributevalues) {
        params['ExpressionAttributeValues'] = expressionattributevalues
    }
    if (conditionexpression) {
        params['ConditionExpression'] = conditionexpression
    }

    // Call DynamoDB to delete the item from the table
    return new Promise((resolve, reject) => {
        DDB.deleteItem(params, function (err, data) {
            if (err) {
                reject(err)
            } else {
                resolve(data)
            }
        })
    })
}

/**
 * Perform a database query
 * @param {*} tablename 
 * @param {*} keyconditionexpression 
 * @param {*} expressionattributevalues 
 * @param {*} filterexpression 
 * @param {*} projectionexpression 
 * @param {*} secondaryindex 
 * @returns An array containing the retrieved entries
 */
async function query(tablename, keyconditionexpression, expressionattributevalues, filterexpression, projectionexpression, secondaryindex) {
    verifyInit()
    let result, ExclusiveStartKey;
    var accumulated = []
    do {
        var params = {
            TableName: tablename,
            ExclusiveStartKey,
            Limit: 1,
            KeyConditionExpression: keyconditionexpression,
            ExpressionAttributeValues: expressionattributevalues,
            FilterExpression: filterexpression,
            ProjectionExpression: projectionexpression
        }
        if (secondaryindex != undefined) {
            params['IndexName'] = secondaryindex
        }
        result = await DDB.query(params).promise();

        ExclusiveStartKey = result.LastEvaluatedKey;
        accumulated = [...accumulated, ...result.Items];
    } while (result.LastEvaluatedKey);

    return accumulated;
}

async function scanTable(tablename) {
    verifyInit()
    let result, ExclusiveStartKey;
    var accumulated = []
    do {
        var params = {
            TableName: tablename,
            ExclusiveStartKey,
            Limit: 1,
        }
        result = await DDB.scan(params).promise();

        ExclusiveStartKey = result.LastEvaluatedKey;
        accumulated = [...accumulated, ...result.Items];
    } while (result.LastEvaluatedKey);

    return accumulated;
}

module.exports = {
    initDynamo: initDynamo,
    initTable: initTable,
    deleteTable: deleteTable,
    writeItem: writeItem,
    readItem: readItem,
    updateItem: updateItem,
    initNestedList: initNestedList,
    appendNestedListItem: appendNestedListItem,
    deleteItem: deleteItem,
    query: query,
    scanTable: scanTable
}