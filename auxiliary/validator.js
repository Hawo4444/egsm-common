class Validator {
    constructor() { }

    /**
     * Checks if a stage may have participated in any deviation, based on only stage information
     * @param {Object} stage Stage to verify 
     * @returns 
     */
    static validateProcessStage(stage) {
        var errors = []
        if (stage.status == 'faulty') {
            errors.push({
                type: 'status',
                value: stage.status,
                stage: stage.name
            })
        }
        if (stage.compliance != 'onTime') {
            errors.push({
                type: 'compliance',
                value: stage.compliance,
                stage: stage.name
            })
        }
        return errors
    }

    static validateArtifactFaultyRate(faulryrate, threshold) {
        if (faulryrate.value >= threshold) {
            return false
        }
        return true
    }

    /**
    * Checks if the process should be added to the group defined by the provided rule
    * Supported Rules:
    * -PROCESS_TYPE: The process need to have a specified type (optional)
    * -STAKEHOLDER: The defined stakeholder needs to be included in the process's stakeholders, otherwise it will result False (optional)
    * @param {Process object} process {process_type, instance_id, stakeholders}
    * @param {Object[]} rules {type:string, value}
    */
    static isRulesSatisfied(process, rules) {
        var result = false
        var stakeholderRuleSatisfied = true
        if (rules?.PROCESS_TYPE != undefined) {
            if (rules.PROCESS_TYPE != process.process_type) {
                return false
            }
        }
        if (rules?.STAKEHOLDER != undefined) {
            stakeholderRuleSatisfied = false
            process.stakeholders.forEach(stakeholder => {
                if (stakeholder == rules.STAKEHOLDER) {
                    stakeholderRuleSatisfied = true
                }
            });
        }
        result = result || stakeholderRuleSatisfied
        return result
    }
}

module.exports = {
    Validator
}