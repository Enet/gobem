'use strict';

function split (string, pattern, direction) {
    string += '';
    pattern += '';

    let index = string[direction ? 'lastIndexOf' : 'indexOf'](pattern);
    if (~index) {
        return [string.substr(0, index), string.substr(index + pattern.length)];
    } else {
        return [string, string];
    }
};

function deepFreeze (object) {
    for (var o in object) {
        if (typeof object[o] === 'object') deepFreeze(object[o]);
    }
    return Object.freeze(object);
};

function isExcluded (relPath, excludePath) {
    for (let e = 0, el = excludePath.length; e < el; e++) {
        if (typeof excludePath[e] === 'string') {
            if (relPath === excludePath[e]) return true;
        } else {
            if (excludePath[e].test(relPath)) return true;
        }
    }
    return false;
};

function getModuleInfo (filePath) {
    filePath = (filePath + '').trim();
    if (filePath[0] === '/') filePath = filePath.substr(1);
    if (filePath[filePath.length - 1] === '/') filePath = filePath.slice(0, -1);

    filePath = filePath.split('/', 4);

    var catName = filePath[0] || '',
        blockName = filePath[1] || '',
        elemName = '',
        modName = '',
        modVal = '',
        langName = '',
        techName = '',
        tempName = filePath[Math.max(filePath.length - 1, 2)] || '';

    if (tempName) {
        let hasPoint = !!~tempName.indexOf('.');
        tempName = split(tempName, '.');
        if (hasPoint) techName = tempName[1];

        let hasColon = !!~tempName.indexOf(':');
        tempName = split(tempName[0], ':');
        if (hasColon) langName = tempName[1] || '';

        tempName = tempName[0].split('_');
        elemName = tempName[0] === blockName ? '' : tempName[0];

        modName = tempName[1] || '';
        modVal = tempName[2] || '';
    }

    return {
        catName: catName,
        blockName: blockName,
        elemName: elemName,
        modName: modName,
        modVal: modVal,
        langName: langName,
        techName: techName
    };
};

function generateModulePath (moduleInfo) {
    moduleInfo.langName = moduleInfo.techName = '';
    return generateFilePath(moduleInfo);
};

function generateFilePath (moduleInfo) {
    return '' +
        moduleInfo.catName +
        '/' + moduleInfo.blockName +
        (moduleInfo.elemName ? '/' + moduleInfo.elemName + '/' + moduleInfo.elemName : '/' + moduleInfo.blockName) +
        (moduleInfo.modName ? '_' + moduleInfo.modName + (moduleInfo.modVal ? '_' + moduleInfo.modVal : '') : '') +
        (moduleInfo.langName ? ':' + moduleInfo.langName : '') +
        (moduleInfo.techName ? '.' + moduleInfo.techName : '');
};

function isPage (blockName) {
    return blockName.substr(0, 2) === 'p-';
}

function isWrapper (blockName) {
    return blockName.substr(0, 2) === 'w-';
}

function isEntryPoint (blockName) {
    if (isPage(blockName)) return 'p';
    if (isWrapper(blockName)) return 'w';
}

function parseDeps (filePath, fileData, pushDep) {
    let moduleInfo = getModuleInfo(filePath),
        modulePath = generateModulePath(moduleInfo);

    for (let catName in fileData) {
        let catDeps = fileData[catName],
            currentModuleInfo = Object.assign({}, moduleInfo);
        if (moduleInfo.catName === catName) {
            if (!moduleInfo.elemName && !moduleInfo.modName && isEntryPoint(moduleInfo.blockName)) {
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
                    pushDep(modulePath, generateModulePath(currentModuleInfo));
                    for (let v = 0, vl = modVals.length; v < vl; v++) {
                        if (!modVals[n]) continue;
                        currentModuleInfo.modVal = modVals[v];
                        pushDep(modulePath, generateModulePath(currentModuleInfo));
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

                pushDep(modulePath, generateModulePath(currentModuleInfo));
            }
        });
    }
}

module.exports = {
    split: split,
    deepFreeze: deepFreeze,
    getModuleInfo: getModuleInfo,
    generateModulePath: generateModulePath,
    generateFilePath: generateFilePath,
    parseDeps: parseDeps,
    isPage: isPage,
    isWrapper: isWrapper,
    isEntryPoint: isEntryPoint,
    isExcluded: isExcluded
};
