'use strict';

let fs = require('fs'),
    async = require('async'),
    path = require('path'),
    utils = require(path.join('gobem', 'utils'));

module.exports = function (next, config, modules) {
    let moduleInfoMap = {},
        entryPoints = {
            p: {}, // pages
            w: {}, // wrappers
            pw: {} // pages + wrappers
        },
        exitPoints = {},
        files = new Map();

    for (let m in modules) {
        let moduleInfo = moduleInfoMap[m] = utils.getModuleInfo(m);
        if (moduleInfo.elemName || moduleInfo.modName) continue;

        let entryPointType = utils.isEntryPoint(moduleInfoMap[m].blockName);
        if (entryPointType) {
            entryPoints[entryPointType][m] = entryPoints.pw[m] = [];
            buildEntryPoint(modules, m, entryPoints[entryPointType][m]);
        }
    }

    // (wrappers) * (pages) * (langs) * (deps) * (techs) === (files)
    async.forEachOf(entryPoints.w, (wrapperDeps, wrapperPath, wrapperNext) => {
        let wrapperName = moduleInfoMap[wrapperPath].catName + '/' + moduleInfoMap[wrapperPath].blockName;
        async.forEachOf(entryPoints.pw, (pageDeps, pagePath, pageNext) => {
            let pageName = moduleInfoMap[pagePath].catName + '/' + moduleInfoMap[pagePath].blockName;
            async.each(config.buildLangs, (localeName, localeNext) => {
                let exitPoint = exitPoints[pageName + '+' + wrapperName + ':' + localeName] = new Map();
                // localeName is a language of the building
                // langName is a language of the file
                async.each(['', localeName || null], (langName, langNext) => {
                    if (langName === null) return langNext();
                    if (!langName && config.buildLangs.indexOf(langName) === -1) return langNext();
                    async.eachSeries(pageDeps, (dep, depNext) => {
                        let moduleInfo = utils.getModuleInfo(dep);
                        moduleInfo.langName = langName;
                        async.each(config.buildTechs, (techName, techNext) => {
                            moduleInfo.techName = techName;
                            let filePath = path.join(config.rootDir, utils.generateFilePath(moduleInfo));
                            if (utils.isExcluded(filePath, config.excludePath)) {
                                techNext();
                            } else if (~config.buildLoaders.indexOf(techName)) {
                                fs.readFile(filePath, 'utf8', (error, content) => {
                                    if (error === 'ENOENT') {
                                        exitPoint.set(filePath, undefined);
                                    } else if (error) {
                                        exitPoint.set(filePath, null);
                                    } else {
                                        exitPoint.set(filePath, content);
                                    }
                                    files.set(filePath, exitPoint.get(filePath));
                                    techNext();
                                });
                            } else {
                                exitPoint.set(filePath, null);
                                techNext();
                            }
                        }, depNext);
                    }, langNext);
                }, localeNext);
            }, pageNext);
        }, wrapperNext);
    }, error => {
        next(error, utils.deepFreeze(modules), files, exitPoints);
    });
};

function buildEntryPoint (modules, modulePath, entryPoint) {
    let moduleDeps = modules[modulePath];
    for (let d = 0, dl = moduleDeps.length; d < dl; d++) {
        let depPath = moduleDeps[d];
        if (!~entryPoint.indexOf(depPath)) {
            entryPoint.push(depPath);
            if (modules[depPath] && modules[depPath].length) buildEntryPoint(modules, depPath, entryPoint);
        }
    }
};
