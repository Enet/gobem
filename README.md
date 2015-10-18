# gobem
This npm-module is a builder for SPA BEM projects. It has a lot of options and does the following:
* scans a root folder to find files describing dependencies *(scanner.js)*;
* resolves dependencies and forms the list of modules *(resolver.js)*;
* forms the list of files for each entry point and loads ones *(mapper.js)*;
* processes files and writes them to the disk *(builder.js)*.

## Terminology
Just try to read all the material and construct in your head the vision how it works.

### File Structure
What does mean BEM project? It means, that files are located like in the tree below:
```
root/
- - components/
- - - - w-app/
- - - - - - elem/
- - - - - - - - elem.html
- - - - - - - - elem_color_red.styl
- - - - - - w-app.deps.json
- - - - - - w-app.html
- - - - - - w-app.js
- - - - - - w-app_disabled.js
- - - - - - w-app_size_big.styl
- - scripts/
- - - - jquery/
- - - - - - jquery.js
```

As you can see the project has the strong file structure:
* categories (components, scripts);
* blocks (w-app, jquery);
* elements (w-app_\_elem);
* modifiers (w-app_size_big, w-app_\_elem_color_red, w-app_disabled).

### Filename's Components
Let's analyze a filename `components/w-app/elem/elem_color_red:en.deps.json`:
* `components` is a **categorie's name**;
* `w-app` is a **block's name**;
* `elem` is an **elem's name**;
* `color` is a **modifier's name**;
* `red` is a **modifier's value**;
* `en` is a **language**;
* `deps.json` is a so-called file's **technology**;
* `json` is a file's **extension**.

All files of the project should be named according with these rules.

### Entry and Exit Points
> Blocks, which name starts with `p-` (pages) or `w-` (wrappers) are called **entry points**. Its are roots of module's dependencies. Typical names for entry points are `p-profile`, `p-info`, `w-app` or `w-landing`.

> When pages, wrappers and languages intersect each other, we get **exit points**. Exit points are independent and **gobem** builds files of each one. Typical names for exit points are `components/p-info+components/w-app:` or `components/w-app+components/w-app:en`.

Build process is independent for each exit point! The amount of output files could be calculated as:<br>
`(files) = (wrappers) * (pages) * (langs) * (deps) * (techs)`<br>
Of course the real number is less, because not all files exist.

### Modules and Files
Module is an abstract entity: block, element or modifier. For example this is a module's path: `components/w-app/elem`.

If **gobem** has configuration with three languages and three technologies:
```javascript
config.buildLangs = ['', 'ru', 'en'];
config.buildTechs = ['js', 'css', 'html'];
```
then **1 module** will be mapped with **9 files**:
* components/w-app/elem.js
* components/w-app/elem.css
* components/w-app/elem.html
* components/w-app/elem:ru.js
* components/w-app/elem:ru.css
* components/w-app/elem:ru.html
* components/w-app/elem:en.js
* components/w-app/elem:en.css
* components/w-app/elem:en.html

### Wrappers, Pages, Singletons, Blocks
The client-side architecture of any well-designed single page application consists of the following block's types:
* **wrapper** (prefix `w-`)<br>
Constant block, which manages pages inside itself. It loads necessary resources (styles, scripts, templates, etc) and changes the content of page's container. Wrapper is a singleton, loaded only once.
* **page** (prefix `p-`)<br>
Just a regular block. Any page could be loaded many times.
* **singleton** (prefix `s-`)<br>
Singleton is a block, loaded only once with wrapper.
* **block** (prefix `b-`)<br>
Just a regular block, which could be used and loaded as much as you want.

|type| is singleton |is entry point|
|:--:|:------------:|:------------:|
|w-  |yes           |yes           |
|p-  |no            |yes           |
|s-  |yes           |no            |
|b-  |no            |no            |

## Configuration
Here are described all configurable parameters for **gobem** npm-module. Containing them object should be passed to `gobem.configure(config)`.

### beforeBuilding<sup>( )</sup>
This function is called each time before rebuilding. It gets two arguments: `next` and `config`. An example given:
```javascript
config.beforeBuilding = function (next, config) {
    let filePath = path.join(config.rootDir, 'file.txt');
    fs.readFile(filePath, 'utf-8', (error, content) => {
        app.setFileContent(content);
        next(error);
    });
};
```

