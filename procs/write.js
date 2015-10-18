'use strict';
module.exports = function (storageNumber) {
    storageNumber *= 1;

    return function (next, storages, i) {
        if (!storageNumber) return next(new Error(`Incorrect storage number! (line: ${i + 1}, command: write)`));

        let storage = storages[storageNumber] = storages[storageNumber] || new Map(),
            buffer = storages.buffer;
        for (let f of buffer.keys()) {
            storage.set(f, buffer.get(f));
        }

        next();
    };
};
