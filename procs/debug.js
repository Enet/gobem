'use strict';
module.exports = function (callback) {
    return function (next, storages, i, exitPointName) {
        if (typeof callback === 'function') {
            callback(exitPointName, storages.buffer.keys(), storages.buffer.values());
            next();
        } else {
            next(new Error(`Argument should be a function! (line: ${i + 1}, processor: debug)`));
        }
    };
};
