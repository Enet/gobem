'use strict';

let fs = require('fs-extra'),
    async = require('async'),
    path = require('path');

module.exports = function (next, config, modules, exitPoints) {

    let instructions = config.buildInstructions.map(makeInstruction),
        output = {
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
            output.exitPoints[exitPointName] = [];
            let storages = {0: new Map()};
            storages.buffer = new Map();

            for (let f of exitPoint.keys()) {
                let filePath = path.relative(config.rootDir, f),
                    fileContent = exitPoint.get(f);
                storages[0].set(filePath, fileContent);
            }
            freezeMap(storages[0]);

            async.forEachOfSeries(instructions, (instruction, i, instructionNext) => {
                let args = instruction.args,
                    command = instruction.command;

                try {
                    var processor = require(instruction.path).apply(processor, args);
                } catch (error) {
                    error.stack = `Processor could not be loaded! (instruction: ${i + 1}, processor: ${command})\n` + error.stack;
                    return instructionNext(error);
                }

                if (instruction.isInternal) return processor(instructionNext, storages, i);

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
                        output.files[path.join(config.overwriteOutput ? '' : exitPointName, e)] = fileContent;
                        output.exitPoints[exitPointName].push(e);
                    }
                }

                exitPointNext(error);
            });
        }, next);
    }, next => {
        async.forEachOf(output.files, (fileContent, filePath, fileNext) => {
            fs.outputFile(path.join(outputPath, filePath), fileContent, fileNext);
        }, next);
    }], error => {
        next(error, output.exitPoints);
    });
};

const internalProcs = ['select', 'write', 'clear', 'debug'];

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
