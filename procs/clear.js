'use strict';
module.exports = function (storageNumber) {
    storageNumber *= 1;

    return function (next, storages, i) {
        if (!storageNumber) return next(new Error(`Incorrect storage number! (line: ${i + 1}, command: clear)`));

        storages[storageNumber] = new Map();
        storages.buffer = new Map();
        next();
    };
};
