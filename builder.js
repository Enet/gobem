'use strict';

let fs = require('fs-extra'),
    async = require('async'),
    path = require('path'),
    processors = {};

module.exports = function (next, config, modules, exitPoints) {
    fs.readFile(path.join(config.rootDir, config.buildFile), 'utf8', (error, content) => {
        if (error) {
            error.stack = `Build file can not be readed! (file: ${config.buildFile})\n` + error.stack;
            return next(error);
        }

        content = content
            .replace(/\/\/.*$/gm, '') // remove comments
            .replace(/\\\//gm, '/') // replace escaped /
            .replace(/\\\\/gm, '\\') // replace escaped \
            .replace(/(^\s+(?!\n)|\s+(?!\n)$)/gm, '') // smart trim
            .split('\n') // each line is a command
            .map(figureOutInstruction);

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
                output.exitPoints[exitPointName] = [];
                let buffer = new Map(),
                    storages = {0: new Map()};

                for (let f of exitPoint.keys()) {
                    buffer.set(path.relative(config.rootDir, f), exitPoint.get(f));
                }

                copyFiles(buffer, storages[0]);
                freezeMap(storages[0]);

                async.forEachOfSeries(content, (instruction, i, instructionNext) => {
                    let args = instruction.args,
                        command = instruction.command,
                        storageNumber = +args[0], // usually args[0] is a number of storage
                        incorrectStorageError = new Error(`Incorrect storage number! (line: ${i + 1}, command: ${command})`);

                    args.config = config;
                    args.modules = modules;
                    args.exitPoint = exitPointName;
                    switch (command) {
                        case 'select':
                            if (isNaN(storageNumber)) return instructionNext(incorrectStorageError);

                            try {
                                var re = new RegExp(args[1] || '.*');
                            } catch (error) {
                                return instructionNext(new Error(`Incorrect regexp! (line: ${i + 1}, command: ${command})`));
                            }

                            let storage = storages[storageNumber] || new Map();
                            buffer = new Map();
                            for (let s of storage.keys()) {
                                if (re.test(s)) buffer.set(s, storage.get(s));
                            }
                            instructionNext(null);
                            break;
                        case 'process':
                            try {
                                var processor = requireProcessor(args[0]);
                                processor = processor.apply(processor, config.extraArguments);
                            } catch (error) {
                                error.stack = `Processor could not be loaded! (line: ${i + 1}, processor: ${args[0]})\n` + error.stack;
                                return instructionNext(error);
                            }

                            let output = new Map();
                            freezeMap(buffer);
                            async.eachSeries(['before', 'process', 'after'], (fnName, fnNext) => {
                                if (typeof processor[fnName] === 'function') {
                                    if (fnName === 'process') {
                                        async.eachSeries(Array.from(buffer.keys()), (itemPath, itemNext) => {
                                            let item = buffer.get(itemPath);
                                            processor.process(itemNext, buffer, output, args, item, itemPath);
                                        }, fnNext);
                                    } else {
                                        processor[fnName](fnNext, buffer, output, args);
                                    }
                                } else {
                                    fnNext(null);
                                }
                            }, error => {
                                function clearNext (error) {
                                    if (error && error.stack) error.stack = `Error occured during processing! (line: ${i + 1}, processor: ${args[0]})\n${error.stack}`;
                                    buffer = output;
                                    instructionNext(error);
                                };
                                if (error || typeof processor.clear !== 'function') {
                                    clearNext(error);
                                } else {
                                    processor.clear(clearNext, buffer, output, args);
                                }
                            });
                            break;
                        case 'write':
                        case 'clear':
                            if (!storageNumber) return instructionNext(incorrectStorageError);

                            if (instruction.command === 'write') {
                                copyFiles(buffer, storages[storageNumber] = storages[storageNumber] || new Map());
                            } else {
                                storages[storageNumber] = new Map();
                                buffer = new Map();
                            }
                            instructionNext(null);
                            break;
                        case 'list':
                        case 'print':
                            if (!args[0] || args[0] === exitPointName) console.log(instruction.command === 'list' ? Array.from(buffer.keys()) : buffer);
                            instructionNext(null);
                            break;
                        default:
                            instructionNext(command ? new Error(`Unknown instruction! (line: ${i + 1}, command: ${command})`) : null);
                    }
                }, error => {
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

    });
};

function figureOutInstruction (line) {
    line = ' ' + line + ' ';
    line = line
        .replace(/".*?[^\\]"|'.*?[^\\]'/g, match => match.replace(/\s/g, String.fromCharCode(0))) // replace whitespaces within quotes
        .trim()
        .replace(/\s+/g, ' ') // replace double whitespaces
        .split(' ')
        .map(item => {
            return item
                .replace(new RegExp(String.fromCharCode(0), 'g'), ' ') // replace 0-chars to whitespaces (inside quotes)
                .replace(/^(["'])(.*)\1$/, '$2'); // remove quotes
        });

    if (line[1]) line[1] = line[1].toLowerCase();
    return {
        command: line[0].toLowerCase(),
        args: line.slice(1)
    };
};

function freezeMap (map) {
    Object.defineProperties(map, {
        set: {value: () => {}},
        delete: {value: () => {}}
    });
};

function copyFiles (from, to) {
    if (!to || !(to instanceof Map)) to = new Map();
    for (let f of from.keys()) {
        to.set(f, from.get(f));
    }
    return to;
};

function requireProcessor (processorName) {
    return processors[processorName] = processors[processorName] || require(processorName);
};
