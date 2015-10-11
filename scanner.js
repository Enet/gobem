'use strict';

let fs = require('fs'),
    path = require('path'),
    async = require('async'),
    utils = require('gobem/utils'),
    depTech,
    excludePath;

module.exports = function (next, config) {
    excludePath = config.excludePath;
    depTech = config.depTech;

    scanFolder(config.rootDir, config.rootDir, (error, depFiles) => {
        next(error, utils.deepFreeze(depFiles));
    });
};

function calcDepth (relPath) {
    let depth = 0,
        lastIndex = -path.sep.length;
    while (~(lastIndex = relPath.indexOf(path.sep, lastIndex + path.sep.length))) {
        depth++;
    }
    return depth;
};

function scanFolder (rootDir, currentDir, callback) {
    let relCurrentDir = path.relative(rootDir, currentDir),
        depthLevel = calcDepth(relCurrentDir);

    if (depthLevel > 3) return callback(null, {});

    async.waterfall([next => {
        fs.readdir(currentDir, next);
    }, (fileNames, next) => {
        let fileStorage = {};
        async.eachSeries(fileNames, (fileName, n) => {
            let filePath = path.join(currentDir, fileName),
                relFilePath = path.relative(rootDir, filePath),
                next = (error, results) => {
                    for (let r in results) {
                        fileStorage[r] = results[r];
                    }
                    n(error);
                };

            if (utils.isExcluded(relFilePath, excludePath)) return next(null, {});
            fs.stat(filePath, (error, fileStats) => {
                if (error) return next(error);
                if (fileStats.isDirectory()) {
                    if (depthLevel === 0 && utils.isEntryPoint(fileName)) {
                        fileStorage[path.join(relFilePath, fileName + '.' + depTech)] = '{}';
                    }
                    scanFolder(rootDir, filePath, next);
                } else if (depthLevel >= 1 && fileName.slice(-1 - depTech.length) === '.' + depTech) {
                    fs.readFile(filePath, 'utf8', (error, fileContent) => {
                        next(error, {[relFilePath]: fileContent});
                    });
                } else {
                    next(null, {});
                }
            });
        }, error => {
            next(error, fileStorage);
        });
    }], (error, depFiles) => {
        callback(error, depFiles);
    });
};
