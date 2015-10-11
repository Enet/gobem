'use strict';

let fs = require('fs'),
    async = require('async'),
    path = require('path'),
    utils = require('gobem/utils');

module.exports = function (next, config, modules) {
    let moduleInfoMap = {},
        entryPoints = {
            p: {}, // pages
            w: {}, // wrappers
            pw: {} // pages + wrappers
        },
        pages = {};

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
        let wrapperName = moduleInfoMap[wrapperPath].catName + '*' + moduleInfoMap[wrapperPath].blockName;
        async.forEachOf(entryPoints.pw, (pageDeps, pagePath, pageNext) => {
            let pageName = moduleInfoMap[pagePath].catName + '*' + moduleInfoMap[pagePath].blockName,
                deps = mergeDeps(wrapperDeps, pageDeps);
            async.each(config.buildLangs, (langName, langNext) => {
                let page = pages[pageName + '+' + wrapperName + ':' + langName] = new Map();
                async.eachSeries(deps, (dep, depNext) => {
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
                                    page.set(filePath, undefined);
                                } else if (error) {
                                    page.set(filePath, null);
                                } else {
                                    page.set(filePath, content);
                                }
                                techNext();
                            });
                        } else {
                            page.set(filePath, null);
                            techNext();
                        }
                    }, depNext);
                }, langNext);
            }, pageNext);
        }, wrapperNext);
    }, error => {
        next(error, utils.deepFreeze(modules), pages);
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

function mergeDeps (wrapperDeps, pageDeps) {
    return wrapperDeps === pageDeps ? wrapperDeps : pageDeps.filter(item => !~wrapperDeps.indexOf(item));
};
