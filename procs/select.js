'use strict';
module.exports = function (storageNumber, regularExpression) {
    storageNumber *= 1;

    return function (next, storages, i) {
        if (isNaN(storageNumber)) return next(new Error(`Incorrect storage number! (line: ${i + 1}, command: select)`));

        regularExpression = regularExpression || /.*/;
        if (typeof regularExpression === 'string') {
            try {
                regularExpression = new RegExp(regularExpression);
            } catch (error) {
                return next(new Error(`Incorrect regexp! (line: ${i + 1}, command: select)`));
            }
        }

        let storage = storages[storageNumber] || new Map(),
            buffer = storages.buffer = new Map();
        for (let s of storage.keys()) {
            if (regularExpression.test(s)) buffer.set(s, storage.get(s));
        }
        next();
    };
};
