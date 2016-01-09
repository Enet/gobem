'use strict';

global.__gobem = global.__gobem || {redis: {}};
unwatchProject();

const
    STATE_FREE = 0,
    STATE_READY = 1,
    STATE_BUSY = 2,
    STATE_ERROR = 3;

let path = require('path'),
    async = require('async'),
    chokidar = require('chokidar');

let config = {},
    state = STATE_FREE,
    bid = 0,
    cachedExitPoints = {},
    cachedOutput = {},
    callbacks = [],
    rebuildWatcher,
    rebuildTimer,
    executionTimer,
    errorTimer,
    errorMessage;

module.exports = {
    configure: function (userConfig) {
        module.exports.reset();

        let currentConfig = {};
        userConfig = userConfig || {};

        currentConfig.rootDir = path.normalize(userConfig.rootDir);
        currentConfig.outputDir = path.normalize(userConfig.outputDir || 'output');
        currentConfig.depTech = (userConfig.depTech || 'deps.json') + '';
        if (userConfig.excludePath) {
            if (!(userConfig.excludePath instanceof Array)) userConfig.excludePath = [userConfig.excludePath];
            currentConfig.excludePath = userConfig.excludePath.map(item => item instanceof RegExp ? item : item + '');
        } else {
            currentConfig.excludePath = [];
        }

        currentConfig.buildLangs = stringifyArray(userConfig.buildLangs);
        currentConfig.buildTechs = stringifyArray(userConfig.buildTechs);
        currentConfig.buildLoaders = stringifyArray(userConfig.buildLoaders);
        if (!currentConfig.buildLangs.length) currentConfig.buildLangs.push('');
        if (!currentConfig.buildLoaders.length) currentConfig.buildLoaders = currentConfig.buildTechs;

        currentConfig.buildInstructions = userConfig.buildInstructions;

        currentConfig.maxExecutionTime = userConfig.maxExecutionTime >= 0 ? userConfig.maxExecutionTime * 1000 : 60000;
        currentConfig.clearOutput = userConfig.clearOutput === undefined ? true : !!userConfig.clearOutput;
        currentConfig.overwriteOutput = userConfig.overwriteOutput === undefined ? true : !!userConfig.overwriteOutput;
        currentConfig.rebuildByWatcher = userConfig.rebuildByWatcher || false;
        currentConfig.rebuildByTimer = (userConfig.rebuildByTimer * 1000) || 0;
        currentConfig.rebuildByError = (userConfig.rebuildByError * 1000) || 20000;
        if (userConfig.rebuildByFile) {
            if (!(userConfig.rebuildByFile instanceof Array)) userConfig.rebuildByFile = [userConfig.rebuildByFile];
            currentConfig.rebuildByFile = userConfig.rebuildByFile.map(filePath => path.join(currentConfig.rootDir, filePath));
        } else {
            userConfig.rebuildByFile = [];
        }

        if (typeof userConfig.beforeBuilding === 'function') currentConfig.beforeBuilding = userConfig.beforeBuilding;
        if (typeof userConfig.afterBuilding === 'function') currentConfig.afterBuilding = userConfig.afterBuilding;

        config = currentConfig;

        watchProject();
        setRebuildTimer();

        return this;
    },

    build: function () {
        let lastBid = ++bid,
            lastCachedExitPoints = cachedExitPoints,
            lastCachedOutput = cachedOutput;

        clearRebuildTimer();
        clearErrorTimer();
        resetResources();

        state = STATE_BUSY;
        errorMessage = undefined;
        clearExecutionTimer();
        setExecutionTimer();

        async.waterfall([function (next) {
            if (config.beforeBuilding) {
                config.beforeBuilding(error => {
                    next(error);
                }, config);
            } else {
                next();
            }
        }, function (next) {
            require(path.join('gobem', 'scanner'))(next, config);
        }, function (deps, next) {
            require(path.join('gobem', 'resolver'))(next, config, deps);
        }, function (modules, next) {
            require(path.join('gobem', 'mapper'))(next, config, modules);
        }, function (modules, files, exitPoints, next) {
            for (let e in exitPoints) {
                cachedExitPoints[e] = Array.from(exitPoints[e].keys());
            }
            require(path.join('gobem', 'builder'))(next, config, modules, files, exitPoints);
        }, function (output, next) {
            if (config.afterBuilding) {
                config.afterBuilding(error => {
                    next(error, output);
                }, config);
            } else {
                next(null, output);
            }
        }], function (error, output) {
            if (lastBid !== bid) return;

            clearExecutionTimer();
            if (error) {
                cachedExitPoints = lastCachedExitPoints;
                cachedOutput = lastCachedOutput;

                errorMessage = error;
                setErrorTimer();
                state = STATE_ERROR;
            } else {
                setRebuildTimer();
                cachedOutput = output;
                state = STATE_READY;
            }

            executeCallbacks();
        });

        return this;
    },

    reset: function () {
        state = STATE_ERROR;
        errorMessage = new Error('Connection was interrupted! (try again)');
        executeCallbacks();

        callbacks = [];
        config = {};
        bid++;
        resetResources();
        unwatchProject();
        clearRebuildTimer();
        clearExecutionTimer();
        clearErrorTimer();
        errorMessage = undefined;
        state = STATE_FREE;
        return this;
    },

    use: function (exitPointName) {
        if (state === STATE_FREE) module.exports.build();
        return new Promise(function (resolve, reject) {
            switch (state) {
                case STATE_READY:
                    resolve(cachedOutput[exitPointName]);
                    break;
                case STATE_ERROR:
                    reject(errorMessage);
                    break;
                default:
                    callbacks.push(function () {
                        if (state === STATE_ERROR) {
                            reject(errorMessage);
                        } else {
                            resolve(cachedOutput[exitPointName]);
                        }
                    });
            }
        });
    },

    status: function () {
        return errorMessage;
    }
};

