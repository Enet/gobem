'use strict';

let path = require('path'),
    utils = require(path.join('gobem', 'utils'));

module.exports = function (next, config, deps) {
    let parsedModules = {};

    for (let filePath in deps) {
        let fileContent = deps[filePath],
            fileDeps = [],
            fileData = {};
        try {
            fileData = JSON.parse(fileContent);
            if (typeof fileData !== 'object' || fileData === null) {
                throw null;
            } else {
                let catName = filePath.substr(0, filePath.indexOf(path.sep));
                fileData[catName] = fileData[catName] || [];
            }
        } catch (error) {
            error.stack = `Invalid JSON could not be parsed! (path: ${filePath})\n` + error.stack;
            return next(error);
        };

        utils.parseDeps(filePath, fileData, (parsingModulePath, depModulePath) => {
            parsedModules[parsingModulePath] = parsedModules[parsingModulePath] || [];
            !~parsedModules[parsingModulePath].indexOf(depModulePath) && parsedModules[parsingModulePath].push(depModulePath);
            parsedModules[depModulePath] = parsedModules[depModulePath] || [];
        });
    }

    checkCircularDeps(parsedModules, next);
};

function checkCircularDeps (unresolvedDeps, callback) {
    let resolvedDeps = {};

    var unresolvedDepLength = Object.keys(unresolvedDeps).length;
    while (unresolvedDepLength) {
        let isCircular = true;
        for (let u in unresolvedDeps) {
            let unresolvedDep = unresolvedDeps[u],
                isResolved = true;

            for (let d = 0, dl = unresolvedDep.length; d < dl; d++) {
                let depPath = unresolvedDep[d];
                if (unresolvedDeps[depPath] && !resolvedDeps[depPath] && depPath !== u) {
                    isResolved = false;
                    break;
                }
            }

            if (isResolved) {
                resolvedDeps[u] = unresolvedDeps[u];
                delete unresolvedDeps[u];
                isCircular = false;
            }
        }

        unresolvedDepLength = Object.keys(unresolvedDeps).length;
        if (isCircular) return callback(`Circular dependencies were detected:\n${Object.keys(unresolvedDeps).join('\n')}`);
    };

    callback(null, resolvedDeps);
};
