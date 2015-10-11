'use strict';

let utils = require('gobem/utils'),
    path = require('path');

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
        let moduleInfo = utils.getModuleInfo(filePath),
            modulePath = utils.generateModulePath(moduleInfo);
        parsedModules[modulePath] = parsedModules[modulePath] || [];
        for (let catName in fileData) {
            let catDeps = fileData[catName],
                currentModuleInfo = Object.assign({}, moduleInfo);
            if (moduleInfo.catName === catName) {
                if (!moduleInfo.elemName && !moduleInfo.modName && utils.isEntryPoint(moduleInfo.blockName)) {
                    catDeps.push(moduleInfo.blockName);
                }
            } else {
                currentModuleInfo.blockName = moduleInfo.blockName;
            }
            currentModuleInfo.catName = catName;
            currentModuleInfo.techName = currentModuleInfo.langName = '';

            catDeps.forEach(function (rawDep) {
                let isElem = rawDep.substr(0, 2) === '__',
                    isMod = /^_[A-Za-z0-9]/.test(rawDep.substr(0, 2));

                if (isElem && !currentModuleInfo.blockName) return;
                if (isMod) {
                    if (rawDep[rawDep.length - 1] === '_') rawDep = rawDep.slice(0, -1);
                    rawDep = rawDep.slice(1).split('_');
                    let modNames = rawDep[0].split(','),
                        modVals = (rawDep[1] || '').split(',');
                    for (let n = 0, nl = modNames.length; n < nl; n++) {
                        if (!modNames[n]) continue;
                        currentModuleInfo.modName = modNames[n];
                        currentModuleInfo.modVal = '';
                        pushDep(parsedModules, modulePath, currentModuleInfo);
                        for (let v = 0, vl = modVals.length; v < vl; v++) {
                            if (!modVals[n]) continue;
                            currentModuleInfo.modVal = modVals[v];
                            pushDep(parsedModules, modulePath, currentModuleInfo);
                        }
                    }
                } else {
                    if (isElem) {
                        currentModuleInfo.elemName = rawDep.substr(2);
                        currentModuleInfo.modName = currentModuleInfo.modVal = '';
                    } else {
                        currentModuleInfo.blockName = rawDep;
                        currentModuleInfo.elemName = currentModuleInfo.modName = currentModuleInfo.modVal = '';
                    }

                    pushDep(parsedModules, modulePath, currentModuleInfo);
                }
            });
        }
    }

    checkCircularDeps(parsedModules, next);
};

function pushDep(parsedModules, currentModulePath, moduleInfo) {
    let modulePath = utils.generateModulePath(moduleInfo);
    !~parsedModules[currentModulePath].indexOf(modulePath) && parsedModules[currentModulePath].push(modulePath);
    parsedModules[modulePath] = parsedModules[modulePath] || [];
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