### afterBuilding<sup>( )</sup>
This function is the same as `beforeBuilding()`, but called after each rebuilding.

### rootDir<sup>abc</sup>
Root directory should be an **absolute** path to the folder, containing project files.

### outputDir<sup>abc</sup>
Output directory should be a **relative** path to the folder, where resulting files will be saved. By default is equal `output`.

### buildInstructions<sup>[ ]</sup>
An array of instructions, which will be executed during each rebuilding. Each instruction is an array too, which contains a name of a processor and arguments for a function-constructor. Example given:
```javascript
config.buildInstructions = [
    ['select', 0, /\.js$/],
    ['write', 1]
];
```

### excludePath<sup>[ ]</sup>
If you want to exclude some folders or files from your project, point this fact here. All paths should be **relative**. If you have only one file to exclude, string could be passed.

### depTech<sup>abc</sup>
This is a technology of files, which contain exhaustive information about dependencies. By default is `deps.json`.

### buildLangs<sup>[ ]</sup>
An array of the languages, which should be built. By default is `['']` (only not localized files will be built).

### buildTechs<sup>[ ]</sup>
An array of the technologies, which should be built. By default is `[]` (nothing will be built).

### buildLoaders<sup>[ ]</sup>
An array of the technologies, which should be loaded in the memory. By default is equal to `buildTechs` (all technologies will be loaded). Not loaded files is processed too, but their content is equal `null`. You are able to load ones by your preferred way inside a processor.

This feature is needed, for example, to prevent loading *.node.js files (usually we use `require` to connect npm-modules).

### maxExecutionTime<sup>123</sup>
This number is an upper time limit of the build process (in seconds). Default value is `60` seconds. `0` means there is no limit.

### clearOutput<sup>!!</sup>
This boolean flag says, that **gobem** should clear previous output, before start writing the current one. Default value is `true`.

### overwriteOutput<sup>!!</sup>
This boolean flag says, that **gobem** should overwrite existing files. If `true` all files are stored to the same folder, if `false` then files are divided into directories by exit points.

For example:
```
// overwriteOutput == false
// (each exit point has own files)
output
- - components/w-app+components/w-app:
- - - - components
- - - - scripts
- - components/p-page+components/w-app:
- - - - components

// overwriteOutput == true
// (files of all exit points are merged)
output
- - components
- - scripts
```

If you use SPDY or HTTP2, it is preferable set `overwriteOutput` to `true`. But be careful: if several exit points have files with the same path and different content, it will be available only one version.

### rebuildByWatcher<sup>!!</sup>
Triggers rebuilding, when any project's file have been changed. By default is `false`.

### rebuildByFile<sup>[ ]</sup>
This is a list of files, where all paths are **relative**. If a file from the list is changed, rebuilding is triggered. By default it's empty array `[]`. In case with one file could be a string.

For example, you can add in this array `build.js` (module, which constructs `buildInstructions`) and rebuild your project immediately after build instructions have been changed.

### rebuildByTimer<sup>123</sup>
The time in seconds between two successful rebuldings. Default value is `0`, what means that the project aren't rebuilt by timer.

### rebuildByError<sup>123</sup>
The time in seconds between two attempts of the rebuilding in case of an error. Default value is `20` seconds.

## Building

### gobem.configure(config<sup>{ }</sup>)
This method configures **gobem**, runs a timer for rebuilding (if one exists), starts watching the files.

Note that `gobem.configure()` don't trigger rebuilding. It is recommended to call `gobem.build()` immediately after configuration.

### gobem.build()
Builds a project, using the last configuration. Usually this method is called automatically.

### gobem.use(exitPointName<sup>abc</sup>)
Returns a promise. Resolve function gets an array with files of the required exit point. If error occured in the build process, promise will be rejected with error `gobem.status()`.

### gobem.reset()
Resets **gobem** to initial state. This method is always called before the configuration.

### gobem.status()
Returns an error, that occured in the build process. If a project has built successfully, `null` will be returned.

## Processing
Processor is an entity, which gets one file's map and returns another one. The most of processor's methods have the same arguments:
* **next<sup>( )</sup>**<br>
All methods are asynchronous. After processing data it needed to call this function (first argument is error).
* **input<sup>Map</sup>**<br>
Read-only map, where keys are file's paths and values are file's contents.
```javascript
input.get('components/w-app/elem/elem.js');
```
* **output<sup>Map</sup>**<br>
Output map is the place, where all results should be stored.
```javascript
output.set(filePath, '"use strict";\n' + fileContent);
```
* **config<sup>{ }</sup>**<br>
Initial **gobem** config.

