'use strict';
module.exports = function (callback) {
    return function (next, storages, i) {
        if (typeof callback === 'function') {
            callback(storages.buffer.keys(), storages.buffer.values());
            next();
        } else {
            next(new Error(`Argument should be a function! (line: ${i + 1}, processor: debug)`));
        }
    };
};
