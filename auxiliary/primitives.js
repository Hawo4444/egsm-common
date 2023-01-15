var UUID = require('uuid');

module.id = "PRIM"

class Perspective {
    constructor(name, bpmn_diagram, egsm_model, info_model, bindings, egsm_stages) {
        this.name = name
        this.bpmn_diagram = bpmn_diagram
        this.egsm_model = egsm_model
        this.info_model = info_model
        this.bindings = bindings
        this.egsm_stages = egsm_stages
    }
}

class ProcessType {
    constructor(name, stakeholders, description, bpmn_model, perspectives) {
        this.name = name
        this.stakeholders = stakeholders
        this.description = description
        this.bpmn_model = bpmn_model
        this.perspectives = perspectives
    }
}

class Artifact {
    constructor(type, id, stakeholders, faulty_rates, timing_faulty_rates, host, port) {
        this.type = type
        this.id = id
        this.stakeholders = stakeholders
        this.faulty_rates = faulty_rates
        this.timing_faulty_rates = timing_faulty_rates
        this.host = host
        this.port = port
    }
}

class ArtifactEvent {
    constructor(artifactname, artifactstate, timestamp, processtype, processid, eventid, processed) {
        this.timestamp = timestamp
        this.artifact_name = artifactname
        this.artifact_state = artifactstate
        this.process_type = processtype
        this.process_id = processid
        this.event_id = eventid
        this.processed = processed
    }
}

class ArtifactUsageEntry {
    constructor(artifactname, caseid, attachtime, detachtime, processtype, processid, outcome) {
        this.artifact_name = artifactname
        this.case_id = caseid
        this.attach_time = attachtime
        this.detach_time = detachtime
        this.process_type = processtype
        this.process_id = processid
        this.outcome = outcome
    }
}

class ProcessInstance {
    constructor(processtype, instanceid, startingtime, endingtime, status, stakeholders, host, port, outcome) {
        this.process_type = processtype
        this.instance_id = instanceid
        this.starting_time = startingtime
        this.ending_time = endingtime
        this.status = status
        this.stakeholders = stakeholders
        this.host = host
        this.port = port
        this.outcome = outcome
    }
}

class Stakeholder {
    constructor(name, notificationtype) {
        this.name = name
        this.notification_type = notificationtype
    }
}

class ProcessGroup {
    constructor(name, membershiprules) {
        this.name = name
        this.membership_rules = membershiprules
    }
}

class StageEvent {
    constructor(processtype, processid, processperspective, eventid, timestamp, stagename, status, state, compliance) {
        this.process_type = processtype
        this.process_id = processid
        this.process_perspective = processperspective
        this.event_id = eventid
        this.timestamp = timestamp
        this.stage_name = stagename
        this.status = status
        this.state = state
        this.compliance = compliance
    }
}

class FaultyRateWindow {
    constructor(windowsize, value, updated, earliestusageentrytime) {
        this.window_size = windowsize
        this.value = value
        this.updated = updated
        this.earliest_usage_entry_time = earliestusageentrytime
    }
}

class Notification {
    constructor(sourcejob, sourceaggregator, type, job_type, message, errors) {
        this.id = UUID.v4()
        this.timestamp = Math.floor(Date.now() / 1000)
        this.source_job = sourcejob
        this.source_aggregator = sourceaggregator
        this.notified = []
        this.type = type
        this.job_type = job_type
        this.message = message
        this.errors = errors
    }
}

class ArtifactNotification extends Notification {
    constructor(sourcejob, sourceaggregator, job_type, message, artifact_type, artifactid, errors) {
        super(sourcejob, sourceaggregator, 'artifact', job_type, message, errors)
        this.artifact_type = artifact_type
        this.artifact_id = artifactid
    }
}

class ProcessNotification extends Notification {
    constructor(sourcejob, sourceaggregator, job_type, message, processtype, instanceid, /*perspective, processgroupmembers,*/ errors) {
        super(sourcejob, sourceaggregator, 'process', job_type, message, errors)
        this.process_type = processtype
        this.instance_id = instanceid
        //this.perspective = perspective
        //this.processgroupmembers = processgroupmembers
    }
}

module.exports = {
    Perspective,
    ProcessType,
    Artifact,
    ArtifactEvent,
    ArtifactUsageEntry,
    ProcessInstance,
    Stakeholder,
    ProcessGroup,
    StageEvent,
    FaultyRateWindow,
    ArtifactNotification,
    ProcessNotification,



    Broker: function (host, port, username, password) {
        return {
            host: host,
            port: port,
            username: username,
            password: password
        }
    }
}