### processor = require(name)(arg1, arg2, ...)
Each processor is a separate npm-module. This module should export a factory-function, which returns required processor. The factory gets arguments from `buildInstructions`. An example given how to create the empty processor:
```javascript
module.exports = function (arg1, arg2) {
    return {};
};
```

### processor.before(next<sup>( )</sup>, in<sup>Map</sup>, out<sup>Map</sup>, config<sup>{ }</sup>)
This method is called before processing (once per exit point).

### processor.process(next<sup>( )</sup>, in<sup>Map</sup>, out<sup>Map</sup>, config<sup>{ }</sup>, content<sup>abc</sup>, path<sup>abc</sup>)
This method is called for each file of a current exit point. Pay attention, that `path` always is a string with file's path, but `content` could be different.
* Usually it is a string, containing file's content.
* If file doesn't exist, `content` is `undefined`.
* If file has technology, not specified in `buildLoaders`, `content` will be equal `null` (it means **gobem** even didn't try to load file).

### processor.after(next<sup>( )</sup>, in<sup>Map</sup>, out<sup>Map</sup>, config<sup>{ }</sup>)
This method is called only after **successful** processing (once per exit point).

### processor.clear(next<sup>( )</sup>, in<sup>Map</sup>, out<sup>Map</sup>, config<sup>{ }</sup>)
This method is **always** called after processing has finished (once per exit point). Its goal to release using resources.

## Build Instructions
An array `buildInstructions` says to **gobem** how to build each exit point. It means **gobem** applies the same instructions to each exit point.

Each instruction from this array contains as the first argument the name of the processor, which should be used. Except processors, installed in the directory `node_modules`, you are able to use some internal processors. Usually they work with virtual storages.

What are virtual storages? 0-storage is read-only, it's source files of exit point. Then **gobem** copies files from one storage to another, processes ones, clears some storages and finally gets output - resulting files. But what is the output? It is the storage with a maximal id.

Obligatorily see an example in the end of section, how `buildInstructions` work! Below are described all internal processors of **gobem**:

### select storage<sup>123</sup> regexp<sup>/.*/</sup>
Copies files, whose paths satisfy the regular expression `regexp`, from the `storage` to the buffer. By default `regexp` is `.*`, that means all files are matched.

### write storage<sup>123</sup>
Writes all files from the buffer to the `storage`.

### clear storage<sup>123</sup>
Deletes all files of the `storage`.

### debug callback<sup>( )</sup> exitPointName<sup>abc</sup>
Passes iterable keys and values to `callback`. If `exitPointName` is specified, then this processor works only for one exit point.

```javascript
// abstract example of an array with build instructions
config.buildInstructions = [
    ['select', 0, /^[^.]+\.lib\.js$/],
    ['gobem-proc-js-minify'],
    ['write', 1],

    ['select', 0, /^[^.]+\.es6\.js$/],
    ['gobem-proc-babel'],
    ['write', 1],

    ['select', 1],
    ['gobem-proc-wrap-script'],
    ['write', 2],

    ['clear', 1],
    ['select', 0, /^[^.]+\.lib\.css$/],
    ['write', 1],

    ['select', 0, /^[^.]+\.styl$/],
    ['debug', keys => console.log(Array.from(keys)), 'modules/w-app+modules/w-app:'],
    ['gobem-proc-stylus'],
    ['write', 1],

    ['select', 1],
    ['gobem-proc-css-minify'],
    ['write', 2]
];
// storage 2 is an output
```

## *.deps.json
To describe dependencies between modules, it is used `deps.json` technology. Below is how to specify dependencies, using this format:
```
/* w-app.deps.json */
{
    "components": [
        "_size_big",
        "__border",
        "_color_red",
        "b-block",
        "_disabled"
    ],
    "scripts": ["jquery"],
    "services": ["timer", "ajax"]
}

/* will be transformed to the following modules */
components/w-app_size_big
components/w-app/border
components/w-app/border_color_red
components/b-block
components/b-block_disabled
scripts/jquery
services/timer
services/ajax
```

## Usage example
[Here](https://github.com/Enet/demo-es2015) is a repository, which can help you to understand, how it works.