function executeCallbacks () {
    callbacks.forEach(callback => {
        callback();
    });
};

function resetResources () {
    cachedExitPoints = {};
    cachedOutput = {};
};

function watchProject () {
    let watcherPaths = config.rebuildByFile.slice();
    if (config.rebuildByWatcher) watcherPaths.push(config.rootDir);
    rebuildWatcher = global.__gobem[__filename] = chokidar.watch(watcherPaths, {
        depth: 4,
        ignoreInitial: true
    }).on('all', function onFileChange (event, filePath) {
        if (~config.rebuildByFile.indexOf(filePath)) return module.exports.build();
        for (let e in cachedExitPoints) {
            if (~cachedExitPoints[e].indexOf(filePath)) return module.exports.build();
        }
    });
};

function unwatchProject () {
    global.__gobem[__filename] && global.__gobem[__filename].close();
};

function setRebuildTimer () {
    if (config.rebuildByTimer) {
        rebuildTimer = setTimeout(module.exports.build, config.rebuildByTimer);
    }
};

function clearRebuildTimer () {
    clearTimeout(rebuildTimer);
};

function setExecutionTimer () {
    if (config.maxExecutionTime) {
        executionTimer = setTimeout(function () {
            bid++;
            module.exports.build();
        }, config.maxExecutionTime);
    }
};

function clearExecutionTimer () {
    clearTimeout(executionTimer);
};

function setErrorTimer () {
    clearRebuildTimer();
    errorTimer = setTimeout(module.exports.build, config.rebuildByError);
};

function clearErrorTimer () {
    clearTimeout(errorTimer);
};

function deepFreeze (object) {
    for (var o in object) {
        if (typeof object[o] === 'object') deepFreeze(object[o]);
    }
    return Object.freeze(object);
};

function stringifyArray (array) {
    return array instanceof Array ? array.map(item => item + '') : [];
};
