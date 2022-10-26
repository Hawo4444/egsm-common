var LOG = require('./logManager')

module.id = "AUX"

module.exports = {
    sleep: function (ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }
}
