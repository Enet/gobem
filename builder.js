'use strict';

let fs = require('fs-extra'),
    async = require('async'),
    path = require('path');

module.exports = function (next, config, modules, files, exitPoints) {
    let output = {
            files: {},
            exitPoints: {}
        },
        outputPath = path.join(config.rootDir, config.outputDir);

    async.series([next => {
        if (config.clearOutput) {
            async.series([
                fs.remove.bind(fs, outputPath),
                fs.mkdirs.bind(fs, outputPath)
            ], next);
        } else {
            next();
        }
    }, next => {
        async.forEachOf(exitPoints, (exitPoint, exitPointName, exitPointNext) => {
            output.exitPoints[exitPointName] = {};
            let storages = {0: new Map()},
                instructions = typeof config.buildInstructions === 'function' ? config.buildInstructions(exitPointName) : config.buildInstructions;

            instructions = (instructions instanceof Array ? instructions : []).map(makeInstruction);
            storages.buffer = new Map();

            for (let f of exitPoint.keys()) {
                let filePath = path.relative(config.rootDir, f),
                    fileContent = exitPoint.get(f);
                storages[0].set(filePath, fileContent);
            }
            freezeMap(storages[0]);

            async.forEachOfSeries(instructions, (instruction, i, instructionNext) => {
                let args = instruction.args,
                    command = instruction.command,
                    context = {
                        config,
                        modules,
                        files,
                        exitPoint: exitPointName
                    };

                try {
                    var processor = require(instruction.path).apply(context, args);
                } catch (error) {
                    error.stack = `Processor could not be loaded! (instruction: ${i + 1}, processor: ${command})\n` + error.stack;
                    return instructionNext(error);
                }

                if (instruction.isInternal) return processor(instructionNext, storages, i, exitPoint);

                let output = new Map(),
                    buffer = storages.buffer;
                freezeMap(buffer);
                async.eachSeries(['before', 'process', 'after'], (fnName, fnNext) => {
                    if (typeof processor[fnName] === 'function') {
                        if (fnName === 'process') {
                            async.eachSeries(Array.from(buffer.keys()), (itemPath, itemNext) => {
                                let item = buffer.get(itemPath);
                                processor.process(itemNext, buffer, output, config, item, itemPath);
                            }, fnNext);
                        } else {
                            processor[fnName](fnNext, buffer, output, config);
                        }
                    } else {
                        fnNext(null);
                    }
                }, error => {
                    function clearNext (error) {
                        if (error && error.stack) error.stack = `Error occured during processing! (line: ${i + 1}, processor: ${command})\n${error.stack}`;
                        storages.buffer = output;
                        instructionNext(error);
                    };
                    if (error || typeof processor.clear !== 'function') {
                        clearNext(error);
                    } else {
                        processor.clear(clearNext, buffer, output, config);
                    }
                });
            }, error => {
                delete storages.buffer;
                let storageKeys = Object.keys(storages),
                    exitPointOutput = storages[Math.max.apply(Math, storageKeys)];

                for (let e of exitPointOutput.keys()) {
                    let fileContent = exitPointOutput.get(e);
                    if (typeof fileContent === 'string') {
                        output.exitPoints[exitPointName][e] = fileContent;
                    }
                }

                exitPointNext(error);
            });
        }, next);
    }, next => {
        async.forEachOf(output.exitPoints, (exitPoint, exitPointName, exitPointNext) => {
            let exitPointComponents = exitPointName.replace(/:$/, '').split('+'),
                pageName = exitPointComponents[0],
                wrapperName = exitPointComponents[1];
            async.forEachOf(exitPoint, (fileContent, filePath, fileNext) => {
                if (pageName === wrapperName || typeof output.exitPoints[wrapperName + '+' + wrapperName + ':'][filePath] !== 'string') {
                    fs.outputFile(path.join(outputPath, config.overwriteOutput ? '' : exitPointName, filePath), fileContent, fileNext);
                } else {
                    delete output.exitPoints[exitPointName][filePath];
                    fileNext();
                }
            }, exitPointNext);

        }, next);
    }], error => {
        for (let e in output.exitPoints) {
            output.exitPoints[e] = Object.keys(output.exitPoints[e]);
        }
        next(error, output.exitPoints);
    });
};

const internalProcs = ['select', 'write', 'clear', 'debug', 'call'];

function makeInstruction (args) {
    if (!(args instanceof Array)) args = [args + ''];
    let isInternal = !!~internalProcs.indexOf(args[0]);
    return {
        command: args[0],
        path: isInternal ? path.join('gobem', 'procs', args[0]) : args[0],
        args: args.slice(1),
        isInternal
    };
};

function freezeMap (map) {
    map.set = map.delete = () => {};
};
